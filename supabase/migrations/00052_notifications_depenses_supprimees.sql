-- 00052_notifications_depenses_supprimees.sql
-- Corrige deux manques repérés lors de l'audit de la suppression des dépenses :
--   1. supprimer une dépense (y compris déjà validée) ne prévenait pas l'autre parent ;
--   2. les notifications pointant vers une dépense supprimée restaient affichées
--      (« Crampons validée » alors que la dépense n'existe plus) — 7 lignes en base.
-- Généralise le filet de sécurité posé en 00051 pour les rendez-vous.
--
-- À exécuter dans le SQL Editor Supabase (projet terjitzvmalggytqpjpc).

-- 1. Nouveau type de notification.
insert into notification_types (code, label, description, categorie, defaut_actif, est_rappel, sort_order, active)
values ('expense_deleted', 'Dépense supprimée',
        'L''autre parent a supprimé une dépense du foyer.',
        'depenses', true, false, 85, true)
on conflict (code) do nothing;

-- 2. Validité générale d'une notification : elle n'a plus d'objet si l'élément
--    qu'elle désigne a disparu. Les notifications d'annulation font exception,
--    elles doivent justement survivre à la suppression.
create or replace function public.notification_valide(
  p_kind text, p_entity text, p_entity_id uuid, p_scheduled timestamptz
) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_kind in ('expense_deleted', 'appointment_deleted', 'event_deleted') then true
    when p_entity is null or p_entity_id is null then true
    when p_entity = 'appointment' and p_kind = 'appointment_reminder'
      then public.rappel_rdv_valide('appointment', p_entity_id, p_scheduled)
    when p_entity = 'appointment'
      then exists (select 1 from appointments a
                    where a.id = p_entity_id and a.deleted_at is null)
    when p_entity = 'expense'
      then exists (select 1 from expenses e
                    where e.id = p_entity_id and e.deleted_at is null)
    when p_entity = 'custody_exception'
      then exists (select 1 from custody_exceptions ce
                    where ce.id = p_entity_id and ce.deleted_at is null)
    else true
  end
$$;

grant execute on function public.notification_valide(text, text, uuid, timestamptz) to authenticated, service_role;

-- 3. Suppression d'une dépense : on retire les notifications devenues fausses
--    et on prévient l'autre parent, en précisant si la dépense était validée.
create or replace function public.trg_notifier_depense_supprimee()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare payeur text; precision_statut text;
begin
  if new.deleted_at is null or old.deleted_at is not null then return new; end if;

  -- « Crampons validée » n'a plus de sens si la dépense n'existe plus
  delete from notifications
   where entity = 'expense' and entity_id = new.id
     and kind <> 'expense_deleted';

  select display_name into payeur from profiles where id = new.paid_by;

  precision_statut := case
    when old.status in ('validated', 'partially_validated') then ' après avoir été validée'
    when old.status = 'disputed' then ' alors qu''elle était contestée'
    else '' end;

  perform public.notifier(
    new.household_id, 'expense_deleted',
    format('%s supprimée', new.title),
    format('%s payé par %s : cette dépense a été supprimée%s.',
           public.format_cents(new.amount_cents),
           coalesce(payeur, 'l''autre parent'),
           precision_statut),
    '/app/depenses', 'expense', new.id, auth.uid());
  return new;
end $function$;

drop trigger if exists notifier_depense_supprimee on public.expenses;
create trigger notifier_depense_supprimee
after update on public.expenses
for each row execute function public.trg_notifier_depense_supprimee();

-- 4. Symétrie côté rendez-vous : un RDV annulé ne laisse aucune notification
--    orpheline dans la cloche (00051 ne nettoyait que les rappels).
create or replace function public.trg_sync_rappels_rendez_vous()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from notifications
     where entity = 'appointment' and entity_id = old.id
       and kind <> 'appointment_deleted';
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

  -- RDV annulé
  if new.deleted_at is not null then
    delete from notifications
     where entity = 'appointment' and entity_id = new.id
       and kind <> 'appointment_deleted';
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

-- 5. Filet de sécurité généralisé : rien d'orphelin n'est affiché, compté,
--    poussé ou envoyé par email.
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
    and public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at)
    and (not p_non_lues or n.read_at is null)
  order by n.scheduled_at desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$function$;

create or replace function public.compter_notifications_non_lues(p_household uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int
  from notifications n
  where n.profile_id = auth.uid()
    and n.household_id = p_household
    and public.is_member(p_household)
    and n.read_at is null
    and n.scheduled_at <= now()
    and public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at)
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
             and n2.scheduled_at <= now()
             and public.notification_valide(n2.kind, n2.entity, n2.entity_id, n2.scheduled_at)) as non_lues
  from notifications n
  join notification_types t on t.code = n.kind
  join households h on h.id = n.household_id and h.deleted_at is null
  join push_subscriptions s
    on s.profile_id = n.profile_id and s.deleted_at is null
  where n.scheduled_at <= now()
    and n.read_at is null
    and n.scheduled_at > now() - interval '24 hours'
    and public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at)
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
    and public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at)
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

-- 6. Rattrapage des notifications déjà orphelines (7 lignes attendues côté dépenses).
delete from notifications n
 where not public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at);

-- 7. Vérification en une passe.
select 'fonctions' as objet,
       string_agg(p.proname, ', ' order by p.proname) as detail
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public'
   and p.proname in ('notification_valide', 'trg_notifier_depense_supprimee',
                     'trg_sync_rappels_rendez_vous', 'mes_notifications',
                     'compter_notifications_non_lues', 'notifications_a_pousser',
                     'notifications_a_envoyer_email', 'rappel_rdv_valide')
union all
select 'trigger', trigger_name from information_schema.triggers
 where trigger_schema = 'public' and trigger_name = 'notifier_depense_supprimee'
union all
select 'type', code from notification_types where code = 'expense_deleted'
union all
select 'grants notification_valide',
       coalesce(array_to_string(p.proacl::text[], ' | '), 'default')
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'notification_valide'
union all
select 'orphelines restantes', count(*)::text from notifications n
 where not public.notification_valide(n.kind, n.entity, n.entity_id, n.scheduled_at);
