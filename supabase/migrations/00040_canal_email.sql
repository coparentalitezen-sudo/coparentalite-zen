-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00040 : canal e-mail
--
-- BESOIN
-- Le moteur de notifications compte trois canaux depuis la migration 00025 :
-- application, notification poussée, courriel. Le troisième était déclaré mais
-- inactif — préparé, jamais branché.
--
-- Il n'est pas redondant avec les deux autres. La notification poussée
-- n'atteint pas un parent qui n'a pas installé l'application, ni celui qui a
-- refusé les autorisations. Or les alertes qui comptent — un changement de
-- garde, une dépense à valider — doivent parvenir aux deux parents, sans quoi
-- l'un reproche à l'autre un silence dont l'application est seule responsable.
--
-- MÊME GRAMMAIRE QUE LE PUSH
-- Les fonctions reprennent trait pour trait celles de la migration 00030 :
-- mêmes préférences par type et par foyer, même péremption de vingt-quatre
-- heures, même trace d'acheminement empêchant le double envoi. Un parent qui
-- a coupé un type de notification le coupe donc partout.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

update notification_channels set active = true where code = 'email';

/**
 * Notifications restant à envoyer par courriel.
 *
 * L'adresse vient du profil. Un compte supprimé porte une adresse en
 * @compte-supprime.invalid : l'écarter évite d'écrire à un fantôme, et
 * d'entretenir une réputation d'expéditeur détestable auprès des messageries.
 */
create or replace function public.notifications_a_envoyer_email(p_limite int default 100)
returns table (
  id uuid,
  profile_id uuid,
  destinataire text,
  prenom text,
  titre text,
  corps text,
  href text
)
language sql stable security definer set search_path = public as $$
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
$$;

/** Trace d'acheminement : évite d'écrire deux fois la même chose. */
create or replace function public.tracer_envoi_email(
  p_notification uuid, p_statut text, p_message text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_deliveries (notification_id, channel_code, statut, message)
  values (p_notification, 'email', p_statut, left(p_message, 300))
  on conflict (notification_id, channel_code) do update set
    statut = excluded.statut, message = excluded.message, attempted_at = now();
end $$;

revoke all on function public.notifications_a_envoyer_email(int) from public, anon, authenticated;
revoke all on function public.tracer_envoi_email(uuid, text, text) from public, anon, authenticated;

-- Sans cette concession explicite, la tâche nocturne échoue en silence : le
-- défaut s'est déjà produit trois fois dans ce projet.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.notifications_a_envoyer_email(int) to service_role';
    execute 'grant execute on function public.tracer_envoi_email(uuid, text, text) to service_role';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
