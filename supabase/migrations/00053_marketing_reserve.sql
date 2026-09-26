-- 00053_marketing_reserve.sql
-- Réserve de contenus prêts à publier (visuels déjà produits, légendes écrites).
-- La programmation existante n'est pas touchée : marketing_parametres, sa cadence
-- par jour de semaine, marketing_contenus et marketing_publications restent en place.
-- Le cron pioche d'abord dans la réserve ; si elle est vide, il retombe sur le
-- générateur combinatoire actuel.
--
-- À exécuter dans le SQL Editor Supabase (projet terjitzvmalggytqpjpc).

create table if not exists public.marketing_reserve (
  id                 uuid primary key default gen_random_uuid(),
  theme              text not null,
  image_url          text not null check (image_url ~ '^https://'),
  legende            text not null check (length(trim(legende)) > 0),
  texte_alternatif   text not null check (length(trim(texte_alternatif)) > 0),
  statut             text not null default 'pret'
                     check (statut in ('pret', 'en_cours', 'publie', 'echec', 'archive')),
  date_publication   date,           -- date souhaitée ; null = dès le prochain passage
  id_instagram       text,
  id_facebook        text,
  -- Suivi par plateforme : une plateforme qui a réussi n'est jamais republiée.
  statut_instagram   text not null default 'en_attente'
                     check (statut_instagram in ('en_attente', 'publiee', 'echec')),
  statut_facebook    text not null default 'en_attente'
                     check (statut_facebook in ('en_attente', 'publiee', 'echec')),
  erreur_instagram   text,
  erreur_facebook    text,
  tentatives         smallint not null default 0,
  publie_le          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.marketing_reserve is
  'File d''attente de visuels prêts à publier sur Instagram et Facebook. Ajouter une ligne suffit : aucun déploiement nécessaire.';

create index if not exists marketing_reserve_a_traiter
  on public.marketing_reserve (coalesce(date_publication, '1970-01-01'::date), created_at)
  where statut in ('pret', 'echec');

drop trigger if exists trg_marketing_reserve_updated on public.marketing_reserve;
create trigger trg_marketing_reserve_updated
before update on public.marketing_reserve
for each row execute function public.set_updated_at();

-- Table pilotée par le cron (clé service) et par le dashboard Supabase.
alter table public.marketing_reserve enable row level security;
revoke all on public.marketing_reserve from anon, authenticated;

-- 1. Prise du prochain contenu prêt.
--    SKIP LOCKED : deux exécutions simultanées ne piochent jamais le même visuel.
--    Les contenus en échec sont repris tant qu'il reste une plateforme à publier,
--    dans la limite de 5 tentatives.
create or replace function public.reserve_prochain_contenu()
returns public.marketing_reserve
language plpgsql security definer set search_path to 'public'
as $function$
declare c public.marketing_reserve;
begin
  select * into c
    from public.marketing_reserve r
   where r.statut in ('pret', 'echec')
     and (r.date_publication is null or r.date_publication <= current_date)
     and r.tentatives < 5
     and (r.statut_instagram <> 'publiee' or r.statut_facebook <> 'publiee')
   order by coalesce(r.date_publication, '1970-01-01'::date), r.created_at
   limit 1
   for update skip locked;

  if not found then return null; end if;

  update public.marketing_reserve
     set statut = 'en_cours', tentatives = tentatives + 1
   where id = c.id
   returning * into c;

  return c;
end $function$;

-- 2. Succès sur une plateforme : on enregistre l'identifiant retourné par Meta.
create or replace function public.reserve_enregistrer_succes(
  p_id uuid, p_plateforme text, p_media_id text
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_plateforme not in ('instagram', 'facebook') then
    raise exception 'Plateforme inconnue : %', p_plateforme;
  end if;
  if p_media_id is null or trim(p_media_id) = '' then
    raise exception 'Identifiant de publication manquant';
  end if;

  if p_plateforme = 'instagram' then
    update public.marketing_reserve
       set id_instagram = p_media_id, statut_instagram = 'publiee', erreur_instagram = null
     where id = p_id;
  else
    update public.marketing_reserve
       set id_facebook = p_media_id, statut_facebook = 'publiee', erreur_facebook = null
     where id = p_id;
  end if;
end $function$;

-- 3. Échec sur une plateforme : le motif est conservé, l'autre plateforme n'est pas touchée.
create or replace function public.reserve_enregistrer_echec(
  p_id uuid, p_plateforme text, p_erreur text
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_plateforme = 'instagram' then
    update public.marketing_reserve
       set statut_instagram = 'echec', erreur_instagram = left(coalesce(p_erreur, 'erreur inconnue'), 500)
     where id = p_id and statut_instagram <> 'publiee';
  elsif p_plateforme = 'facebook' then
    update public.marketing_reserve
       set statut_facebook = 'echec', erreur_facebook = left(coalesce(p_erreur, 'erreur inconnue'), 500)
     where id = p_id and statut_facebook <> 'publiee';
  elsif p_plateforme = 'image' then
    -- Image inaccessible : aucune plateforme n'est tentée, jamais de repli en texte seul.
    update public.marketing_reserve
       set statut_instagram = case when statut_instagram = 'publiee' then statut_instagram else 'echec' end,
           statut_facebook  = case when statut_facebook  = 'publiee' then statut_facebook  else 'echec' end,
           erreur_instagram = case when statut_instagram = 'publiee' then erreur_instagram else left(coalesce(p_erreur, 'image inaccessible'), 500) end,
           erreur_facebook  = case when statut_facebook  = 'publiee' then erreur_facebook  else left(coalesce(p_erreur, 'image inaccessible'), 500) end
     where id = p_id;
  else
    raise exception 'Plateforme inconnue : %', p_plateforme;
  end if;
end $function$;

-- 4. Clôture.
--    « publié » quand les deux réseaux ont abouti ; « échec » dès qu'un réseau
--    a échoué ; « prêt » si un réseau n'a pas encore été tenté (canal coupé,
--    mode validation) — sans quoi une plateforme simplement désactivée ferait
--    passer le contenu pour défectueux.
create or replace function public.reserve_finaliser(p_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare v_statut text;
begin
  update public.marketing_reserve
     set statut = case
           when statut_instagram = 'publiee' and statut_facebook = 'publiee' then 'publie'
           when statut_instagram = 'echec' or statut_facebook = 'echec' then 'echec'
           else 'pret' end,
         publie_le = case
           when statut_instagram = 'publiee' and statut_facebook = 'publiee' then coalesce(publie_le, now())
           else publie_le end
   where id = p_id
   returning statut into v_statut;
  return v_statut;
end $function$;

-- 5. Ajout d'un visuel — la manière simple, sans toucher au programme.
create or replace function public.reserve_ajouter(
  p_theme text, p_image_url text, p_legende text,
  p_texte_alternatif text, p_date_publication date default null
) returns uuid
language sql security definer set search_path to 'public'
as $function$
  insert into public.marketing_reserve (theme, image_url, legende, texte_alternatif, date_publication)
  values (p_theme, p_image_url, p_legende, p_texte_alternatif, p_date_publication)
  returning id
$function$;

-- Seul le cron (clé service) manipule la réserve ; le dashboard Supabase passe outre la RLS.
revoke execute on function public.reserve_prochain_contenu() from public, anon, authenticated;
revoke execute on function public.reserve_enregistrer_succes(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_enregistrer_echec(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_finaliser(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_ajouter(text, text, text, text, date) from public, anon;

grant execute on function public.reserve_prochain_contenu() to service_role;
grant execute on function public.reserve_enregistrer_succes(uuid, text, text) to service_role;
grant execute on function public.reserve_enregistrer_echec(uuid, text, text) to service_role;
grant execute on function public.reserve_finaliser(uuid) to service_role;
grant execute on function public.reserve_ajouter(text, text, text, text, date) to service_role, authenticated;

-- Vérification en une passe.
select 'table' as objet, table_name as detail
  from information_schema.tables where table_schema = 'public' and table_name = 'marketing_reserve'
union all
select 'colonnes', string_agg(column_name, ', ' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = 'marketing_reserve'
union all
select 'fonctions', string_agg(p.proname, ', ' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'reserve\_%'
union all
select 'rls', case when relrowsecurity then 'activee' else 'DESACTIVEE' end
  from pg_class where oid = 'public.marketing_reserve'::regclass;
