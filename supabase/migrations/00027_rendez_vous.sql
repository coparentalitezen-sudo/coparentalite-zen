-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00027 : rendez-vous et affaires à prévoir
--
-- CE QU'EST UN RENDEZ-VOUS
-- Un moment précis concernant un enfant : dentiste, réunion parents-professeurs,
-- match, anniversaire. Il se SUPERPOSE au planning sans jamais le modifier.
--
-- Un rendez-vous chez le dentiste un mercredi ne change pas chez quel parent
-- l'enfant dort. C'est la différence essentielle avec une exception de garde :
-- celle-ci attribue la garde, le rendez-vous l'informe. Les confondre reviendrait
-- à déplacer un enfant chaque fois qu'on note une consultation.
--
-- QUI ACCOMPAGNE
-- Souvent le parent gardien, mais pas toujours : un parent peut emmener
-- l'enfant chez le médecin un jour où il n'est pas chez lui. Le champ est donc
-- explicite, avec le parent gardien comme simple proposition.
--
-- AFFAIRES À PRÉVOIR
-- « N'oublie pas son cartable. » Ces listes servent autant aux rendez-vous
-- qu'aux changements de garde — c'est même au moment du passage d'un parent à
-- l'autre qu'on oublie le plus. Elles sont donc attachables aux deux.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Catégories de rendez-vous ----------
-- Extensible par une ligne, comme les types d'exception.
create table if not exists appointment_categories (
  code        text primary key,
  label       text not null,
  icon        text,
  color       text,
  -- Affaires proposées par défaut pour cette catégorie
  affaires_suggerees text[],
  sort_order  smallint not null default 100,
  active      boolean not null default true
);

insert into appointment_categories (code, label, icon, color, affaires_suggerees, sort_order) values
  ('sante', 'Santé', 'sante', '#B3423A',
   array['Carte Vitale', 'Carnet de santé', 'Ordonnance'], 10),
  ('ecole', 'École', 'ecole', '#2C5FA8',
   array['Cartable', 'Carnet de correspondance', 'Devoirs signés'], 20),
  ('sport', 'Sport et activités', 'sport', '#1F7A45',
   array['Tenue de sport', 'Chaussures', 'Gourde'], 30),
  ('famille', 'Famille et amis', 'famille', '#6741B8',
   array['Cadeau'], 40),
  ('autre', 'Autre', 'calendrier', '#4E6381', null, 50)
on conflict (code) do update set
  label = excluded.label, icon = excluded.icon, color = excluded.color,
  affaires_suggerees = excluded.affaires_suggerees, sort_order = excluded.sort_order;

-- ---------- 2. Rendez-vous ----------
create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id),
  category      text not null references appointment_categories(code),
  title         text not null,
  starts_at     timestamptz not null,
  -- Null pour un rendez-vous sans durée connue
  ends_at       timestamptz,
  all_day       boolean not null default false,
  location      text,
  note          text,
  -- Parent qui accompagne ; null = celui qui a la garde ce jour-là
  accompagnant  uuid references profiles(id),
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint appointments_duree check (ends_at is null or ends_at >= starts_at)
);

create index if not exists idx_rdv_foyer
  on appointments (household_id, starts_at) where deleted_at is null;

-- Enfants concernés : un rendez-vous peut en concerner plusieurs
create table if not exists appointment_children (
  appointment_id uuid not null references appointments(id) on delete cascade,
  child_id       uuid not null references children(id),
  primary key (appointment_id, child_id)
);

-- ---------- 3. Affaires à prévoir ----------
-- Attachables à un rendez-vous OU à une date de changement de garde.
create table if not exists packing_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id),
  label          text not null,
  -- L'un des deux est renseigné, jamais les deux
  appointment_id uuid references appointments(id) on delete cascade,
  -- Rappel récurrent attaché à un jour de la semaine (0 = dimanche)
  jour_semaine   smallint check (jour_semaine between 0 and 6),
  child_id       uuid references children(id),
  coche          boolean not null default false,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint packing_rattachement check (
    (appointment_id is not null and jour_semaine is null)
    or (appointment_id is null and jour_semaine is not null)
  )
);

create index if not exists idx_packing_rdv
  on packing_items (appointment_id) where deleted_at is null;
create index if not exists idx_packing_jour
  on packing_items (household_id, jour_semaine) where deleted_at is null and jour_semaine is not null;

-- ---------- 4. Types de notification ----------
insert into notification_types
  (code, label, description, categorie, defaut_actif, est_rappel, sort_order)
values
  ('appointment_created', 'Nouveau rendez-vous',
   'Un rendez-vous vient d''être ajouté au planning.',
   'planning', true, false, 15),
  ('appointment_updated', 'Rendez-vous modifié',
   'La date, l''heure ou le lieu d''un rendez-vous a changé.',
   'planning', true, false, 16),
  ('appointment_deleted', 'Rendez-vous annulé',
   'Un rendez-vous a été retiré du planning.',
   'planning', true, false, 17),
  ('appointment_reminder', 'Rappel de rendez-vous',
   'Rappel avant un rendez-vous, avec les affaires à prévoir.',
   'planning', true, true, 18)
on conflict (code) do update set
  label = excluded.label, description = excluded.description,
  categorie = excluded.categorie, est_rappel = excluded.est_rappel,
  sort_order = excluded.sort_order;

-- ---------- 5. Création ----------
create or replace function public.create_appointment(
  p_household   uuid,
  p_category    text,
  p_title       text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz default null,
  p_all_day     boolean default false,
  p_location    text default null,
  p_note        text default null,
  p_accompagnant uuid default null,
  p_child_ids   uuid[] default null,
  p_affaires    text[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; c uuid; a text; n_children int; prenoms text; libelle text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Donnez un intitulé au rendez-vous';
  end if;
  if p_starts_at is null then
    raise exception 'Indiquez la date et l''heure du rendez-vous';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'La fin ne peut pas précéder le début';
  end if;
  select label into libelle from appointment_categories where code = p_category and active;
  if libelle is null then
    raise exception 'Catégorie de rendez-vous inconnue';
  end if;
  if p_accompagnant is not null and not public.est_comptable(p_household, p_accompagnant) then
    raise exception 'L''accompagnant doit être l''un des deux parents du foyer';
  end if;
  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'Indiquez quel enfant est concerné';
  end if;
  select count(*) into n_children from children
   where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
  if n_children <> array_length(p_child_ids, 1) then
    raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
  end if;
  -- Un rendez-vous n'attribue pas la garde : l'horizon du planning ne s'y
  -- applique donc pas. Noter une consultation ne consomme aucun droit.

  insert into appointments (household_id, category, title, starts_at, ends_at,
                            all_day, location, note, accompagnant, created_by)
  values (p_household, p_category, trim(p_title), p_starts_at, p_ends_at,
          coalesce(p_all_day, false), nullif(trim(p_location), ''),
          nullif(trim(p_note), ''), p_accompagnant, auth.uid())
  returning id into rid;

  foreach c in array p_child_ids loop
    insert into appointment_children (appointment_id, child_id) values (rid, c)
    on conflict do nothing;
  end loop;

  if p_affaires is not null then
    foreach a in array p_affaires loop
      if coalesce(trim(a), '') <> '' then
        insert into packing_items (household_id, label, appointment_id, created_by)
        values (p_household, trim(a), rid, auth.uid());
      end if;
    end loop;
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, auth.uid(), 'create', 'appointment', rid,
          jsonb_build_object('title', p_title, 'starts_at', p_starts_at));

  select string_agg(first_name, ', ' order by first_name) into prenoms
    from children where id = any(p_child_ids);

  perform public.notifier(
    p_household, 'appointment_created',
    trim(p_title),
    format('%s · %s%s', prenoms,
           to_char(p_starts_at, 'DD/MM à HH24h MI'),
           coalesce(' · ' || nullif(trim(p_location), ''), '')),
    '/app/rendez-vous', 'appointment', rid, auth.uid());

  return rid;
end $$;

-- ---------- 6. Lecture ----------
create or replace function public.list_appointments(
  p_household uuid, p_from date, p_to date
) returns table (
  id uuid, categorie text, categorie_label text, icone text, couleur text,
  titre text, debut timestamptz, fin timestamptz, journee_entiere boolean,
  lieu text, note text,
  accompagnant uuid, accompagnant_nom text,
  enfants text, enfant_ids uuid[],
  affaires text[], affaires_cochees int, affaires_total int,
  cree_par uuid
)
language sql stable security definer set search_path = public as $$
  select a.id, a.category, c.label, c.icon, c.color,
         a.title, a.starts_at, a.ends_at, a.all_day,
         a.location, a.note,
         a.accompagnant,
         (select p.display_name from profiles p where p.id = a.accompagnant),
         (select string_agg(ch.first_name, ', ' order by ch.first_name)
            from appointment_children ac
            join children ch on ch.id = ac.child_id
           where ac.appointment_id = a.id),
         (select array_agg(ac.child_id) from appointment_children ac
           where ac.appointment_id = a.id),
         (select array_agg(pi.label order by pi.created_at)
            from packing_items pi
           where pi.appointment_id = a.id and pi.deleted_at is null),
         (select count(*)::int from packing_items pi
           where pi.appointment_id = a.id and pi.deleted_at is null and pi.coche),
         (select count(*)::int from packing_items pi
           where pi.appointment_id = a.id and pi.deleted_at is null),
         a.created_by
  from appointments a
  join appointment_categories c on c.code = a.category
  where a.household_id = p_household
    and a.deleted_at is null
    and public.is_member(p_household)
    and a.starts_at >= (p_from::timestamptz)
    and a.starts_at <  ((p_to + 1)::timestamptz)
  order by a.starts_at
$$;

create or replace function public.categories_rendez_vous()
returns table (code text, libelle text, icone text, couleur text,
               suggestions text[], ordre smallint)
language sql stable security definer set search_path = public as $$
  select c.code, c.label, c.icon, c.color, c.affaires_suggerees, c.sort_order
  from appointment_categories c where c.active order by c.sort_order
$$;

-- ---------- 7. Modification et suppression ----------
create or replace function public.update_appointment(
  p_id uuid, p_title text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_location text default null,
  p_note text default null, p_accompagnant uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into a from appointments where id = p_id and deleted_at is null;
  if not found then raise exception 'Ce rendez-vous n''existe plus'; end if;
  if not public.can_write(a.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Donnez un intitulé au rendez-vous';
  end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'La fin ne peut pas précéder le début';
  end if;

  update appointments set
    title = trim(p_title), starts_at = p_starts_at, ends_at = p_ends_at,
    location = nullif(trim(p_location), ''), note = nullif(trim(p_note), ''),
    accompagnant = p_accompagnant, updated_at = now()
  where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (a.household_id, auth.uid(), 'update', 'appointment', p_id,
          jsonb_build_object('title', a.title, 'starts_at', a.starts_at),
          jsonb_build_object('title', p_title, 'starts_at', p_starts_at));

  -- On ne prévient que si la date a changé : une correction de faute de frappe
  -- n'a pas à déclencher une alerte.
  if a.starts_at <> p_starts_at then
    perform public.notifier(
      a.household_id, 'appointment_updated',
      format('%s déplacé', trim(p_title)),
      format('Désormais le %s.', to_char(p_starts_at, 'DD/MM à HH24h MI')),
      '/app/rendez-vous', 'appointment', p_id, auth.uid());
  end if;
end $$;

create or replace function public.delete_appointment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into a from appointments where id = p_id and deleted_at is null;
  if not found then raise exception 'Ce rendez-vous n''existe plus'; end if;
  if not public.can_write(a.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;

  update appointments set deleted_at = now() where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (a.household_id, auth.uid(), 'delete', 'appointment', p_id,
          jsonb_build_object('title', a.title, 'starts_at', a.starts_at));

  perform public.notifier(
    a.household_id, 'appointment_deleted',
    format('%s annulé', a.title),
    format('Était prévu le %s.', to_char(a.starts_at, 'DD/MM à HH24h MI')),
    '/app/rendez-vous', 'appointment', p_id, auth.uid());
end $$;

-- ---------- 8. Affaires à prévoir ----------
create or replace function public.ajouter_affaire(
  p_household uuid, p_label text,
  p_appointment uuid default null, p_jour smallint default null,
  p_child uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Indiquez ce qu''il ne faut pas oublier';
  end if;
  if (p_appointment is null) = (p_jour is null) then
    raise exception 'Rattachez l''affaire à un rendez-vous ou à un jour de la semaine';
  end if;

  insert into packing_items (household_id, label, appointment_id, jour_semaine, child_id, created_by)
  values (p_household, trim(p_label), p_appointment, p_jour, p_child, auth.uid())
  returning id into rid;
  return rid;
end $$;

create or replace function public.cocher_affaire(p_id uuid, p_coche boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select household_id into hid from packing_items where id = p_id and deleted_at is null;
  if hid is null then raise exception 'Cette affaire n''existe plus'; end if;
  if not public.can_write(hid) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  update packing_items set coche = coalesce(p_coche, false) where id = p_id;
end $$;

create or replace function public.supprimer_affaire(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select household_id into hid from packing_items where id = p_id and deleted_at is null;
  if hid is null then raise exception 'Cette affaire n''existe plus'; end if;
  if not public.can_write(hid) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  update packing_items set deleted_at = now() where id = p_id;
end $$;

/**
 * Affaires récurrentes d'un jour de la semaine.
 * « Le lundi, ne pas oublier le sac de piscine. »
 */
create or replace function public.affaires_recurrentes(p_household uuid)
returns table (id uuid, libelle text, jour smallint, enfant_id uuid, enfant text)
language sql stable security definer set search_path = public as $$
  select pi.id, pi.label, pi.jour_semaine, pi.child_id,
         (select ch.first_name from children ch where ch.id = pi.child_id)
  from packing_items pi
  where pi.household_id = p_household
    and pi.deleted_at is null
    and pi.jour_semaine is not null
    and public.is_member(p_household)
  order by pi.jour_semaine, pi.created_at
$$;

-- ---------- 9. Sécurité ----------
alter table appointment_categories enable row level security;
alter table appointments           enable row level security;
alter table appointment_children   enable row level security;
alter table packing_items          enable row level security;

drop policy if exists rdv_cat_read on appointment_categories;
create policy rdv_cat_read on appointment_categories for select using (active);

drop policy if exists rdv_read on appointments;
create policy rdv_read on appointments for select
  using (public.is_member(household_id) and deleted_at is null);

drop policy if exists rdv_enfants_read on appointment_children;
create policy rdv_enfants_read on appointment_children for select
  using (exists (select 1 from appointments a
                 where a.id = appointment_id and public.is_member(a.household_id)));

drop policy if exists packing_read on packing_items;
create policy packing_read on packing_items for select
  using (public.is_member(household_id) and deleted_at is null);

revoke insert, update, delete on appointments, appointment_children,
  packing_items, appointment_categories from public, anon, authenticated;

grant select on appointment_categories, appointments, appointment_children,
  packing_items to authenticated;

revoke all on function public.create_appointment(uuid, text, text, timestamptz, timestamptz, boolean, text, text, uuid, uuid[], text[]) from public, anon;
revoke all on function public.update_appointment(uuid, text, timestamptz, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.delete_appointment(uuid) from public, anon;
revoke all on function public.list_appointments(uuid, date, date) from public, anon;
revoke all on function public.categories_rendez_vous() from public, anon;
revoke all on function public.ajouter_affaire(uuid, text, uuid, smallint, uuid) from public, anon;
revoke all on function public.cocher_affaire(uuid, boolean) from public, anon;
revoke all on function public.supprimer_affaire(uuid) from public, anon;
revoke all on function public.affaires_recurrentes(uuid) from public, anon;

grant execute on function public.create_appointment(uuid, text, text, timestamptz, timestamptz, boolean, text, text, uuid, uuid[], text[]) to authenticated;
grant execute on function public.update_appointment(uuid, text, timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.delete_appointment(uuid) to authenticated;
grant execute on function public.list_appointments(uuid, date, date) to authenticated;
grant execute on function public.categories_rendez_vous() to authenticated;
grant execute on function public.ajouter_affaire(uuid, text, uuid, smallint, uuid) to authenticated;
grant execute on function public.cocher_affaire(uuid, boolean) to authenticated;
grant execute on function public.supprimer_affaire(uuid) to authenticated;
grant execute on function public.affaires_recurrentes(uuid) to authenticated;

commit;
