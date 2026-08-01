-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00028 : programmation des rappels
--
-- CE QUE FAIT CETTE MIGRATION
-- Les types de rappel existaient et se réglaient déjà, mais rien ne les
-- programmait : un parent pouvait choisir « la veille » sans jamais rien
-- recevoir. Un réglage sans effet est pire qu'un réglage absent.
--
-- IDEMPOTENCE
-- La tâche s'exécute chaque jour et repasse sur les mêmes événements. Sans
-- garde-fou, un rendez-vous produirait un rappel par jour jusqu'à sa date.
-- Une contrainte d'unicité sur (destinataire, type, entité) rend l'opération
-- rejouable : programmer deux fois le même rappel ne crée rien de plus, et
-- déplacer l'événement met à jour l'heure au lieu d'ajouter une ligne.
--
-- DÉLAI PROPRE À CHAQUE PARENT
-- L'un veut être prévenu la veille, l'autre une heure avant. Chaque
-- destinataire reçoit donc son propre horaire, calculé depuis son réglage.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Unicité des rappels ----------
-- Un seul rappel par destinataire, par type et par entité concernée.
-- Les notifications ordinaires (ajout, suppression) ne sont pas concernées :
-- elles relatent un fait daté, et deux faits distincts peuvent porter sur la
-- même entité.
create unique index if not exists uq_rappel_par_entite
  on notifications (profile_id, kind, entity_id)
  where entity_id is not null
    and kind in ('appointment_reminder', 'custody_change', 'holiday_start', 'holiday_end');

-- ---------- 2. Programmation d'un rappel ----------
-- Rejouable : si le rappel existe déjà, son heure est ajustée. S'il a été lu,
-- on n'y touche plus — sauf si l'événement a été déplacé, auquel cas le parent
-- doit être prévenu à nouveau.
create or replace function public.programmer_rappel(
  p_household   uuid,
  p_type        text,
  p_destinataire uuid,
  p_titre       text,
  p_corps       text,
  p_href        text,
  p_entity      text,
  p_entity_id   uuid,
  p_quand       timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare t notification_types%rowtype; actif boolean; existant notifications%rowtype;
begin
  select * into t from notification_types where code = p_type and active and est_rappel;
  if not found then return false; end if;

  -- Un rappel dont l'heure est déjà passée n'a plus d'objet
  if p_quand is null or p_quand <= now() then return false; end if;

  -- Le destinataire doit pouvoir le lire : un profil provisoire n'a pas de compte
  if not exists (
    select 1 from household_members hm join profiles p on p.id = hm.profile_id
    where hm.household_id = p_household and hm.profile_id = p_destinataire
      and hm.deleted_at is null and p.deleted_at is null
      and coalesce(p.is_placeholder, false) = false
  ) then return false; end if;

  select np.enabled into actif
    from notification_preferences np
   where np.profile_id = p_destinataire and np.household_id = p_household
     and np.kind = p_type and np.channel = 'internal'::notif_channel;
  if actif is null then actif := t.defaut_actif; end if;
  if not actif then return false; end if;

  select * into existant from notifications
   where profile_id = p_destinataire and kind = p_type and entity_id = p_entity_id;

  if existant.id is not null then
    -- Même heure : rien à faire, la tâche est simplement repassée
    if existant.scheduled_at = p_quand and existant.title = p_titre then
      return false;
    end if;
    -- L'événement a bougé : on réactive le rappel, le parent doit le revoir
    update notifications
       set title = p_titre, body = p_corps, scheduled_at = p_quand,
           link_path = p_href, read_at = null
     where id = existant.id;
    return true;
  end if;

  insert into notifications (household_id, profile_id, kind, title, body,
                             link_path, entity, entity_id, scheduled_at)
  values (p_household, p_destinataire, p_type, p_titre, p_corps,
          p_href, p_entity, p_entity_id, p_quand);
  return true;
end $$;

-- ---------- 3. Rappels des rendez-vous ----------
-- Parcourt les rendez-vous à venir et programme un rappel par parent, selon
-- le délai que chacun a choisi.
create or replace function public.programmer_rappels_rendez_vous(p_household uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare r record; m record; delai int; quand timestamptz; n int := 0; affaires text;
begin
  for r in
    select a.id, a.title, a.starts_at, a.location, a.all_day,
           (select string_agg(ch.first_name, ', ' order by ch.first_name)
              from appointment_children ac join children ch on ch.id = ac.child_id
             where ac.appointment_id = a.id) as enfants,
           (select string_agg(pi.label, ', ' order by pi.created_at)
              from packing_items pi
             where pi.appointment_id = a.id and pi.deleted_at is null
               and not pi.coche) as a_prevoir
    from appointments a
    where a.household_id = p_household
      and a.deleted_at is null
      and a.starts_at > now()
      and a.starts_at < now() + interval '30 days'
  loop
    for m in
      select hm.profile_id from household_members hm
      join profiles p on p.id = hm.profile_id
      where hm.household_id = p_household and hm.deleted_at is null
        and p.deleted_at is null and coalesce(p.is_placeholder, false) = false
    loop
      select coalesce(rs.minutes_avant, 60) into delai
        from (select 1) x
        left join reminder_settings rs
          on rs.profile_id = m.profile_id and rs.household_id = p_household;

      quand := r.starts_at - make_interval(mins => delai);

      -- Les affaires non cochées sont rappelées : c'est tout l'intérêt du
      -- rappel — « n'oublie pas son cartable ».
      affaires := case when r.a_prevoir is not null
                       then format(' À prévoir : %s.', r.a_prevoir) else '' end;

      if public.programmer_rappel(
        p_household, 'appointment_reminder', m.profile_id,
        r.title,
        format('%s%s%s.%s',
               coalesce(r.enfants || ' · ', ''),
               case when r.all_day then 'Toute la journée'
                    else to_char(r.starts_at, 'HH24h MI') end,
               coalesce(' · ' || r.location, ''),
               affaires),
        '/app/rendez-vous', 'appointment', r.id, quand)
      then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- ---------- 4. Rappels de vacances ----------
-- Début et fin d'une période : deux moments qui changent l'organisation.
create or replace function public.programmer_rappels_vacances(p_household uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare e record; m record; delai int; n int := 0; parent text; libelle text;
begin
  for e in
    select ce.id, ce.starts_at, ce.ends_at, ce.parent_id, ce.title, ce.kind,
           (select first_name from children c where c.id = ce.child_id) as enfant
    from custody_exceptions ce
    where ce.household_id = p_household
      and ce.deleted_at is null
      and ce.kind = 'holiday'
      and ce.ends_at > now()
      and ce.starts_at < now() + interval '60 days'
  loop
    select display_name into parent from profiles where id = e.parent_id;
    libelle := coalesce(e.title, 'Vacances');

    for m in
      select hm.profile_id from household_members hm
      join profiles p on p.id = hm.profile_id
      where hm.household_id = p_household and hm.deleted_at is null
        and p.deleted_at is null and coalesce(p.is_placeholder, false) = false
    loop
      select coalesce(rs.minutes_avant, 60) into delai
        from (select 1) x
        left join reminder_settings rs
          on rs.profile_id = m.profile_id and rs.household_id = p_household;

      if e.starts_at > now() then
        if public.programmer_rappel(
          p_household, 'holiday_start', m.profile_id,
          format('%s : début demain', libelle),
          format('%s sera chez %s à partir du %s.',
                 e.enfant, parent, to_char(e.starts_at, 'DD/MM')),
          '/app/planning', 'custody_exception', e.id,
          e.starts_at - make_interval(mins => delai))
        then n := n + 1; end if;
      end if;

      if e.ends_at > now() then
        if public.programmer_rappel(
          p_household, 'holiday_end', m.profile_id,
          format('%s : fin proche', libelle),
          format('Retour au rythme habituel après le %s.', to_char(e.ends_at, 'DD/MM')),
          '/app/planning', 'custody_exception', e.id,
          e.ends_at - make_interval(mins => delai))
        then n := n + 1; end if;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- ---------- 5. Rappel de changement de garde ----------
-- Le calcul du planning vit dans le moteur applicatif, éprouvé par ses tests.
-- La tâche lui transmet la date et le parent qui accueille ; la base se borne
-- à programmer le rappel.
create or replace function public.programmer_rappel_changement(
  p_household uuid, p_date date, p_parent_accueil uuid, p_heure time default null
) returns int
language plpgsql security definer set search_path = public as $$
declare m record; delai int; quand timestamptz; n int := 0; parent text;
begin
  select display_name into parent from profiles where id = p_parent_accueil;
  if parent is null then return 0; end if;

  for m in
    select hm.profile_id from household_members hm
    join profiles p on p.id = hm.profile_id
    where hm.household_id = p_household and hm.deleted_at is null
      and p.deleted_at is null and coalesce(p.is_placeholder, false) = false
  loop
    select coalesce(rs.minutes_avant, 60) into delai
      from (select 1) x
      left join reminder_settings rs
        on rs.profile_id = m.profile_id and rs.household_id = p_household;

    -- Sans heure de passage convenue, le rappel vise le matin
    quand := (p_date + coalesce(p_heure, time '08:00'))::timestamptz
             - make_interval(mins => delai);

    -- L'identifiant d'entité encode la date : un changement par jour au plus,
    -- et le rappel de demain ne remplace pas celui de la semaine prochaine.
    if public.programmer_rappel(
      p_household, 'custody_change', m.profile_id,
      'Changement de garde',
      format('Les enfants passent chez %s le %s%s.', parent,
             to_char(p_date, 'DD/MM'),
             coalesce(' à ' || to_char(p_heure, 'HH24h MI'), '')),
      '/app/planning', 'custody_change',
      public.uuid_du_jour(p_household, p_date), quand)
    then n := n + 1; end if;
  end loop;
  return n;
end $$;

/**
 * Identifiant stable dérivé d'un foyer et d'une date.
 * Permet de rendre le rappel de changement idempotent sans table dédiée.
 */
create or replace function public.uuid_du_jour(p_household uuid, p_date date)
returns uuid
language sql immutable as $$
  select md5(p_household::text || '|' || p_date::text)::uuid
$$;

-- ---------- 6. Nettoyage ----------
-- Les rappels devenus sans objet — événement supprimé ou déplacé plus tôt —
-- ne doivent pas rester en attente.
create or replace function public.purger_rappels_obsoletes(p_household uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from notifications nt
   where nt.household_id = p_household
     and nt.kind in ('appointment_reminder', 'holiday_start', 'holiday_end')
     and nt.read_at is null
     and nt.scheduled_at > now()
     and (
       (nt.entity = 'appointment' and not exists (
          select 1 from appointments a
           where a.id = nt.entity_id and a.deleted_at is null))
       or (nt.entity = 'custody_exception' and not exists (
          select 1 from custody_exceptions ce
           where ce.id = nt.entity_id and ce.deleted_at is null))
     );
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 7. Droits ----------
-- Ces fonctions sont appelées par la tâche planifiée, qui s'exécute sans
-- utilisateur : elles sont réservées au rôle de service.
revoke all on function public.programmer_rappel(uuid, text, uuid, text, text, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.programmer_rappels_rendez_vous(uuid) from public, anon, authenticated;
revoke all on function public.programmer_rappels_vacances(uuid) from public, anon, authenticated;
revoke all on function public.programmer_rappel_changement(uuid, date, uuid, time) from public, anon, authenticated;
revoke all on function public.purger_rappels_obsoletes(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.programmer_rappel(uuid, text, uuid, text, text, text, text, uuid, timestamptz) to service_role';
    execute 'grant execute on function public.programmer_rappels_rendez_vous(uuid) to service_role';
    execute 'grant execute on function public.programmer_rappels_vacances(uuid) to service_role';
    execute 'grant execute on function public.programmer_rappel_changement(uuid, date, uuid, time) to service_role';
    execute 'grant execute on function public.purger_rappels_obsoletes(uuid) to service_role';
    execute 'grant select on public.households, public.custody_rules, public.custody_exceptions,'
         || ' public.appointments, public.packing_items, public.children,'
         || ' public.household_members, public.profiles, public.reminder_settings'
         || ' to service_role';
  end if;
end $$;

commit;
