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
