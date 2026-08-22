-- Coparentalité Zen — entonnoir agrégé du questionnaire public
--
-- Une ligne ne décrit jamais une personne : elle additionne, pour une date et
-- une origine, les démarrages, fins de questionnaire et clics d'inscription.
-- Aucune réponse au quiz et aucune donnée concernant les enfants ne franchit
-- l'API. RLS fermée sans policy ; seul service_role peut écrire et lire.

begin;

create table if not exists public.marketing_parcours_quiz (
  jour date not null default current_date,
  source text not null check (char_length(source) between 1 and 64),
  campagne text not null check (char_length(campagne) between 1 and 64),
  contenu text not null check (char_length(contenu) between 1 and 64),
  etape text not null check (etape in ('commence', 'termine', 'clic_inscription')),
  occurrences integer not null default 0 check (occurrences >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (jour, source, campagne, contenu, etape)
);

alter table public.marketing_parcours_quiz enable row level security;
revoke all on table public.marketing_parcours_quiz from public, anon, authenticated;

create or replace function public.compter_etape_quiz(
  p_etape text, p_source text, p_campagne text, p_contenu text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_etape not in ('commence', 'termine', 'clic_inscription') then
    raise exception 'Étape de questionnaire invalide.';
  end if;

  insert into public.marketing_parcours_quiz (
    jour, source, campagne, contenu, etape, occurrences
  ) values (
    current_date,
    left(coalesce(nullif(p_source, ''), 'site'), 64),
    left(coalesce(nullif(p_campagne, ''), 'quiz'), 64),
    left(coalesce(nullif(p_contenu, ''), 'quiz-resultat'), 64),
    p_etape,
    1
  )
  on conflict (jour, source, campagne, contenu, etape)
  do update set
    occurrences = public.marketing_parcours_quiz.occurrences + 1,
    updated_at = now();
end;
$$;

revoke all on function public.compter_etape_quiz(text, text, text, text)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.marketing_parcours_quiz to service_role';
    execute 'grant execute on function public.compter_etape_quiz(text, text, text, text) to service_role';
  else
    raise notice 'service_role absent : droits non accordés (environnement hors Supabase)';
  end if;
end $$;

commit;
