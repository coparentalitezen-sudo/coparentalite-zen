-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00030 : notifications poussées
--
-- La table push_subscriptions existait depuis la migration 00025 : le canal
-- Push était prévu dès la conception, sans qu'aucun envoi soit tenté. Cette
-- migration l'active et fournit les fonctions d'enregistrement et de suivi.
--
-- Un abonnement appartient à un APPAREIL, pas à un compte : un parent peut
-- consulter l'application depuis son téléphone et sa tablette, et doit être
-- alerté sur les deux.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Activation du canal ----------
update notification_channels set active = true where code = 'push';

-- ---------- 2. Enregistrement d'un appareil ----------
create or replace function public.enregistrer_appareil_push(
  p_endpoint text, p_p256dh text, p_auth text, p_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_endpoint), '') = '' or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth), '') = '' then
    raise exception 'Abonnement incomplet';
  end if;

  -- Le même appareil peut se réabonner après une réinstallation : on met à
  -- jour plutôt que d'accumuler des abonnements morts.
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (auth.uid(), trim(p_endpoint), trim(p_p256dh), trim(p_auth), p_agent, now())
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    last_used_at = now(),
    deleted_at = null
  returning id into rid;
  return rid;
end $$;

create or replace function public.oublier_appareil_push(p_endpoint text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update push_subscriptions set deleted_at = now()
   where endpoint = p_endpoint and profile_id = auth.uid();
end $$;

/** Cet appareil est-il déjà abonné ? Sert à afficher l'état réel du réglage. */
create or replace function public.appareil_push_abonne(p_endpoint text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from push_subscriptions
     where endpoint = p_endpoint and profile_id = auth.uid() and deleted_at is null
  )
$$;

-- ---------- 3. File d'envoi ----------
-- Les notifications dues, non encore poussées, dont le destinataire a activé
-- le canal Push et possède au moins un appareil.
create or replace function public.notifications_a_pousser(p_limite int default 100)
returns table (
  notification_id uuid,
  profile_id uuid,
  titre text,
  corps text,
  href text,
  endpoint text,
  p256dh text,
  auth text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.profile_id, n.title, n.body, n.link_path,
         s.endpoint, s.p256dh, s.auth
  from notifications n
  join notification_types t on t.code = n.kind
  join push_subscriptions s
    on s.profile_id = n.profile_id and s.deleted_at is null
  where n.scheduled_at <= now()
    and n.read_at is null
    -- Une alerte vieille de plus d'un jour n'a plus d'objet
    and n.scheduled_at > now() - interval '24 hours'
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
$$;

/** Trace d'acheminement : évite de pousser deux fois la même notification. */
create or replace function public.tracer_envoi_push(
  p_notification uuid, p_statut text, p_message text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_deliveries (notification_id, channel_code, statut, message)
  values (p_notification, 'push', p_statut, left(p_message, 300))
  on conflict (notification_id, channel_code) do update set
    statut = excluded.statut, message = excluded.message, attempted_at = now();
end $$;

-- ---------- 4. Droits ----------
revoke all on function public.enregistrer_appareil_push(text, text, text, text) from public, anon;
revoke all on function public.oublier_appareil_push(text) from public, anon;
revoke all on function public.appareil_push_abonne(text) from public, anon;
revoke all on function public.notifications_a_pousser(int) from public, anon, authenticated;
revoke all on function public.tracer_envoi_push(uuid, text, text) from public, anon, authenticated;

grant execute on function public.enregistrer_appareil_push(text, text, text, text) to authenticated;
grant execute on function public.oublier_appareil_push(text) to authenticated;
grant execute on function public.appareil_push_abonne(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.notifications_a_pousser(int) to service_role';
    execute 'grant execute on function public.tracer_envoi_push(uuid, text, text) to service_role';
    execute 'grant select on public.push_subscriptions, public.notification_deliveries to service_role';
    execute 'grant update on public.push_subscriptions to service_role';
  end if;
end $$;

commit;
