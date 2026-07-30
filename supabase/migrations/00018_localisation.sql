-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00018 : localisation et calendriers officiels
--
-- OBJECTIF : accueillir d'autres pays sans jamais retoucher le schéma.
--
-- Un pays se décrit par une ligne dans calendar_countries, qui dit COMMENT sa
-- zone de vacances se détermine :
--   'zone'     la zone est une découpe nationale, choisie ou déduite (France) ;
--   'region'   la zone est la région administrative elle-même (cantons suisses,
--              communautés belges, provinces canadiennes) ;
--   'national' un seul calendrier pour tout le pays (Luxembourg).
--
-- Ajouter la Belgique, la Suisse, le Luxembourg ou le Québec revient donc à
-- insérer des lignes de référence et à brancher un importateur — sans migration
-- de structure.
--
-- AUCUNE DATE DE VACANCES N'EST ÉCRITE ICI. Les périodes viennent des sources
-- officielles, par import. Une date fausse dans un planning de garde, c'est un
-- enfant qui attend devant une école.
--
-- LES DÉCISIONS DES PARENTS SONT INTOUCHABLES. Les vacances scolaires sont une
-- donnée de référence : elles n'attribuent jamais la garde. Changer de pays, de
-- département ou de zone ne supprime aucune exception créée par les parents.
--
-- Idempotente, transactionnelle, et sans perte de données : la zone déjà
-- enregistrée par les foyers existants est conservée et rattachée à la France.
-- ============================================================

begin;

-- ---------- 1. Pays pris en charge ----------
create table if not exists calendar_countries (
  code            text primary key,              -- ISO 3166-1 alpha-2, ou 'CA-QC'
  label           text not null,
  -- Comment la zone de vacances se détermine dans ce pays
  zone_mode       text not null check (zone_mode in ('zone', 'region', 'national')),
  -- Intitulé présenté à l'utilisateur pour désigner sa subdivision
  zone_label      text not null default 'Zone',
  -- Une subdivision peut-elle être déduite d'un code postal ou d'un département ?
  deduction_possible boolean not null default false,
  source_label    text,                          -- source officielle citée à l'utilisateur
  source_url      text,
  active          boolean not null default false,
  sort_order      smallint not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into calendar_countries
  (code, label, zone_mode, zone_label, deduction_possible, source_label, source_url, active, sort_order)
values
  ('FR', 'France', 'zone', 'Zone académique', true,
   'Ministère de l''Éducation nationale', 'https://data.education.gouv.fr', true, 10),
  -- Pays préparés : la structure les accueille, l'importateur reste à brancher.
  ('BE', 'Belgique', 'region', 'Communauté', false,
   'Fédération Wallonie-Bruxelles / Vlaamse overheid', null, false, 20),
  ('CH', 'Suisse', 'region', 'Canton', false,
   'Conférence suisse des directeurs cantonaux', null, false, 30),
  ('LU', 'Luxembourg', 'national', 'Pays', false,
   'Ministère de l''Éducation nationale', null, false, 40),
  ('CA-QC', 'Québec', 'region', 'Centre de services scolaire', false,
   'Ministère de l''Éducation du Québec', null, false, 50)
on conflict (code) do update set
  label = excluded.label,
  zone_mode = excluded.zone_mode,
  zone_label = excluded.zone_label,
  deduction_possible = excluded.deduction_possible,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------- 2. Subdivisions ----------
-- Les zones françaises sont connues ; celles des autres pays seront alimentées
-- par leur importateur respectif, sans changement de structure.
create table if not exists calendar_zones (
  country_code  text not null references calendar_countries(code),
  zone_code     text not null,
  label         text not null,
  hint          text,                            -- aide au choix : académies, régions…
  sort_order    smallint not null default 100,
  active        boolean not null default true,
  primary key (country_code, zone_code)
);

insert into calendar_zones (country_code, zone_code, label, hint, sort_order) values
  ('FR', 'A', 'Zone A',
   'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers', 10),
  ('FR', 'B', 'Zone B',
   'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg', 20),
  ('FR', 'C', 'Zone C',
   'Créteil, Montpellier, Paris, Toulouse, Versailles', 30)
on conflict (country_code, zone_code) do update set
  label = excluded.label, hint = excluded.hint, sort_order = excluded.sort_order;

-- ---------- 3. Déduction de la zone ----------
-- Correspondance subdivision administrative → zone de vacances.
-- Volontairement VIDE à l'installation : elle est alimentée par l'importateur
-- à partir des données officielles. Aucune correspondance n'est devinée ici —
-- une zone erronée placerait un enfant chez le mauvais parent pendant deux
-- semaines de vacances.
create table if not exists calendar_area_zones (
  country_code  text not null references calendar_countries(code),
  area_code     text not null,                   -- département FR, canton CH…
  area_label    text,
  zone_code     text not null,
  source        text not null default 'officiel',
  imported_at   timestamptz not null default now(),
  primary key (country_code, area_code)
);

-- ---------- 4. Localisation du foyer ----------
alter table households add column if not exists country_code text references calendar_countries(code);
alter table households add column if not exists area_code text;      -- département, canton…
alter table households add column if not exists postal_code text;

-- Les foyers existants ont déjà une zone : on les rattache à la France sans
-- rien effacer. Aucune donnée n'est perdue par cette migration.
update households set country_code = 'FR'
 where country_code is null and (school_zone is not null or deleted_at is null);

create index if not exists idx_households_localisation
  on households (country_code, school_zone) where deleted_at is null;

-- ---------- 5. Les périodes portent leur pays ----------
alter table school_holidays add column if not exists country_code text;
update school_holidays set country_code = 'FR' where country_code is null;

-- L'unicité tient désormais compte du pays : deux pays peuvent avoir une
-- « Toussaint » aux mêmes dates sans se confondre.
drop index if exists uq_school_holidays_officiel;
create unique index if not exists uq_school_holidays_officiel
  on school_holidays (country_code, zone, school_year, label, starts_on)
  where source = 'officiel';

create index if not exists idx_school_holidays_pays_zone
  on school_holidays (country_code, zone, starts_on, ends_on) where source = 'officiel';

-- ---------- 6. Résolution de la zone ----------
-- Renvoie la zone déduite d'une subdivision, ou null si la correspondance
-- n'est pas connue. Ne devine jamais : sans correspondance, l'utilisateur
-- choisit lui-même, ce qui vaut mieux qu'une zone approximative.
create or replace function public.deduire_zone(
  p_pays text, p_area text, p_code_postal text default null
) returns text
language plpgsql stable security definer set search_path = public as $$
declare z text; departement text;
begin
  if p_pays is null then return null; end if;

  -- Subdivision explicite : correspondance directe
  if p_area is not null then
    select zone_code into z from calendar_area_zones
     where country_code = p_pays and area_code = upper(trim(p_area));
    if z is not null then return z; end if;
  end if;

  -- France : le département se lit dans les deux premiers caractères du code
  -- postal, sauf outre-mer où il en faut trois.
  if p_pays = 'FR' and p_code_postal is not null then
    departement := case
      when left(p_code_postal, 2) in ('97', '98') then left(p_code_postal, 3)
      else left(p_code_postal, 2) end;
    select zone_code into z from calendar_area_zones
     where country_code = 'FR' and area_code = departement;
    if z is not null then return z; end if;
  end if;

  return null;
end $$;

-- ---------- 7. Enregistrement de la localisation ----------
create or replace function public.set_household_location(
  p_household   uuid,
  p_pays        text,
  p_zone        text default null,
  p_area        text default null,
  p_code_postal text default null
) returns table (zone_retenue text, deduite boolean)
language plpgsql security definer set search_path = public as $$
declare
  pays    calendar_countries%rowtype;
  avant   jsonb;
  zone_finale text;
  fut_deduite boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''êtes pas autorisé à modifier ce foyer';
  end if;
  perform public.lock_household(p_household);

  select * into pays from calendar_countries where code = p_pays and active;
  if not found then
    raise exception 'Pays non pris en charge pour le moment : %', coalesce(p_pays, 'aucun');
  end if;

  -- Zone explicite si fournie, sinon déduction, sinon aucune : on n'invente pas
  if p_zone is not null then
    if not exists (select 1 from calendar_zones
                   where country_code = p_pays and zone_code = p_zone and active) then
      raise exception 'Subdivision inconnue pour ce pays : %', p_zone;
    end if;
    zone_finale := p_zone;
  else
    zone_finale := public.deduire_zone(p_pays, p_area, p_code_postal);
    fut_deduite := zone_finale is not null;
  end if;

  select jsonb_build_object('pays', h.country_code, 'zone', h.school_zone,
                            'area', h.area_code, 'cp', h.postal_code)
    into avant
  from households h where h.id = p_household;

  update households set
    country_code = p_pays,
    school_zone = zone_finale,
    area_code = nullif(upper(trim(coalesce(p_area, ''))), ''),
    postal_code = nullif(trim(coalesce(p_code_postal, '')), ''),
    updated_at = now()
  where id = p_household and deleted_at is null;

  -- Traçable : un planning qui change doit pouvoir s'expliquer
  insert into audit_logs (household_id, actor_id, action, entity, entity_id, before, after)
  values (p_household, auth.uid(), 'set', 'household_location', p_household, avant,
          jsonb_build_object('pays', p_pays, 'zone', zone_finale,
                             'area', p_area, 'cp', p_code_postal, 'deduite', fut_deduite));

  return query select zone_finale, fut_deduite;
end $$;

-- ---------- 8. Lectures ----------
create or replace function public.pays_disponibles()
returns table (
  code text, libelle text, mode text, libelle_zone text,
  deduction boolean, source text, source_url text
)
language sql stable security definer set search_path = public as $$
  select c.code, c.label, c.zone_mode, c.zone_label,
         c.deduction_possible, c.source_label, c.source_url
  from calendar_countries c
  where c.active
  order by c.sort_order
$$;

create or replace function public.zones_disponibles(p_pays text)
returns table (code text, libelle text, aide text)
language sql stable security definer set search_path = public as $$
  select z.zone_code, z.label, z.hint
  from calendar_zones z
  where z.country_code = p_pays and z.active
  order by z.sort_order
$$;

-- Localisation du foyer, telle qu'elle sera affichée dans les paramètres
create or replace function public.household_location(p_household uuid)
returns table (
  pays          text,
  pays_libelle  text,
  mode          text,
  libelle_zone  text,
  deduction     boolean,
  zone          text,
  zone_libelle  text,
  area_code     text,
  code_postal   text,
  source        text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  return query
  select h.country_code,
         c.label, c.zone_mode, c.zone_label, c.deduction_possible,
         h.school_zone,
         (select z.label from calendar_zones z
           where z.country_code = h.country_code and z.zone_code = h.school_zone),
         h.area_code, h.postal_code, c.source_label
  from households h
  left join calendar_countries c on c.code = h.country_code
  where h.id = p_household and h.deleted_at is null;
end $$;

-- Périodes applicables : filtrées par pays ET par zone du foyer.
-- Le type de retour gagne une colonne « pays » : PostgreSQL exige alors un
-- remplacement complet, pas un « create or replace ».
drop function if exists public.list_school_holidays(uuid, date, date);
create or replace function public.list_school_holidays(
  p_household uuid, p_from date, p_to date
) returns table (
  id uuid, libelle text, zone text, annee_scolaire text,
  debut date, fin date, source text, pays text
)
language sql stable security definer set search_path = public as $$
  select h.id, h.label, h.zone, h.school_year, h.starts_on, h.ends_on,
         h.source, h.country_code
  from school_holidays h
  cross join (select hh.country_code as pays, hh.school_zone as zone
              from households hh where hh.id = p_household) f
  where public.is_member(p_household)
    and h.deleted_at is null
    and (
      (h.source = 'officiel'
       and h.country_code = f.pays
       and (h.zone = f.zone or h.zone is null))     -- zone null = calendrier national
      or h.household_id = p_household
    )
    and h.ends_on   >= p_from
    and h.starts_on <= p_to
  order by h.starts_on
$$;

drop function if exists public.school_calendar_state(uuid);
create or replace function public.school_calendar_state(p_household uuid)
returns table (
  pays            text,
  zone            text,
  periodes        int,
  premiere_date   date,
  derniere_date   date,
  derniere_sync   timestamptz,
  couvre_un_an    boolean
)
language plpgsql stable security definer set search_path = public as $$
declare p text; z text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select hh.country_code, hh.school_zone into p, z
    from households hh where hh.id = p_household;

  return query
  select p, z,
         count(*)::int,
         min(h.starts_on),
         max(h.ends_on),
         (select max(s.finished_at) from school_calendar_syncs s where s.statut = 'succes'),
         coalesce(max(h.ends_on) >= current_date + 365, false)
  from school_holidays h
  where h.source = 'officiel'
    and h.country_code = p
    and (h.zone = z or h.zone is null)
    and h.deleted_at is null;
end $$;

-- ---------- 9. Import, réservé au rôle de service ----------
-- Le calendrier est national : un utilisateur ne doit pas pouvoir l'altérer,
-- il modifierait les vacances de tous les foyers du pays.
create or replace function public.import_school_holidays(p_periodes jsonb)
returns int
language plpgsql security definer set search_path = public as $$
-- Les variables portent un préfixe : « zone » seul serait ambigu avec la
-- colonne du même nom dans la clause on conflict.
declare p jsonb; n int := 0; v_pays text; v_zone text;
begin
  if p_periodes is null or jsonb_array_length(p_periodes) = 0 then
    raise exception 'Aucune période à importer';
  end if;

  for p in select * from jsonb_array_elements(p_periodes) loop
    v_pays := coalesce(p->>'country_code', 'FR');
    v_zone := nullif(p->>'zone', '');

    if not exists (select 1 from calendar_countries where code = v_pays) then
      continue;                                    -- pays non déclaré : ignoré
    end if;
    if v_zone is not null
       and not exists (select 1 from calendar_zones
                       where country_code = v_pays and zone_code = v_zone) then
      continue;                                    -- subdivision inconnue : ignorée
    end if;
    if (p->>'starts_on') is null or (p->>'ends_on') is null then
      continue;
    end if;

    insert into school_holidays (country_code, label, zone, school_year,
                                 starts_on, ends_on, source, external_id,
                                 population, imported_at)
    values (v_pays, p->>'label', v_zone, p->>'school_year',
            (p->>'starts_on')::date, (p->>'ends_on')::date,
            'officiel', p->>'external_id', p->>'population', now())
    on conflict (country_code, zone, school_year, label, starts_on)
      where source = 'officiel'
    do update set ends_on = excluded.ends_on,
                  population = excluded.population,
                  imported_at = now(),
                  deleted_at = null;               -- une période rétablie réapparaît
    n := n + 1;
  end loop;

  return n;
end $$;

/** Correspondances subdivision → zone, alimentées par l'import officiel. */
create or replace function public.import_area_zones(p_pays text, p_lignes jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0;
begin
  if not exists (select 1 from calendar_countries where code = p_pays) then
    raise exception 'Pays non déclaré : %', p_pays;
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    if (l->>'area_code') is null or (l->>'zone_code') is null then continue; end if;
    if not exists (select 1 from calendar_zones
                   where country_code = p_pays and zone_code = l->>'zone_code') then
      continue;
    end if;
    insert into calendar_area_zones (country_code, area_code, area_label, zone_code)
    values (p_pays, upper(trim(l->>'area_code')), l->>'area_label', l->>'zone_code')
    on conflict (country_code, area_code) do update set
      area_label = excluded.area_label,
      zone_code = excluded.zone_code,
      imported_at = now();
    n := n + 1;
  end loop;

  return n;
end $$;

-- ---------- 10. Droits ----------
alter table calendar_countries  enable row level security;
alter table calendar_zones      enable row level security;
alter table calendar_area_zones enable row level security;

drop policy if exists countries_read on calendar_countries;
create policy countries_read on calendar_countries for select using (active);
drop policy if exists zones_read on calendar_zones;
create policy zones_read on calendar_zones for select using (active);
drop policy if exists area_zones_read on calendar_area_zones;
create policy area_zones_read on calendar_area_zones for select using (true);

revoke insert, update, delete on calendar_countries  from public, anon, authenticated;
revoke insert, update, delete on calendar_zones      from public, anon, authenticated;
revoke insert, update, delete on calendar_area_zones from public, anon, authenticated;
grant select on calendar_countries, calendar_zones, calendar_area_zones to anon, authenticated;

revoke all on function public.import_area_zones(text, jsonb) from public, anon, authenticated;
revoke all on function public.import_school_holidays(jsonb) from public, anon, authenticated;

revoke all on function public.pays_disponibles() from public;
revoke all on function public.zones_disponibles(text) from public;
grant execute on function public.pays_disponibles() to anon, authenticated;
grant execute on function public.zones_disponibles(text) to anon, authenticated;

revoke all on function public.deduire_zone(text, text, text) from public, anon;
revoke all on function public.set_household_location(uuid, text, text, text, text) from public, anon;
revoke all on function public.household_location(uuid) from public, anon;
revoke all on function public.list_school_holidays(uuid, date, date) from public, anon;
revoke all on function public.school_calendar_state(uuid) from public, anon;

grant execute on function public.deduire_zone(text, text, text) to authenticated;
grant execute on function public.set_household_location(uuid, text, text, text, text) to authenticated;
grant execute on function public.household_location(uuid) to authenticated;
grant execute on function public.list_school_holidays(uuid, date, date) to authenticated;
grant execute on function public.school_calendar_state(uuid) to authenticated;

commit;
