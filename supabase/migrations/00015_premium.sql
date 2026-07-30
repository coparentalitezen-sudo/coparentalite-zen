-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00015 : offres et horizon de planning
--
-- MODÈLE RETENU
-- L'offre gratuite donne accès au planning sur un HORIZON de 3 mois à compter
-- de la création du foyer. Au-delà, deux voies :
--   * extensions ponctuelles : +1, +6 ou +12 mois, cumulables, définitives ;
--   * abonnement « Zen Plus » : horizon illimité et fonctions avancées.
--
-- L'horizon borne ce qu'on peut CONSULTER et CRÉER dans le futur. Il ne
-- restreint jamais l'accès aux données déjà saisies : un parent doit pouvoir
-- relire son historique et ses justificatifs quoi qu'il arrive. Bloquer
-- l'accès à des pièces qui peuvent servir devant un médiateur serait
-- indéfendable.
--
-- L'autorité est ici, en base. Le client affiche, il ne décide pas.
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Catalogue ----------
-- Les trois plans existent depuis 00003 ; on complète le catalogue avec les
-- extensions ponctuelles, qui ne sont pas des abonnements.
create table if not exists plan_extensions (
  id            text primary key,
  label         text not null,
  months        int  not null check (months > 0),
  price_cents   bigint not null check (price_cents >= 0),
  stripe_price_id text,
  sort_order    smallint not null default 100,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into plan_extensions (id, label, months, price_cents, sort_order) values
  ('ext_1m',  '1 mois supplémentaire',   1,  299, 10),
  ('ext_6m',  '6 mois supplémentaires',  6, 1490, 20),
  ('ext_12m', '12 mois supplémentaires', 12, 2490, 30)
on conflict (id) do nothing;

-- Périodicité rendue explicite : la page commerciale et l'écran d'offre lisent
-- la même source, ce qui évite d'annoncer un tarif et d'en facturer un autre.
alter table plans add column if not exists billing_period text not null default 'month';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plans_billing_period_check') then
    alter table plans add constraint plans_billing_period_check
      check (billing_period in ('month', 'year'));
  end if;
end $$;

-- ---------- 2. Extensions acquises par un foyer ----------
create table if not exists household_extensions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id),
  extension_id  text not null references plan_extensions(id),
  months        int  not null check (months > 0),
  amount_cents  bigint not null check (amount_cents >= 0),
  -- Traçabilité du paiement : permet de rapprocher un litige d'une écriture
  stripe_session_id text unique,
  stripe_payment_intent text,
  granted_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_hext_household
  on household_extensions (household_id, created_at desc);

-- ---------- 3. Journal des événements de facturation ----------
-- Un webhook peut arriver deux fois : l'identifiant d'événement Stripe est
-- unique, ce qui rend le traitement idempotent sans effort côté application.
create table if not exists billing_events (
  id            bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  type          text not null,
  household_id  uuid references households(id),
  payload       jsonb,
  received_at   timestamptz not null default now(),
  -- null tant que le traitement n'a pas abouti : un échec transitoire doit
  -- pouvoir être rejoué par Stripe, sinon un paiement serait perdu.
  processed_at  timestamptz,
  attempts      int not null default 1,
  last_error    text
);
alter table billing_events add column if not exists received_at timestamptz not null default now();
alter table billing_events add column if not exists attempts int not null default 1;
alter table billing_events add column if not exists last_error text;
alter table billing_events alter column processed_at drop not null;

create index if not exists idx_billing_household
  on billing_events (household_id, received_at desc);
create index if not exists idx_billing_a_reprendre
  on billing_events (received_at) where processed_at is null;

-- ---------- 4. Colonnes d'abonnement manquantes ----------
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table subscriptions add column if not exists trial_end timestamptz;
alter table subscriptions add column if not exists stripe_price_id text;

-- ---------- 5. Sécurité : lecture pour les membres, écriture par le serveur ----------
alter table plan_extensions      enable row level security;
alter table household_extensions enable row level security;
alter table billing_events       enable row level security;

drop policy if exists plan_extensions_read on plan_extensions;
create policy plan_extensions_read on plan_extensions for select using (active);

drop policy if exists household_extensions_read on household_extensions;
create policy household_extensions_read on household_extensions for select
  using (public.is_member(household_id));

-- Les événements de facturation ne sont lisibles que par le propriétaire :
-- ils contiennent des identifiants de paiement.
drop policy if exists billing_events_read on billing_events;
create policy billing_events_read on billing_events for select
  using (household_id is not null and public.member_role_in(household_id) in ('owner', 'admin'));

revoke insert, update, delete on plan_extensions      from public, anon, authenticated;
revoke insert, update, delete on household_extensions from public, anon, authenticated;
revoke insert, update, delete on billing_events       from public, anon, authenticated;
revoke insert, update, delete on subscriptions        from public, anon, authenticated;

grant select on plan_extensions, household_extensions, billing_events, subscriptions to authenticated;

-- ---------- 6. Droits du foyer : la source de vérité ----------
-- Trois mois offerts à compter de la création, plus les extensions acquises.
-- Un abonnement actif rend l'horizon illimité.
create or replace function public.household_entitlement(p_household uuid)
returns table (
  plan_id          text,
  plan_label       text,
  prix_cents       bigint,
  periodicite      text,
  illimite         boolean,
  horizon          date,          -- dernier jour couvert ; null si illimité
  jours_restants   int,           -- null si illimité
  mois_offerts     int,
  mois_ajoutes     int,
  abonnement_actif boolean,
  abonnement_fin   timestamptz,
  resiliation_programmee boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  base_mois   int := 3;           -- offre gratuite
  ajoutes     int := 0;
  cree        timestamptz;
  sub         record;
  actif       boolean := false;
  fin         date;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select h.created_at into cree from households h
   where h.id = p_household and h.deleted_at is null;
  if cree is null then raise exception 'Foyer introuvable'; end if;

  select coalesce(sum(e.months), 0)::int into ajoutes
    from household_extensions e where e.household_id = p_household;

  select s.* into sub from subscriptions s where s.household_id = p_household;
  actif := sub.id is not null
       and sub.status in ('active', 'trialing')
       and (sub.current_period_end is null or sub.current_period_end > now());

  if actif then
    return query select
      coalesce(sub.plan_id, 'premium'),
      (select p.name from plans p where p.id = coalesce(sub.plan_id, 'premium')),
      (select p.price_cents_monthly from plans p where p.id = coalesce(sub.plan_id, 'premium')),
      (select p.billing_period from plans p where p.id = coalesce(sub.plan_id, 'premium')),
      true, null::date, null::int, base_mois, ajoutes,
      true, sub.current_period_end, coalesce(sub.cancel_at_period_end, false);
    return;
  end if;

  fin := (cree + make_interval(months => base_mois + ajoutes))::date;
  return query select
    'free',
    (select p.name from plans p where p.id = 'free'),
    (select p.price_cents_monthly from plans p where p.id = 'premium'),
    (select p.billing_period from plans p where p.id = 'premium'),
    false, fin, greatest(0, (fin - current_date))::int, base_mois, ajoutes,
    false, null::timestamptz, false;
end $$;

-- ---------- 7. Contrôle réutilisable par les fonctions d'écriture ----------
-- Renvoie vrai si la date visée est couverte. Utilisé par le planning : on
-- n'empêche jamais de consulter le passé, seulement de planifier au-delà de
-- l'horizon acquis.
create or replace function public.dans_horizon(p_household uuid, p_date date)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ent record;
begin
  select * into ent from public.household_entitlement(p_household);
  if ent.illimite then return true; end if;
  return p_date <= ent.horizon;
end $$;

create or replace function public.exiger_horizon(p_household uuid, p_date date)
returns void
language plpgsql stable security definer set search_path = public as $$
declare ent record;
begin
  select * into ent from public.household_entitlement(p_household);
  if ent.illimite then return; end if;
  if p_date > ent.horizon then
    raise exception 'Votre planning gratuit couvre jusqu''au %. Ajoutez des mois ou passez à Zen Plus pour aller plus loin.',
      to_char(ent.horizon, 'DD/MM/YYYY');
  end if;
end $$;

-- ---------- 8. Application de l'horizon au planning ----------
-- set_custody_rule et create_custody_exception refusent au-delà de l'horizon.
create or replace function public.set_custody_rule(
  p_household   uuid,
  p_pattern     custody_pattern,
  p_start_date  date,
  p_parent1     uuid,
  p_parent2     uuid,
  p_handover_time time default null,
  p_handover_place text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  perform public.lock_household(p_household);
  if p_parent1 = p_parent2 then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if not public.est_comptable(p_household, p_parent1)
     or not public.est_comptable(p_household, p_parent2) then
    raise exception 'Les parents indiqués doivent être les deux parents du foyer';
  end if;
  -- Un rythme démarrant après l'horizon n'aurait aucun effet visible :
  -- mieux vaut l'expliquer que de laisser l'utilisateur croire qu'il a agi.
  perform public.exiger_horizon(p_household, p_start_date);

  update custody_rules set deleted_at = now()
  where household_id = p_household and deleted_at is null;

  insert into custody_rules (household_id, pattern, start_date, starting_parent,
                             handover_time, handover_place, config, created_by)
  values (p_household, p_pattern, p_start_date, p_parent1,
          p_handover_time, p_handover_place,
          jsonb_build_object('parent2', p_parent2), auth.uid())
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'set', 'custody_rule', rid);
  return rid;
end $$;

create or replace function public.create_custody_exception(
  p_household   uuid,
  p_kind        text,
  p_child_ids   uuid[],
  p_parent_id   uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_title       text default null,
  p_note        text default null
) returns setof uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; n_children int; rid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  perform public.lock_household(p_household);

  if p_kind is null or p_kind not in ('holiday', 'swap') then
    raise exception 'Type d''exception non reconnu';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Les dates de début et de fin sont requises';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La fin doit être postérieure au début';
  end if;
  if p_ends_at - p_starts_at > interval '365 days' then
    raise exception 'Une exception ne peut pas dépasser un an';
  end if;
  if not public.est_comptable(p_household, p_parent_id) then
    raise exception 'Le parent gardien doit être l''un des deux parents du foyer';
  end if;
  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'Sélectionnez au moins un enfant';
  end if;
  select count(*) into n_children from children
   where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
  if n_children <> array_length(p_child_ids, 1) then
    raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
  end if;
  perform public.exiger_horizon(p_household, p_ends_at::date);

  foreach c in array p_child_ids loop
    begin
      insert into custody_exceptions (household_id, child_id, parent_id, kind,
                                      starts_at, ends_at, title, note, reason, created_by)
      values (p_household, c, p_parent_id, p_kind, p_starts_at, p_ends_at,
              nullif(trim(p_title), ''), nullif(trim(p_note), ''),
              nullif(trim(p_title), ''), auth.uid())
      returning id into rid;
    exception when exclusion_violation then
      raise exception 'Une période de ce type existe déjà sur ces dates pour % ',
        (select first_name from children where id = c);
    end;

    insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
    values (p_household, auth.uid(), 'create', 'custody_exception', rid,
            jsonb_build_object('kind', p_kind, 'child_id', c, 'parent_id', p_parent_id,
                               'starts_at', p_starts_at, 'ends_at', p_ends_at));
    return next rid;
  end loop;
end $$;

-- ---------- 9. Enregistrement des paiements (appelé par le webhook) ----------
-- Ces fonctions sont réservées au rôle de service : le client ne doit jamais
-- pouvoir s'accorder une extension ni un abonnement.
create or replace function public.grant_extension(
  p_household uuid,
  p_extension text,
  p_session   text,
  p_intent    text default null,
  p_amount    bigint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare ext plan_extensions%rowtype; rid uuid;
begin
  select * into ext from plan_extensions where id = p_extension and active;
  if not found then raise exception 'Extension inconnue : %', p_extension; end if;
  if not exists (select 1 from households where id = p_household and deleted_at is null) then
    raise exception 'Foyer introuvable';
  end if;

  -- Rejeu du webhook : la session Stripe est unique, on ne crédite qu'une fois
  select id into rid from household_extensions where stripe_session_id = p_session;
  if rid is not null then return rid; end if;

  insert into household_extensions (household_id, extension_id, months, amount_cents,
                                    stripe_session_id, stripe_payment_intent)
  values (p_household, ext.id, ext.months, coalesce(p_amount, ext.price_cents),
          p_session, p_intent)
  returning id into rid;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, after)
  values (p_household, null, 'grant', 'extension', rid,
          jsonb_build_object('extension', ext.id, 'months', ext.months));
  return rid;
end $$;

create or replace function public.upsert_subscription(
  p_household uuid,
  p_plan      text,
  p_status    text,
  p_customer  text,
  p_subscription text,
  p_price     text default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_trial_end timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from plans where id = p_plan) then
    raise exception 'Plan inconnu : %', p_plan;
  end if;
  if p_status not in ('active','trialing','past_due','canceled') then
    raise exception 'Statut d''abonnement inconnu : %', p_status;
  end if;

  insert into subscriptions (household_id, plan_id, status, stripe_customer_id,
                             stripe_subscription_id, stripe_price_id,
                             current_period_end, cancel_at_period_end, trial_end)
  values (p_household, p_plan, p_status, p_customer, p_subscription, p_price,
          p_period_end, coalesce(p_cancel_at_period_end, false), p_trial_end)
  on conflict (household_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
    stripe_price_id = coalesce(excluded.stripe_price_id, subscriptions.stripe_price_id),
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    trial_end = excluded.trial_end,
    updated_at = now();

  insert into audit_logs (household_id, actor_id, action, entity, after)
  values (p_household, null, 'sync', 'subscription',
          jsonb_build_object('plan', p_plan, 'status', p_status,
                             'period_end', p_period_end,
                             'cancel_at_period_end', p_cancel_at_period_end));
end $$;

-- Renvoie false uniquement si l'événement a DÉJÀ ÉTÉ TRAITÉ AVEC SUCCÈS.
-- Un événement reçu mais échoué revient à true : Stripe le rejoue, et le
-- traitement doit être retenté. C'est ce qui évite de perdre un paiement sur
-- une erreur passagère.
create or replace function public.record_billing_event(
  p_event_id text, p_type text, p_household uuid, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare deja timestamptz;
begin
  insert into billing_events (stripe_event_id, type, household_id, payload)
  values (p_event_id, p_type, p_household, p_payload);
  return true;
exception when unique_violation then
  select processed_at into deja from billing_events where stripe_event_id = p_event_id;
  if deja is not null then return false; end if;
  update billing_events set attempts = attempts + 1
   where stripe_event_id = p_event_id;
  return true;
end $$;

/** Marque l'événement comme définitivement traité. */
create or replace function public.confirm_billing_event(p_event_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update billing_events set processed_at = now(), last_error = null
   where stripe_event_id = p_event_id;
end $$;

/** Conserve la cause de l'échec, pour diagnostiquer sans deviner. */
create or replace function public.fail_billing_event(p_event_id text, p_erreur text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update billing_events set last_error = left(p_erreur, 500)
   where stripe_event_id = p_event_id;
end $$;

-- ---------- 10. Droits d'exécution ----------
revoke all on function public.household_entitlement(uuid) from public, anon;
revoke all on function public.dans_horizon(uuid, date) from public, anon;
revoke all on function public.exiger_horizon(uuid, date) from public, anon, authenticated;
revoke all on function public.grant_extension(uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.upsert_subscription(uuid, text, text, text, text, text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.record_billing_event(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_billing_event(text) from public, anon, authenticated;
revoke all on function public.fail_billing_event(text, text) from public, anon, authenticated;

grant execute on function public.household_entitlement(uuid) to authenticated;
grant execute on function public.dans_horizon(uuid, date) to authenticated;

commit;
