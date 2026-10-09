-- 00058_mesures_visuels_reserve.sql
-- Les visuels quotidiens publiés depuis la réserve n'étaient mesurés nulle
-- part : le relevé ne lisait que marketing_publications, que la réserve
-- n'alimente pas. Neuf publications d'affilée sont parties sans qu'aucun
-- chiffre ne puisse être relevé, et l'écran des mesures affichait encore les
-- quinze anciennes — d'où l'impression que les nouveaux visuels ne faisaient
-- aucune vue alors qu'ils n'étaient simplement pas comptés.
-- APPLIQUÉE EN PRODUCTION le 10/10/2026.

alter table public.marketing_mesures
  add column if not exists reserve_id uuid references public.marketing_reserve(id) on delete cascade;

alter table public.marketing_mesures
  alter column publication_id drop not null;

alter table public.marketing_mesures
  drop constraint if exists marketing_mesures_cible;

alter table public.marketing_mesures
  add constraint marketing_mesures_cible
  check (num_nonnulls(publication_id, reserve_id) = 1);

create index if not exists marketing_mesures_reserve
  on public.marketing_mesures (reserve_id, releve_le desc);
