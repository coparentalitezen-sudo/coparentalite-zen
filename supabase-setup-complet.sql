-- ATTENTION — ARCHIVE HISTORIQUE, NE PAS UTILISER POUR UNE INSTALLATION.
-- Ce fichier s'arrête aux premières migrations et ne contient pas les évolutions
-- récentes (vacances, notifications, rendez-vous, rappels, sécurité).
-- La seule source d'installation supportée est supabase/migrations/, dans l'ordre.

-- ============================================================
-- COPARENTALITÉ ZEN — INSTALLATION COMPLÈTE (v3, IDEMPOTENT)
-- Rejouable sans risque. Inclut désormais les migrations 00006
-- (opérations transactionnelles) et 00007 (privilèges de table).
-- ============================================================

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00001 : schéma complet
-- Conventions :
--   * montants stockés en CENTIMES (bigint) — jamais de flottants
--   * pourcentages en POINTS DE BASE (0–10000) — 5000 = 50 %
--   * suppression logique via deleted_at (jamais de DELETE sur les
--     tables à valeur probatoire : expenses, messages, audit_logs)
--   * created_by référence profiles(id)
--   * updated_at maintenu par trigger
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Types énumérés ----------
do $$ begin
  create type member_role as enum ('owner','parent','step_parent','viewer','mediator','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type invitation_status as enum ('pending','accepted','expired','revoked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type custody_pattern as enum ('alternating_weeks','even_weeks','odd_weeks','alternating_weekends','p2233','p2255','custom');
exception when duplicate_object then null; end $$;
do $$ begin
  create type exchange_status as enum ('draft','sent','seen','pending','accepted','declined','counter_proposed','cancelled','expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type expense_status as enum ('draft','sent','seen','to_validate','validated','partially_validated','disputed','cancelled','partially_reimbursed','reimbursed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type share_rule_kind as enum ('percentage','fixed_amount');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reimbursement_method as enum ('bank_transfer','cash','external','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notif_channel as enum ('internal','email','push');
exception when duplicate_object then null; end $$;
do $$ begin
  create type event_kind as enum ('school','activity','medical','birthday','holiday','handover','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type doc_kind as enum ('receipt','invoice','prescription','medical_certificate','school','attestation','insurance','travel','agreement','authorization','identity','other');
exception when duplicate_object then null; end $$;

-- ---------- Fonctions utilitaires ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- 1. profiles (miroir de auth.users) ----------
create table if not exists profiles (
  id uuid primary key,                        -- = auth.users.id
  email text not null unique,
  display_name text not null,
  avatar_url text,
  locale text not null default 'fr-FR',
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- 2. households ----------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_currency char(3) not null default 'EUR',
  school_zone text check (school_zone in ('A','B','C') or school_zone is null),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- 3. household_members ----------
create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  profile_id uuid not null references profiles(id),
  role member_role not null default 'parent',
  color_key text not null default 'navy' check (color_key in ('navy','coral','sage')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, profile_id)
);
create index if not exists idx_hm_profile on household_members(profile_id) where deleted_at is null;
create index if not exists idx_hm_household on household_members(household_id) where deleted_at is null;

-- ---------- 4. invitations ----------
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  email text,
  token uuid not null unique default gen_random_uuid(),
  role member_role not null default 'parent',
  status invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inv_household on invitations(household_id);

-- ---------- 5. children ----------
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  first_name text not null,
  last_name text,
  birth_date date,
  photo_path text,
  color text not null default '#9AA791',
  school text,
  school_class text,
  activities text,
  allergies text,          -- données sensibles : accès restreint via RLS (parents uniquement)
  medical_notes text,      -- idem
  notes text,
  archived_at timestamptz, -- archivage sans suppression d'historique
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_children_household on children(household_id) where deleted_at is null;

-- ---------- 6. child_contacts (contacts d'urgence) ----------
create table if not exists child_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id),
  name text not null,
  relation text,
  phone text,
  email text,
  is_emergency boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_cc_child on child_contacts(child_id);

-- ---------- 7. custody_rules ----------
create table if not exists custody_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid references children(id),      -- null = tous les enfants du foyer
  pattern custody_pattern not null,
  start_date date not null,
  end_date date,
  handover_day smallint check (handover_day between 0 and 6),  -- 0 = dimanche
  handover_time time,
  handover_place text,
  starting_parent uuid not null references profiles(id),
  config jsonb not null default '{}',          -- détail des motifs custom
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or end_date >= start_date)
);
create index if not exists idx_cr_household on custody_rules(household_id) where deleted_at is null;

-- ---------- 8. custody_periods (périodes matérialisées) ----------
create table if not exists custody_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid not null references children(id),
  parent_id uuid not null references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'rule' check (source in ('rule','holiday','exception','exchange')),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_cp_lookup on custody_periods(household_id, child_id, starts_at);

-- ---------- 9. custody_exceptions ----------
create table if not exists custody_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid not null references children(id),
  parent_id uuid not null references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);

-- ---------- 10. school_holidays ----------
create table if not exists school_holidays (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),   -- null = référentiel national partagé
  label text not null,
  zone text check (zone in ('A','B','C') or zone is null),
  school_year text,                              -- ex. '2026-2027'
  starts_on date not null,
  ends_on date not null,
  split_rule jsonb not null default '{}',        -- {first_half: parent_id, alternate_by_year: bool, ...}
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_on >= starts_on)
);

-- ---------- 11. calendar_events ----------
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid references children(id),
  kind event_kind not null default 'other',
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_ce_household_time on calendar_events(household_id, starts_at) where deleted_at is null;

-- ---------- 12. exchange_requests (demandes de modification de garde) ----------
create table if not exists exchange_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid not null references children(id),
  original_start timestamptz not null,
  original_end timestamptz not null,
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  reason text,
  compensation text,
  respond_by timestamptz,
  status exchange_status not null default 'draft',
  responded_by uuid references profiles(id),
  responded_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- pas de deleted_at : trace horodatée conservée, statut 'cancelled' à la place
);
create index if not exists idx_er_household on exchange_requests(household_id, status);

-- ---------- 13. exchange_request_messages ----------
create table if not exists exchange_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references exchange_requests(id),
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- 14. expense_categories ----------
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),   -- null = catégorie par défaut système
  name text not null,
  icon text,
  sort_order smallint not null default 100,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists idx_ec_unique on expense_categories(coalesce(household_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where deleted_at is null;

-- ---------- 15. expenses ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  title text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'EUR',
  spent_on date not null,
  category_id uuid references expense_categories(id),
  paid_by uuid not null references profiles(id),
  payment_method text,
  is_future boolean not null default false,
  description text,
  status expense_status not null default 'draft',
  settle_by date,
  recurring_id uuid,                             -- fk ajoutée après création de recurring_expenses
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                          -- suppression logique uniquement
);
create index if not exists idx_exp_household on expenses(household_id, spent_on desc) where deleted_at is null;
create index if not exists idx_exp_status on expenses(household_id, status) where deleted_at is null;

-- ---------- 16. expense_children ----------
create table if not exists expense_children (
  expense_id uuid not null references expenses(id),
  child_id uuid not null references children(id),
  primary key (expense_id, child_id)
);

-- ---------- 17. expense_shares (règle de partage appliquée) ----------
create table if not exists expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  parent_id uuid not null references profiles(id),
  kind share_rule_kind not null default 'percentage',
  basis_points int check (kind <> 'percentage' or (basis_points between 0 and 10000)),
  fixed_cents bigint check (kind <> 'fixed_amount' or fixed_cents >= 0),
  owed_cents bigint not null check (owed_cents >= 0),  -- montant calculé, arrondi contrôlé
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_id, parent_id)
);

-- ---------- 18. expense_attachments (justificatifs) ----------
create table if not exists expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  storage_path text not null,                    -- bucket privé Supabase Storage
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/heic')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- 19. expense_comments (validation, contestation, précisions) ----------
create table if not exists expense_comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  author_id uuid not null references profiles(id),
  kind text not null default 'comment' check (kind in ('comment','validation','partial_validation','dispute','clarification_request')),
  body text,
  accepted_cents bigint check (accepted_cents is null or accepted_cents >= 0),
  disputed_cents bigint check (disputed_cents is null or disputed_cents >= 0),
  created_at timestamptz not null default now()
  -- immuable : trace de contestation, jamais modifiée ni supprimée
);

-- ---------- 20. recurring_expenses ----------
create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  title text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'EUR',
  category_id uuid references expense_categories(id),
  paid_by uuid not null references profiles(id),
  rrule text not null,                           -- ex. 'FREQ=MONTHLY;BYMONTHDAY=1'
  next_run date not null,
  active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
do $$ begin
  alter table expenses add constraint fk_exp_recurring foreign key (recurring_id) references recurring_expenses(id);
exception when duplicate_object then null; end $$;

-- ---------- 21. reimbursements ----------
create table if not exists reimbursements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  from_parent uuid not null references profiles(id),
  to_parent uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'EUR',
  method reimbursement_method not null default 'bank_transfer',
  reference text,
  comment text,
  paid_on date not null,
  attachment_path text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_parent <> to_parent)
);
create index if not exists idx_reimb_household on reimbursements(household_id, paid_on desc) where deleted_at is null;

-- ---------- 22. documents ----------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  child_id uuid references children(id),
  kind doc_kind not null default 'other',
  title text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/heic')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 20971520),
  expires_on date,
  remind_days_before smallint,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_doc_household on documents(household_id) where deleted_at is null;
create index if not exists idx_doc_expiry on documents(expires_on) where deleted_at is null and expires_on is not null;

-- ---------- 23. document_permissions ----------
create table if not exists document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  profile_id uuid not null references profiles(id),
  can_read boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, profile_id)
);

-- ---------- 24. conversations ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  subject text,
  linked_kind text check (linked_kind in ('child','expense','event','exchange_request','document') or linked_kind is null),
  linked_id uuid,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 25. conversation_members ----------
create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id),
  profile_id uuid not null references profiles(id),
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);

-- ---------- 26. messages ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  author_id uuid not null references profiles(id),
  body text not null,
  edited_at timestamptz,
  original_body text,                            -- conservé si édition : pas de suppression silencieuse
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_conv on messages(conversation_id, created_at);

-- ---------- 27. notifications ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  household_id uuid references households(id),
  kind text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_profile on notifications(profile_id, created_at desc);

-- ---------- 28. notification_preferences ----------
create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  kind text not null,
  channel notif_channel not null,
  enabled boolean not null default true,
  quiet_hours int4range,                         -- ex. [22,7)
  digest text check (digest in ('none','daily','weekly') or digest is null),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind, channel)
);

-- ---------- 29. plans ----------
create table if not exists plans (
  id text primary key,                           -- 'free' | 'premium' | 'pro'
  name text not null,
  price_cents_monthly bigint not null default 0,
  limits jsonb not null default '{}',
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 30. subscriptions ----------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  plan_id text not null references plans(id),
  status text not null default 'active' check (status in ('active','trialing','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id)
);

-- ---------- 31. audit_logs (immuable) ----------
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  household_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_household on audit_logs(household_id, created_at desc);

-- ---------- 32. user_settings ----------
create table if not exists user_settings (
  profile_id uuid primary key references profiles(id),
  theme text not null default 'light' check (theme in ('light','dark','system')),
  week_starts_on smallint not null default 1 check (week_starts_on in (0,1)),
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- 33. consent_logs (RGPD, immuable) ----------
create table if not exists consent_logs (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  consent_kind text not null,                    -- 'terms' | 'privacy' | 'marketing_email' ...
  version text not null,
  granted boolean not null,
  ip_hash text,
  created_at timestamptz not null default now()
);

-- ---------- Triggers updated_at ----------
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema='public' and column_name='updated_at'
  loop
    execute format('drop trigger if exists trg_%I_updated on %I', t, t);
    execute format('create trigger trg_%I_updated before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00002 : Row Level Security
-- Principe : isolation stricte par foyer. Un utilisateur ne voit
-- QUE les données des foyers dont il est membre actif.
-- auth.uid() = identité Supabase Auth du requérant.
-- ============================================================

-- Fonctions d'appartenance (security definer pour éviter la récursion RLS)
create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = hid and profile_id = auth.uid() and deleted_at is null
  );
$$;

create or replace function public.member_role_in(hid uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from household_members
  where household_id = hid and profile_id = auth.uid() and deleted_at is null
  limit 1;
$$;

-- Rôles pouvant écrire (lecture seule pour viewer et mediator)
create or replace function public.can_write(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce indispensable : pour un non-membre, member_role_in renvoie NULL
  -- et « NULL in (...) » vaut NULL, pas FALSE — ce qui neutraliserait les
  -- vérifications « if not can_write(...) » dans les fonctions PL/pgSQL.
  select coalesce(public.member_role_in(hid) in ('owner','parent','step_parent','admin'), false);
$$;

-- Rôles parents (accès aux données médicales des enfants)
create or replace function public.is_parent(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role_in(hid) in ('owner','parent','admin'), false);
$$;

-- ---------- Activation RLS sur toutes les tables ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- profiles ----------
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid()
         or exists (select 1 from household_members m1
                    join household_members m2 on m1.household_id = m2.household_id
                    where m1.profile_id = auth.uid() and m2.profile_id = profiles.id
                      and m1.deleted_at is null and m2.deleted_at is null));
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- households ----------
drop policy if exists households_read on households;
create policy households_read   on households for select using (public.is_member(id));
drop policy if exists households_insert on households;
create policy households_insert on households for insert with check (created_by = auth.uid());
drop policy if exists households_update on households;
create policy households_update on households for update
  using (public.member_role_in(id) in ('owner','admin'))
  with check (public.member_role_in(id) in ('owner','admin'));

-- ---------- household_members ----------
drop policy if exists hm_read on household_members;
create policy hm_read on household_members for select using (public.is_member(household_id));
drop policy if exists hm_insert on household_members;
create policy hm_insert on household_members for insert
  with check (
    -- le créateur du foyer s'ajoute lui-même en owner…
    (profile_id = auth.uid() and exists (select 1 from households h where h.id = household_id and h.created_by = auth.uid()))
    -- …ou un membre rejoint via invitation valide (validé côté fonction serveur accept_invitation)
    or (profile_id = auth.uid() and exists (
        select 1 from invitations i
        where i.household_id = household_members.household_id
          and i.status = 'accepted' and i.accepted_by = auth.uid()))
  );
drop policy if exists hm_update on household_members;
create policy hm_update on household_members for update
  using (public.member_role_in(household_id) in ('owner','admin'))
  with check (public.member_role_in(household_id) in ('owner','admin'));

-- ---------- invitations ----------
drop policy if exists inv_read on invitations;
create policy inv_read on invitations for select
  using (public.is_member(household_id) or accepted_by = auth.uid());
drop policy if exists inv_insert on invitations;
create policy inv_insert on invitations for insert
  with check (public.can_write(household_id) and created_by = auth.uid());
drop policy if exists inv_update on invitations;
create policy inv_update on invitations for update
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- ---------- children ----------
drop policy if exists children_read on children;
create policy children_read on children for select using (public.is_member(household_id));
drop policy if exists children_write on children;
create policy children_write on children for insert with check (public.can_write(household_id));
drop policy if exists children_update on children;
create policy children_update on children for update
  using (public.can_write(household_id)) with check (public.can_write(household_id));
-- NB : les colonnes allergies / medical_notes sont exposées via la vue
-- children_medical (parents uniquement) ; l'app ne lit jamais ces colonnes
-- directement pour les rôles non parents.

create or replace view children_medical with (security_invoker = true) as
  select id, household_id, allergies, medical_notes
  from children
  where public.is_parent(household_id);

-- ---------- child_contacts ----------
drop policy if exists cc_read on child_contacts;
create policy cc_read on child_contacts for select
  using (exists (select 1 from children c where c.id = child_id and public.is_member(c.household_id)));
drop policy if exists cc_write on child_contacts;
create policy cc_write on child_contacts for insert
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));
drop policy if exists cc_update on child_contacts;
create policy cc_update on child_contacts for update
  using (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)))
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));

-- ---------- Tables simples liées au foyer (lecture membre / écriture can_write) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'custody_rules','custody_periods','custody_exceptions','calendar_events',
    'expenses','recurring_expenses','reimbursements','documents','conversations'
  ]
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_ins on %I', t, t);
    execute format('drop policy if exists %I_upd on %I', t, t);
    execute format('create policy %I_read on %I for select using (public.is_member(household_id))', t, t);
    execute format('create policy %I_ins  on %I for insert with check (public.can_write(household_id))', t, t);
    execute format('create policy %I_upd  on %I for update using (public.can_write(household_id)) with check (public.can_write(household_id))', t, t);
  end loop;
end $$;

-- ---------- school_holidays (référentiel national lisible par tous) ----------
drop policy if exists sh_read on school_holidays;
create policy sh_read on school_holidays for select
  using (household_id is null or public.is_member(household_id));
drop policy if exists sh_ins on school_holidays;
create policy sh_ins on school_holidays for insert
  with check (household_id is not null and public.can_write(household_id));
drop policy if exists sh_upd on school_holidays;
create policy sh_upd on school_holidays for update
  using (household_id is not null and public.can_write(household_id))
  with check (household_id is not null and public.can_write(household_id));

-- ---------- exchange_requests ----------
drop policy if exists er_read on exchange_requests;
create policy er_read on exchange_requests for select using (public.is_member(household_id));
drop policy if exists er_ins on exchange_requests;
create policy er_ins on exchange_requests for insert
  with check (public.can_write(household_id) and created_by = auth.uid());
drop policy if exists er_upd on exchange_requests;
create policy er_upd on exchange_requests for update
  using (public.can_write(household_id)) with check (public.can_write(household_id));

drop policy if exists erm_read on exchange_request_messages;
create policy erm_read on exchange_request_messages for select
  using (exists (select 1 from exchange_requests r where r.id = request_id and public.is_member(r.household_id)));
drop policy if exists erm_ins on exchange_request_messages;
create policy erm_ins on exchange_request_messages for insert
  with check (author_id = auth.uid()
    and exists (select 1 from exchange_requests r where r.id = request_id and public.can_write(r.household_id)));

-- ---------- expense_categories ----------
drop policy if exists ec_read on expense_categories;
create policy ec_read on expense_categories for select
  using (household_id is null or public.is_member(household_id));
drop policy if exists ec_ins on expense_categories;
create policy ec_ins on expense_categories for insert
  with check (household_id is not null and public.can_write(household_id));
drop policy if exists ec_upd on expense_categories;
create policy ec_upd on expense_categories for update
  using (household_id is not null and public.can_write(household_id))
  with check (household_id is not null and public.can_write(household_id));

-- ---------- Tables filles des dépenses ----------
drop policy if exists exc_read on expense_children;
create policy exc_read on expense_children for select
  using (exists (select 1 from expenses e where e.id = expense_id and public.is_member(e.household_id)));
drop policy if exists exc_ins on expense_children;
create policy exc_ins on expense_children for insert
  with check (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));
drop policy if exists exc_del on expense_children;
create policy exc_del on expense_children for delete
  using (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));

drop policy if exists exs_read on expense_shares;
create policy exs_read on expense_shares for select
  using (exists (select 1 from expenses e where e.id = expense_id and public.is_member(e.household_id)));
drop policy if exists exs_ins on expense_shares;
create policy exs_ins on expense_shares for insert
  with check (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));
drop policy if exists exs_upd on expense_shares;
create policy exs_upd on expense_shares for update
  using (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));

drop policy if exists exa_read on expense_attachments;
create policy exa_read on expense_attachments for select
  using (exists (select 1 from expenses e where e.id = expense_id and public.is_member(e.household_id)));
drop policy if exists exa_ins on expense_attachments;
create policy exa_ins on expense_attachments for insert
  with check (created_by = auth.uid()
    and exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));
drop policy if exists exa_upd on expense_attachments;
create policy exa_upd on expense_attachments for update
  using (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));

drop policy if exists exco_read on expense_comments;
create policy exco_read on expense_comments for select
  using (exists (select 1 from expenses e where e.id = expense_id and public.is_member(e.household_id)));
drop policy if exists exco_ins on expense_comments;
create policy exco_ins on expense_comments for insert
  with check (author_id = auth.uid()
    and exists (select 1 from expenses e where e.id = expense_id and public.can_write(e.household_id)));
-- pas d'update/delete : commentaires immuables (traçabilité des contestations)

-- ---------- document_permissions ----------
drop policy if exists dp_read on document_permissions;
create policy dp_read on document_permissions for select
  using (profile_id = auth.uid()
    or exists (select 1 from documents d where d.id = document_id and public.can_write(d.household_id)));
drop policy if exists dp_ins on document_permissions;
create policy dp_ins on document_permissions for insert
  with check (exists (select 1 from documents d where d.id = document_id and public.can_write(d.household_id)));

-- ---------- conversations / messages ----------
drop policy if exists cm_read on conversation_members;
create policy cm_read on conversation_members for select
  using (profile_id = auth.uid()
    or exists (select 1 from conversations c where c.id = conversation_id and public.is_member(c.household_id)));
drop policy if exists cm_ins on conversation_members;
create policy cm_ins on conversation_members for insert
  with check (exists (select 1 from conversations c where c.id = conversation_id and public.can_write(c.household_id)));
drop policy if exists cm_upd on conversation_members;
create policy cm_upd on conversation_members for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists msg_read on messages;
create policy msg_read on messages for select
  using (exists (select 1 from conversations c where c.id = conversation_id and public.is_member(c.household_id)));
drop policy if exists msg_ins on messages;
create policy msg_ins on messages for insert
  with check (author_id = auth.uid()
    and exists (select 1 from conversations c where c.id = conversation_id and public.can_write(c.household_id)));
drop policy if exists msg_upd on messages;
create policy msg_upd on messages for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
-- pas de delete : pas de suppression silencieuse

-- ---------- notifications / préférences / réglages ----------
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select using (profile_id = auth.uid());
drop policy if exists notif_upd on notifications;
create policy notif_upd  on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists np_all on notification_preferences;
create policy np_all on notification_preferences for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists us_all on user_settings;
create policy us_all on user_settings for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- plans (public en lecture) / subscriptions ----------
drop policy if exists plans_read on plans;
create policy plans_read on plans for select using (true);
drop policy if exists subs_read on subscriptions;
create policy subs_read on subscriptions for select using (public.is_member(household_id));

-- ---------- audit_logs / consent_logs ----------
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select
  using (household_id is not null and public.member_role_in(household_id) in ('owner','admin','mediator'));
drop policy if exists consent_read on consent_logs;
create policy consent_read on consent_logs for select using (profile_id = auth.uid());
drop policy if exists consent_ins on consent_logs;
create policy consent_ins  on consent_logs for insert with check (profile_id = auth.uid());
-- insertions audit_logs : uniquement via service_role (triggers/fonctions serveur), aucune policy insert côté client

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00003 : données de référence
-- ============================================================

-- Catégories de dépenses par défaut (household_id null = système)
insert into expense_categories (name, icon, sort_order) values
  ('École','school',10), ('Cantine','utensils',20), ('Santé','heart-pulse',30),
  ('Pharmacie','pill',40), ('Vêtements','shirt',50), ('Chaussures','footprints',60),
  ('Sport','dumbbell',70), ('Loisirs','gamepad-2',80), ('Garde','baby',90),
  ('Transport','bus',100), ('Téléphone','smartphone',110), ('Vacances','palmtree',120),
  ('Cadeau','gift',130), ('Assurance','shield',140), ('Frais administratifs','file-text',150),
  ('Pension / contribution','hand-coins',160), ('Autre','circle-ellipsis',900)
on conflict do nothing;

-- Plans
insert into plans (id, name, price_cents_monthly, limits) values
  ('free','Gratuit',0,
   '{"households":1,"parents":2,"children":3,"expenses_per_month":30,"history_months":6,"storage_mb":50,"exports_per_month":1,"attachments":false,"recurring":false,"exchange_requests":false}'),
  ('premium','Premium',499,
   '{"households":1,"parents":4,"children":10,"expenses_per_month":-1,"history_months":-1,"storage_mb":2048,"exports_per_month":-1,"attachments":true,"recurring":true,"exchange_requests":true}'),
  ('pro','Professionnel / Médiateur',1499,
   '{"households":-1,"parents":-1,"children":-1,"expenses_per_month":-1,"history_months":-1,"storage_mb":10240,"exports_per_month":-1,"attachments":true,"recurring":true,"exchange_requests":true,"read_only_households":true,"activity_log":true}')
on conflict (id) do nothing;

-- Vacances scolaires françaises 2026-2027 (référentiel national, household_id null)
-- Dates vérifiées le 22/07/2026 (sources concordantes reprenant le calendrier
-- officiel MENJ). Zone A : Besançon, Bordeaux, Clermont-Fd, Dijon, Grenoble,
-- Limoges, Lyon, Poitiers • Zone B : Aix-Marseille, Amiens, Lille, Nancy-Metz,
-- Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg •
-- Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles.
do $$ begin
if not exists (select 1 from school_holidays where school_year = '2026-2027' and household_id is null) then
insert into school_holidays (label, zone, school_year, starts_on, ends_on) values
  ('Vacances de la Toussaint', null, '2026-2027', '2026-10-17', '2026-11-02'),
  ('Vacances de Noël',         null, '2026-2027', '2026-12-19', '2027-01-04'),
  ('Vacances d''hiver',        'A',  '2026-2027', '2027-02-13', '2027-03-01'),
  ('Vacances d''hiver',        'B',  '2026-2027', '2027-02-20', '2027-03-08'),
  ('Vacances d''hiver',        'C',  '2026-2027', '2027-02-06', '2027-02-22'),
  ('Vacances de printemps',    'A',  '2026-2027', '2027-04-10', '2027-04-26'),
  ('Vacances de printemps',    'B',  '2026-2027', '2027-04-17', '2027-05-03'),
  ('Vacances de printemps',    'C',  '2026-2027', '2027-04-03', '2027-04-19'),
  ('Vacances d''été',          null, '2026-2027', '2027-07-03', '2027-08-31');
end if;
end $$;

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00004 : fonctions serveur
-- Création auto du profil, acceptation d'invitation, export RGPD,
-- suppression de compte et de foyer. Toutes en SECURITY DEFINER
-- avec search_path verrouillé (exécutées avec les droits postgres,
-- vérifications d'autorisation explicites à l'intérieur).
-- ============================================================

-- ---------- 1. Création automatique du profil à l'inscription ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. Création d'un foyer (foyer + membre owner, atomique) ----------
create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom du foyer est requis'; end if;
  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning id into hid;
  insert into household_members (household_id, profile_id, role, color_key)
  values (hid, auth.uid(), 'owner', 'navy');
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (hid, auth.uid(), 'create', 'household', hid);
  return hid;
end $$;

-- ---------- 3. Créer une invitation ----------
create or replace function public.create_invitation(p_household uuid, p_email text, p_role member_role default 'parent')
returns uuid language plpgsql security definer set search_path = public as $$
declare tok uuid;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à inviter dans ce foyer';
  end if;
  if p_role in ('owner','admin') then
    raise exception 'Ce rôle ne peut pas être attribué par invitation';
  end if;
  -- une seule invitation en attente par e-mail et par foyer
  update invitations set status = 'revoked'
  where household_id = p_household and lower(email) = lower(p_email) and status = 'pending';
  insert into invitations (household_id, email, role, created_by)
  values (p_household, lower(trim(p_email)), p_role, auth.uid())
  returning token into tok;
  insert into audit_logs (household_id, actor_id, action, entity)
  values (p_household, auth.uid(), 'invite', 'invitation');
  return tok;
end $$;

-- ---------- 4. Accepter une invitation par jeton ----------
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into inv from invitations where token = p_token for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if inv.status = 'revoked' then raise exception 'Cette invitation a été révoquée'; end if;
  if inv.status = 'accepted' then raise exception 'Cette invitation a déjà été utilisée'; end if;
  if inv.expires_at < now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'Cette invitation a expiré';
  end if;
  update invitations set status = 'accepted', accepted_by = auth.uid() where id = inv.id;
  insert into household_members (household_id, profile_id, role, color_key)
  values (inv.household_id, auth.uid(), inv.role, 'coral')
  on conflict (household_id, profile_id) do update set deleted_at = null, role = excluded.role;
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (inv.household_id, auth.uid(), 'accept', 'invitation', inv.id);
  return inv.household_id;
end $$;

-- ---------- 5. Révoquer une invitation ----------
create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from invitations where id = p_id;
  if hid is null or not public.can_write(hid) then
    raise exception 'Invitation introuvable ou non autorisée';
  end if;
  update invitations set status = 'revoked' where id = p_id and status = 'pending';
end $$;

-- ---------- 6. Export RGPD : toutes les données de l'utilisateur ----------
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Authentification requise'; end if;
  select jsonb_build_object(
    'genere_le', now(),
    'profil', (select to_jsonb(p) - 'id' from profiles p where p.id = uid),
    'parametres', (select to_jsonb(s) - 'profile_id' from user_settings s where s.profile_id = uid),
    'consentements', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id' - 'ip_hash'), '[]') from consent_logs c where c.profile_id = uid),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from notifications n where n.profile_id = uid),
    'foyers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'foyer', to_jsonb(h),
        'mon_role', m.role,
        'enfants', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from children c where c.household_id = h.id and c.deleted_at is null),
        'regles_de_garde', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from custody_rules r where r.household_id = h.id and r.deleted_at is null),
        'depenses', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from expenses e where e.household_id = h.id and e.deleted_at is null),
        'remboursements', (select coalesce(jsonb_agg(to_jsonb(r2)), '[]') from reimbursements r2 where r2.household_id = h.id and r2.deleted_at is null),
        'evenements', (select coalesce(jsonb_agg(to_jsonb(ev)), '[]') from calendar_events ev where ev.household_id = h.id and ev.deleted_at is null),
        'demandes_de_modification', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from exchange_requests x where x.household_id = h.id),
        'documents', (select coalesce(jsonb_agg(to_jsonb(d) - 'storage_path'), '[]') from documents d where d.household_id = h.id and d.deleted_at is null)
      )), '[]')
      from households h
      join household_members m on m.household_id = h.id and m.profile_id = uid and m.deleted_at is null
      where h.deleted_at is null
    )
  ) into result;
  return result;
end $$;

-- ---------- 7. Suppression d'un foyer (propriétaire uniquement) ----------
create or replace function public.delete_household(p_household uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.member_role_in(p_household) <> 'owner' then
    raise exception 'Seul le propriétaire du foyer peut le supprimer';
  end if;
  -- suppression logique en cascade (les justificatifs Storage sont purgés
  -- par le nettoyeur — voir GUIDE-DEPLOIEMENT, section post-déploiement)
  update expenses set deleted_at = now() where household_id = p_household and deleted_at is null;
  update reimbursements set deleted_at = now() where household_id = p_household and deleted_at is null;
  update documents set deleted_at = now() where household_id = p_household and deleted_at is null;
  update children set deleted_at = now() where household_id = p_household and deleted_at is null;
  update custody_rules set deleted_at = now() where household_id = p_household and deleted_at is null;
  update calendar_events set deleted_at = now() where household_id = p_household and deleted_at is null;
  update household_members set deleted_at = now() where household_id = p_household and deleted_at is null;
  update households set deleted_at = now() where id = p_household;
  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'delete', 'household', p_household);
end $$;

-- ---------- 8. Suppression du compte ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h record;
begin
  if uid is null then raise exception 'Authentification requise'; end if;
  for h in select hm.household_id,
                  (select count(*) from household_members m2
                   where m2.household_id = hm.household_id and m2.deleted_at is null) as members
           from household_members hm
           where hm.profile_id = uid and hm.deleted_at is null
  loop
    if h.members = 1 then
      perform public.delete_household(h.household_id); -- dernier membre → le foyer part avec lui
    else
      update household_members set deleted_at = now()
      where household_id = h.household_id and profile_id = uid;
    end if;
  end loop;
  update profiles set deleted_at = now(),
         email = 'supprime-' || uid || '@compte-supprime.invalid',
         display_name = 'Compte supprimé', avatar_url = null
  where id = uid;
  delete from notification_preferences where profile_id = uid;
  delete from user_settings where profile_id = uid;
  delete from auth.users where id = uid; -- révoque toutes les sessions
end $$;

-- Droits d'exécution
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invitation(uuid, text, member_role) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00005 : policies Supabase Storage
-- Convention de chemin OBLIGATOIRE : {household_id}/{uuid-fichier}.{ext}
-- Buckets privés : 'justificatifs' et 'documents' (créés dans le
-- tableau de bord — Action 3 du guide de déploiement).
-- NOTE : ce script s'exécute sur Supabase (schéma storage présent).
-- ============================================================

-- Foyer déduit du premier segment du chemin du fichier
create or replace function public.household_from_path(object_name text)
returns uuid language sql immutable as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid
$$;

-- Lecture : membres du foyer uniquement (URL signées générées côté app)
drop policy if exists "justificatifs_read" on storage.objects;
create policy "justificatifs_read" on storage.objects for select
  using (bucket_id = 'justificatifs'
         and public.is_member(public.household_from_path(name)));

-- Dépôt : rôles écrivains uniquement, taille contrôlée côté app + bucket
drop policy if exists "justificatifs_insert" on storage.objects;
create policy "justificatifs_insert" on storage.objects for insert
  with check (bucket_id = 'justificatifs'
              and public.can_write(public.household_from_path(name)));

-- Remplacement/suppression : rôles écrivains
drop policy if exists "justificatifs_update" on storage.objects;
create policy "justificatifs_update" on storage.objects for update
  using (bucket_id = 'justificatifs'
         and public.can_write(public.household_from_path(name)));
drop policy if exists "justificatifs_delete" on storage.objects;
create policy "justificatifs_delete" on storage.objects for delete
  using (bucket_id = 'justificatifs'
         and public.can_write(public.household_from_path(name)));

-- Mêmes règles pour le bucket documents
drop policy if exists "documents_read" on storage.objects;
create policy "documents_read" on storage.objects for select
  using (bucket_id = 'documents' and public.is_member(public.household_from_path(name)));
drop policy if exists "documents_insert" on storage.objects;
create policy "documents_insert" on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));
drop policy if exists "documents_update" on storage.objects;
create policy "documents_update" on storage.objects for update
  using (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));
drop policy if exists "documents_delete" on storage.objects;
create policy "documents_delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));

-- Réglages recommandés des buckets (tableau de bord ou API) :
--   file_size_limit : 10 Mo (justificatifs) / 20 Mo (documents)
--   allowed_mime_types : application/pdf, image/jpeg, image/png, image/heic

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00006 : opérations transactionnelles
-- Une dépense = 3 écritures (dépense, enfants, parts). Les faire en
-- 3 appels séparés depuis le client peut laisser une dépense orpheline
-- si l'une échoue. Cette fonction fait tout dans UNE transaction, avec
-- validation serveur des invariants monétaires.
-- Idempotent : create or replace uniquement.
-- ============================================================

create or replace function public.create_expense_full(
  p_household   uuid,
  p_title       text,
  p_amount_cents bigint,
  p_spent_on    date,
  p_category_id uuid,
  p_paid_by     uuid,
  p_child_ids   uuid[],
  p_shares      jsonb          -- [{"parent_id":"...","owed_cents":1234,"basis_points":5000}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  total bigint := 0;
  part jsonb;
  n_children int;
begin
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à ajouter une dépense dans ce foyer';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Le titre de la dépense est requis';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Le montant doit être strictement positif';
  end if;

  -- le payeur doit être membre du foyer
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_paid_by and deleted_at is null) then
    raise exception 'Le parent payeur n''appartient pas à ce foyer';
  end if;

  -- les enfants doivent appartenir au foyer
  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    select count(*) into n_children from children
    where id = any(p_child_ids) and household_id = p_household and deleted_at is null;
    if n_children <> array_length(p_child_ids, 1) then
      raise exception 'Un des enfants sélectionnés n''appartient pas à ce foyer';
    end if;
  end if;

  -- invariant monétaire : la somme des parts doit égaler exactement le montant
  for part in select * from jsonb_array_elements(p_shares) loop
    if (part->>'owed_cents')::bigint < 0 then
      raise exception 'Une part négative est interdite';
    end if;
    if not exists (select 1 from household_members
                   where household_id = p_household
                     and profile_id = (part->>'parent_id')::uuid and deleted_at is null) then
      raise exception 'Une des parts vise un parent extérieur au foyer';
    end if;
    total := total + (part->>'owed_cents')::bigint;
  end loop;
  if total <> p_amount_cents then
    raise exception 'Somme des parts (%) différente du montant total (%)', total, p_amount_cents;
  end if;

  insert into expenses (household_id, title, amount_cents, spent_on, category_id,
                        paid_by, status, created_by)
  values (p_household, trim(p_title), p_amount_cents, p_spent_on, p_category_id,
          p_paid_by, 'sent', auth.uid())
  returning id into eid;

  if p_child_ids is not null and array_length(p_child_ids, 1) > 0 then
    insert into expense_children (expense_id, child_id)
    select eid, unnest(p_child_ids);
  end if;

  insert into expense_shares (expense_id, parent_id, kind, basis_points, owed_cents)
  select eid, (s->>'parent_id')::uuid, 'percentage',
         nullif(s->>'basis_points','')::int, (s->>'owed_cents')::bigint
  from jsonb_array_elements(p_shares) s;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (p_household, auth.uid(), 'create', 'expense', eid);

  return eid;   -- toute exception ci-dessus annule l'intégralité de l'insertion
end $$;

-- ---------- Validation / contestation d'une dépense par le second parent ----------
create or replace function public.review_expense(
  p_expense uuid,
  p_action  text,               -- 'validate' | 'dispute' | 'clarify'
  p_comment text default null,
  p_accepted_cents bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid; payer uuid;
begin
  select household_id, paid_by into hid, payer from expenses where id = p_expense and deleted_at is null;
  if hid is null then raise exception 'Dépense introuvable'; end if;
  if not public.can_write(hid) then raise exception 'Action non autorisée'; end if;
  if payer = auth.uid() then
    raise exception 'La dépense doit être validée par l''autre parent';
  end if;

  insert into expense_comments (expense_id, author_id, kind, body, accepted_cents)
  values (p_expense, auth.uid(),
          case p_action when 'validate' then 'validation'
                        when 'dispute' then 'dispute'
                        else 'clarification_request' end,
          p_comment, p_accepted_cents);

  update expenses set status = case p_action
      when 'validate' then 'validated'::expense_status
      when 'dispute'  then 'disputed'::expense_status
      else 'to_validate'::expense_status end
  where id = p_expense;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id)
  values (hid, auth.uid(), p_action, 'expense', p_expense);
end $$;

-- ---------- Définition du rythme de garde (une règle active par foyer) ----------
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
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  if p_parent1 = p_parent2 then
    raise exception 'Les deux parents doivent être différents';
  end if;
  if not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_parent1 and deleted_at is null)
     or not exists (select 1 from household_members
                 where household_id = p_household and profile_id = p_parent2 and deleted_at is null) then
    raise exception 'Les parents indiqués doivent être membres du foyer';
  end if;

  -- une seule règle active : les précédentes sont archivées
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

grant execute on function public.create_expense_full(uuid, text, bigint, date, uuid, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.review_expense(uuid, text, text, bigint) to authenticated;
grant execute on function public.set_custody_rule(uuid, custody_pattern, date, uuid, uuid, time, text) to authenticated;

-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00007 : privilèges du rôle applicatif
--
-- Sur PostgreSQL, la Row Level Security filtre les LIGNES, mais elle
-- ne remplace pas les privilèges de TABLE. Sans GRANT, le rôle
-- « authenticated » reçoit « permission denied for table … » avant même
-- que les policies ne s'appliquent.
--
-- Les fonctions SECURITY DEFINER (create_household, accept_invitation…)
-- masquaient l'omission : elles s'exécutent avec les droits du
-- propriétaire. Seules les lectures directes échouaient.
--
-- Sécurité : accorder ces privilèges est sans risque ici car la RLS est
-- active sur TOUTES les tables (migration 00002) et une table sans policy
-- refuse tout. Les droits de table ouvrent la porte ; les policies
-- décident qui passe.
-- Idempotent : les GRANT peuvent être rejoués indéfiniment.
-- ============================================================

-- (on n'accorde qu'aux rôles réellement présents : « anon » n'existe que sur Supabase)
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
end $$;

-- Lecture/écriture au niveau table : la RLS filtre ensuite ligne par ligne
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Vue des données médicales (réservée aux parents par la vue elle-même)
grant select on public.children_medical to authenticated;

-- Séquences éventuelles (colonnes generated as identity : audit_logs, consent_logs)
grant usage, select on all sequences in schema public to authenticated;

-- Tables créées plus tard : mêmes droits par défaut
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Fonctions serveur (rappel : déjà accordées en 00004 et 00006, rejoué ici
-- pour qu'une installation partielle reste cohérente)
grant execute on all functions in schema public to authenticated;

-- Contrôle : aucune table du schéma public ne doit rester sans RLS
do $$
declare manquantes text;
begin
  select string_agg(c.relname, ', ') into manquantes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if manquantes is not null then
    raise exception 'RLS absente sur : % — ne pas accorder de privilèges sans RLS', manquantes;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('justificatifs','justificatifs', false, 10485760, array['application/pdf','image/jpeg','image/png','image/heic']),
  ('documents','documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/heic'])
on conflict (id) do nothing;

select 'INSTALLATION TERMINÉE' as statut,
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_policies where schemaname='public') as policies_rls,
  (select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public') as droits_table;
