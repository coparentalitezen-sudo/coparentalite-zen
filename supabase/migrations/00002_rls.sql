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
