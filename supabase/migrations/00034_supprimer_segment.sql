-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00034 : retrait d'un segment de vacances
--
-- PROBLÈME RÉSOLU
-- Un segment de vacances regroupe une exception PAR ENFANT : une période
-- saisie pour deux enfants en crée deux. Le bouton de retrait n'en supprimait
-- qu'une — la première de l'agrégat — et le segment restait affiché, à moitié
-- effacé. Impossible alors de revenir en arrière après une saisie erronée.
--
-- SOLUTION
-- Une fonction retire le segment entier : toutes les exceptions partageant la
-- même période officielle, le même parent et les mêmes dates.
--
-- Une seule notification est émise, quel que soit le nombre d'enfants : une
-- par enfant serait répétitive et finirait ignorée.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

create or replace function public.supprimer_segment_vacances(p_exception uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  ref     custody_exceptions%rowtype;
  n       int;
  libelle text;
  prenoms text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into ref from custody_exceptions
   where id = p_exception and deleted_at is null;
  if not found then raise exception 'Cette période n''existe plus'; end if;

  if not public.can_write(ref.household_id) then
    raise exception 'Vous n''êtes pas autorisé à modifier le planning de ce foyer';
  end if;
  perform public.lock_household(ref.household_id);

  -- Les prénoms sont relevés AVANT la suppression, pour la notification
  select string_agg(c.first_name, ', ' order by c.first_name) into prenoms
    from custody_exceptions ce
    join children c on c.id = ce.child_id
   where ce.household_id = ref.household_id
     and ce.deleted_at is null
     and ce.kind = ref.kind
     and ce.parent_id = ref.parent_id
     and ce.starts_at = ref.starts_at
     and ce.ends_at = ref.ends_at
     and ce.source_holiday_id is not distinct from ref.source_holiday_id;

  -- Le segment entier disparaît : sans quoi il resterait affiché pour les
  -- enfants dont l'exception n'a pas été retirée.
  update custody_exceptions set deleted_at = now()
   where household_id = ref.household_id
     and deleted_at is null
     and kind = ref.kind
     and parent_id = ref.parent_id
     and starts_at = ref.starts_at
     and ends_at = ref.ends_at
     and source_holiday_id is not distinct from ref.source_holiday_id;
  get diagnostics n = row_count;

  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before)
  values (ref.household_id, auth.uid(), 'delete', 'custody_exception', p_exception,
          jsonb_build_object('kind', ref.kind, 'starts_at', ref.starts_at,
                             'ends_at', ref.ends_at, 'enfants', n));

  select label into libelle from exception_types where code = ref.kind;

  -- Une seule notification pour l'ensemble du segment
  perform public.notifier(
    ref.household_id, 'event_deleted',
    format('%s retirée', coalesce(ref.title, libelle, 'Période')),
    format('%s : du %s au %s. Le rythme habituel reprend sur ces dates.',
           coalesce(prenoms, 'Les enfants'),
           to_char(ref.starts_at, 'DD/MM'), to_char(ref.ends_at, 'DD/MM')),
    '/app/planning', 'custody_exception', p_exception, auth.uid());

  return n;
end $$;

revoke all on function public.supprimer_segment_vacances(uuid) from public, anon;
grant execute on function public.supprimer_segment_vacances(uuid) to authenticated;

commit;
