-- 00051_rappels_rdv_synchronises.sql
-- Corrige : un rendez-vous supprimé ou déplacé laissait son rappel en base,
-- qui se déclenchait ensuite à l'ancienne heure (le cron ne repasse que sur
-- les RDV situés dans les 30 prochains jours, et la purge ignorait les
-- rappels déjà affichés ou déjà lus).
-- DÉJÀ APPLIQUÉE EN PRODUCTION le 06/09/2026 — ce fichier sert au suivi.

-- 1. Un rappel de rendez-vous ne vaut que si le RDV existe toujours et que
--    l'heure du rappel correspond encore au RDV (délai max autorisé : 1440 min).
create or replace function public.rappel_rdv_valide(
  p_entity text, p_entity_id uuid, p_scheduled timestamptz
) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_entity is distinct from 'appointment' then true
    else exists (
      select 1 from appointments a
       where a.id = p_entity_id
         and a.deleted_at is null
         and p_scheduled <= a.starts_at
         and p_scheduled >= a.starts_at - interval '24 hours'
    )
  end
$$;

grant execute on function public.rappel_rdv_valide(text, uuid, timestamptz) to authenticated, service_role;

-- 2. Purge élargie : un RDV supprimé ou déplacé ne doit plus laisser de rappel,
--    même si celui-ci est déjà affiché ou déjà lu.
create or replace function public.purger_rappels_obsoletes(p_household uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  delete from notifications nt
   where nt.household_id = p_household
     and nt.kind in ('appointment_reminder', 'holiday_start', 'holiday_end', 'custody_change')
     and (
       (nt.entity = 'appointment'
         and not public.rappel_rdv_valide(nt.entity, nt.entity_id, nt.scheduled_at))
       or (nt.entity = 'custody_exception'
           and nt.read_at is null
           and nt.scheduled_at > now()
           and not exists (
             select 1 from custody_exceptions ce
              where ce.id = nt.entity_id and ce.deleted_at is null))
     );
  get diagnostics n = row_count;
  return n;
end $function$;

-- 3. Synchronisation immédiate : ne pas attendre le cron pour retirer ou
--    reprogrammer les rappels d'un RDV modifié ou supprimé.
create or replace function public.trg_sync_rappels_rendez_vous()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from notifications
     where kind = 'appointment_reminder' and entity = 'appointment' and entity_id = old.id;
    return old;
  end if;

  -- Aucun champ influant sur le rappel n'a bougé
  if new.deleted_at is not distinct from old.deleted_at
     and new.starts_at is not distinct from old.starts_at
     and new.title is not distinct from old.title
     and new.all_day is not distinct from old.all_day
     and new.location is not distinct from old.location then
    return new;
  end if;

  -- RDV annulé : le rappel n'a plus d'objet, même déjà affiché
  if new.deleted_at is not null then
    delete from notifications
     where kind = 'appointment_reminder' and entity = 'appointment' and entity_id = new.id;
    return new;
  end if;

  -- RDV modifié : on retire les rappels devenus faux puis on reprogramme
  delete from notifications nt
   where nt.kind = 'appointment_reminder' and nt.entity = 'appointment'
     and nt.entity_id = new.id
     and not public.rappel_rdv_valide('appointment', new.id, nt.scheduled_at);

  perform public.programmer_rappels_rendez_vous(new.household_id);
  return new;
end $function$;

drop trigger if exists trg_appointments_sync_rappels on public.appointments;
create trigger trg_appointments_sync_rappels
after update or delete on public.appointments
for each row execute function public.trg_sync_rappels_rendez_vous();

-- 4. Filet de sécurité à la lecture et à l'envoi : un rappel désynchronisé
--    n'est ni affiché, ni poussé, ni envoyé par email.
create or replace function public.mes_notifications(
  p_household uuid, p_limite integer DEFAULT 50, p_non_lues boolean DEFAULT false
) returns table(id uuid, type_code text, type_label text, titre text, corps text,
                href text, entite text, entite_id uuid, auteur text,
                programmee_le timestamptz, lue_le timestamptz, creee_le timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select n.id, n.kind, t.label, n.title, n.body,
         n.link_path, n.entity, n.entity_id,
         (select p.display_name from profiles p where p.id = n.actor_id),
         n.scheduled_at, n.read_at, n.created_at
  from notifications n
  join notification_types t on t.code = n.kind
  where n.profile_id = auth.uid()
    and n.household_id = p_household
    and public.is_member(p_household)
    -- Un rappel programmé n'apparaît qu'une fois son heure venue
    and n.scheduled_at <= now()
    and (not t.est_rappel or public.rappel_rdv_valide(n.entity, n.entity_id, n.scheduled_at))
    and (not p_non_lues or n.read_at is null)
  order by n.scheduled_at desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$function$;

create or replace function public.notifications_a_pousser(p_limite integer DEFAULT 100)
returns table(notification_id uuid, profile_id uuid, titre text, corps text, href text,
              endpoint text, p256dh text, auth text, non_lues integer)
language sql stable security definer set search_path to 'public'
as $function$
  select n.id, n.profile_id, n.title, n.body, n.link_path,
         s.endpoint, s.p256dh, s.auth,
         (select count(*)::int
            from notifications n2
            join households h2 on h2.id = n2.household_id
           where n2.profile_id = n.profile_id
             and n2.household_id = n.household_id
             and h2.deleted_at is null
             and n2.read_at is null
             and n2.scheduled_at <= now()) as non_lues
  from notifications n
  join notification_types t on t.code = n.kind
  join households h on h.id = n.household_id and h.deleted_at is null
  join push_subscriptions s
    on s.profile_id = n.profile_id and s.deleted_at is null
  where n.scheduled_at <= now()
    and n.read_at is null
    and n.scheduled_at > now() - interval '24 hours'
    and (not t.est_rappel or public.rappel_rdv_valide(n.entity, n.entity_id, n.scheduled_at))
    and not exists (
      select 1 from notification_deliveries d
       where d.notification_id = n.id and d.channel_code = 'push'
    )
    and coalesce(
      (select np.enabled from notification_preferences np
        where np.profile_id = n.profile_id
          and np.household_id = n.household_id
          and np.kind = n.kind
          and np.channel = 'push'::notif_channel),
      t.defaut_actif)
  order by n.scheduled_at
  limit greatest(1, least(coalesce(p_limite, 100), 500))
$function$;

create or replace function public.notifications_a_envoyer_email(p_limite integer DEFAULT 100)
returns table(id uuid, profile_id uuid, destinataire text, prenom text,
              titre text, corps text, href text)
language sql stable security definer set search_path to 'public'
as $function$
  select n.id, n.profile_id, p.email, p.display_name, n.title, n.body, n.link_path
  from notifications n
  join notification_types t on t.code = n.kind
  join profiles p on p.id = n.profile_id
  where n.scheduled_at <= now()
    and n.read_at is null
    and n.scheduled_at > now() - interval '24 hours'
    and p.deleted_at is null
    and p.email is not null
    and p.email not like '%@compte-supprime.invalid'
    and p.email not like '%@invalide.local'
    and (not t.est_rappel or public.rappel_rdv_valide(n.entity, n.entity_id, n.scheduled_at))
    and not exists (
      select 1 from notification_deliveries d
       where d.notification_id = n.id and d.channel_code = 'email'
    )
    and coalesce(
      (select np.enabled from notification_preferences np
        where np.profile_id = n.profile_id
          and np.household_id = n.household_id
          and np.kind = n.kind
          and np.channel = 'email'::notif_channel),
      t.defaut_actif)
  order by n.scheduled_at
  limit greatest(1, least(coalesce(p_limite, 100), 500))
$function$;

-- 5. Rattrapage ponctuel des rappels déjà désynchronisés (exécuté le 06/09/2026,
--    2 lignes supprimées : les 2 rappels « Dentiste »).
delete from notifications nt
 where nt.kind = 'appointment_reminder'
   and nt.entity = 'appointment'
   and not public.rappel_rdv_valide(nt.entity, nt.entity_id, nt.scheduled_at);
