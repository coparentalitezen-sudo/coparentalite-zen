-- ============================================================
-- Relevé quotidien de la chaîne YouTube (abonnés, vues, vidéos)
--
-- Une ligne par jour, écrite par le relevé des vues (tâche serveur). Sert à
-- l'onglet Résultats : abonnés aujourd'hui et progression sur sept jours.
-- Les chiffres viennent de l'API YouTube (channels.list, statistics) ; YouTube
-- arrondit le nombre d'abonnés au-delà de mille, il est exact en dessous.
-- ============================================================

create table if not exists public.marketing_youtube_chaine (
  jour date primary key,
  abonnes integer check (abonnes is null or abonnes >= 0),
  abonnes_masques boolean not null default false,
  vues bigint check (vues is null or vues >= 0),
  videos integer check (videos is null or videos >= 0),
  releve_le timestamptz not null default now()
);

alter table public.marketing_youtube_chaine enable row level security;
revoke all on table public.marketing_youtube_chaine from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.marketing_youtube_chaine to service_role';
  else
    raise notice 'service_role absent : droits non accordés (environnement hors Supabase)';
  end if;
end $$;
