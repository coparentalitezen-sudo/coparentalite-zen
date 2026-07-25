-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00014 : exceptions de garde
--
-- CHOIX D'ARCHITECTURE — évolution minimale, aucune table nouvelle.
-- La table custody_exceptions existe depuis la migration 00001 et porte déjà
-- household_id, child_id, parent_id, starts_at, ends_at, reason, created_by,
-- created_at, updated_at, deleted_at. On lui ajoute seulement :
--   * kind    : 'holiday' (vacances) ou 'swap' (changement ponctuel) ;
--   * title   : intitulé facultatif ;
--   * note    : commentaire facultatif.
-- Une structure unique sert donc les deux types : même écriture, même lecture,
-- même contrôle de chevauchement — seul le niveau de priorité change.
--
-- PLUSIEURS ENFANTS : une ligne par enfant. Cela garde le contrôle de
-- chevauchement naturel (par enfant) et permet de retirer un seul enfant d'une
-- exception sans toucher aux autres.
--
-- HEURES : starts_at et ends_at sont des timestamptz — la précision horaire
-- est conservée en base et affichée dans le détail du jour. La grille mensuelle
-- reste journalière : un jour touché par une exception porte sa couleur.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Extension du modèle ----------
create extension if not exists btree_gist;

alter table custody_exceptions add column if not exists kind text not null default 'swap';
alter table custody_exceptions add column if not exists title text;
alter table custody_exceptions add column if not exists note text;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'custody_exceptions_kind_check') then
    alter table custody_exceptions
      add constraint custody_exceptions_kind_check check (kind in ('holiday', 'swap'));
  end if;
end $$;

-- Chevauchement interdit pour un même enfant AU MÊME NIVEAU DE PRIORITÉ.
-- Une période de vacances et un changement ponctuel peuvent en revanche se
-- superposer : la priorité tranche, ce n'est pas un conflit.
-- L'ajout d'une contrainte d'exclusion crée un index : le conflit se signale
-- par duplicate_table, pas seulement duplicate_object. On teste donc
-- explicitement l'existence de la contrainte pour rester rejouable.
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'custody_exceptions_sans_chevauchement') then
    alter table custody_exceptions
      add constraint custody_exceptions_sans_chevauchement
      exclude using gist (
        child_id with =,
        kind with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (deleted_at is null);
  end if;
end $$;

create index if not exists idx_cex_lookup
  on custody_exceptions (household_id, starts_at, ends_at) where deleted_at is null;

-- ---------- 2. Écriture : fonctions serveur autoritaires ----------

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

create or replace function public.update_custody_exception(
  p_id        uuid,
  p_parent_id uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_title     text default null,
  p_note      text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare e custody_exceptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from custody_exceptions where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Période introuvable ou déjà supprimée'; end if;
  perform public.lock_household(e.household_id);
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La fin doit être postérieure au début';
  end if;
  if not public.est_comptable(e.household_id, p_parent_id) then
    raise exception 'Le parent gardien doit être l''un des deux parents du foyer';
  end if;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (e.household_id, auth.uid(), 'update', 'custody_exception', p_id,
          jsonb_build_object('parent_id', e.parent_id, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
          jsonb_build_object('parent_id', p_parent_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));

  begin
    update custody_exceptions
       set parent_id = p_parent_id, starts_at = p_starts_at, ends_at = p_ends_at,
           title = nullif(trim(p_title), ''), note = nullif(trim(p_note), ''),
           reason = nullif(trim(p_title), '')
     where id = p_id;
  exception when exclusion_violation then
    raise exception 'Ces dates chevauchent une autre période du même type pour cet enfant';
  end;
end $$;

create or replace function public.delete_custody_exception(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e custody_exceptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into e from custody_exceptions where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Période introuvable ou déjà supprimée'; end if;
  perform public.lock_household(e.household_id);
  if not public.can_write(e.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;

  update custody_exceptions set deleted_at = now() where id = p_id;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (e.household_id, auth.uid(), 'delete', 'custody_exception', p_id,
          jsonb_build_object('kind', e.kind, 'child_id', e.child_id,
                             'starts_at', e.starts_at, 'ends_at', e.ends_at));
end $$;

-- ---------- 3. Lecture : exceptions du foyer sur une plage ----------
create or replace function public.list_custody_exceptions(
  p_household uuid, p_from date, p_to date
) returns table (
  id uuid, kind text, child_id uuid, child_name text,
  parent_id uuid, starts_at timestamptz, ends_at timestamptz,
  title text, note text, created_by uuid, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.kind, e.child_id, c.first_name, e.parent_id, e.starts_at, e.ends_at,
         e.title, e.note, e.created_by, e.created_at, e.updated_at
  from custody_exceptions e
  join children c on c.id = e.child_id
  where e.household_id = p_household
    and e.deleted_at is null
    and public.is_member(p_household)
    and e.ends_at   >= (p_from::timestamptz)
    and e.starts_at <  ((p_to + 1)::timestamptz)
  order by e.starts_at, c.first_name
$$;

-- ---------- 4. Droits : écriture par fonctions serveur uniquement ----------
revoke insert, update, delete on public.custody_exceptions from public, anon, authenticated;
grant select on public.custody_exceptions to authenticated;

drop policy if exists custody_exceptions_ins on custody_exceptions;
drop policy if exists custody_exceptions_upd on custody_exceptions;

revoke all on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.update_custody_exception(uuid, uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.delete_custody_exception(uuid) from public, anon;
revoke all on function public.list_custody_exceptions(uuid, date, date) from public, anon;

grant execute on function public.create_custody_exception(uuid, text, uuid[], uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.update_custody_exception(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.delete_custody_exception(uuid) to authenticated;
grant execute on function public.list_custody_exceptions(uuid, date, date) to authenticated;

commit;
