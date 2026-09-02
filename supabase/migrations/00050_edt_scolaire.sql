-- Coparentalité Zen — emploi du temps scolaire (import photo)
--
-- Rôle de cette migration
-- -----------------------
--
--   enfant_scolarite  configuration par enfant et par année scolaire :
--                      semaine A/B active ou non, son ancrage, et le
--                      compteur d'imports déjà consommés (quota).
--   edt_creneaux       les créneaux hebdomadaires eux-mêmes — récurrents
--                      (jour de semaine + heure), pas datés comme
--                      calendar_events. `source` distingue un créneau
--                      importé par photo d'un créneau ajouté à la main :
--                      un ré-import ne touche jamais les créneaux manuels.
--
-- POURQUOI PAS `zone_vacances`/`etablissement`/`niveau` sur enfant_scolarite
-- households.school_zone et children.school/school_class existent déjà —
-- les dupliquer ici créerait une deuxième source de vérité, à resynchroniser
-- indéfiniment. Le calendrier des vacances par zone existe déjà lui aussi
-- (school_holidays, alimenté par une synchronisation officielle depuis la
-- migration 00017) : aucun nouveau seed statique n'est nécessaire, la page
-- planning (src/app/app/planning/page.tsx) sait déjà exclure les jours de
-- vacances via `joursVacances`.
--
-- POURQUOI PAS DE FEATURE FLAG DÉDIÉ
-- Aucun système de feature flags n'existe dans ce dépôt (grep vérifié). Le
-- contrôle premium réel est `household_entitlement()` (horizon de date) +
-- `plans.limits jsonb`, colonne présente depuis la genèse (00001) mais
-- jamais utilisée. On la remplit ici plutôt que d'inventer un mécanisme
-- isolé — `edt_scolaire_enabled` y reste absent/false pour tous les plans :
-- voir le bloc "ACTIVATION" en fin de fichier, à exécuter à part, plus tard,
-- jamais dans cette migration (cf. consigne : ne pas activer en prod).
--
-- POURQUOI PAS DE FONCTION SECURITY DEFINER POUR L'ÉCRITURE RLS
-- AGENTS.md réserve cette obligation aux tables financières ; un planning
-- scolaire n'en est pas une, la RLS directe via can_write() suffit (comme
-- children_write). En revanche, la VALIDATION D'UN IMPORT (quota, entitlement)
-- est de la logique métier procédurale, pas un simple contrôle d'accès : elle
-- vit dans `enregistrer_edt_import`, en security definer, pour la même
-- raison que set_custody_rule ou set_school_zone.

begin;

-- ---------- 1. Tables ----------

create table if not exists enfant_scolarite (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id),
  annee_scolaire text not null,                -- ex. '2026-2027'
  semaine_ab_active boolean not null default false,
  date_ancrage_semaine_a date,                  -- lundi de départ de la semaine A
  imports_utilises int not null default 0,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (child_id, annee_scolaire),
  check (not semaine_ab_active or date_ancrage_semaine_a is not null),
  check (imports_utilises >= 0)
);
create index if not exists idx_es_child on enfant_scolarite(child_id) where deleted_at is null;

create table if not exists edt_creneaux (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id),
  annee_scolaire text not null,
  jour_semaine smallint not null check (jour_semaine between 1 and 5),  -- 1=lundi..5=vendredi, comme jourSemaine() dans custody.ts
  heure_debut time not null,
  heure_fin time not null,
  matiere text,
  salle text,
  professeur text,
  semaine_ab text check (semaine_ab in ('A','B') or semaine_ab is null),  -- null = toutes les semaines
  source text not null check (source in ('photo','manuel')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (heure_fin > heure_debut)
);
create index if not exists idx_edt_child_annee on edt_creneaux(child_id, annee_scolaire) where deleted_at is null;

-- ---------- 2. Horodatage (réutilise set_updated_at, déjà verrouillé en 00026) ----------

drop trigger if exists trg_enfant_scolarite_updated on enfant_scolarite;
create trigger trg_enfant_scolarite_updated
  before update on enfant_scolarite
  for each row execute function public.set_updated_at();

drop trigger if exists trg_edt_creneaux_updated on edt_creneaux;
create trigger trg_edt_creneaux_updated
  before update on edt_creneaux
  for each row execute function public.set_updated_at();

-- ---------- 3. RLS — pattern indirect (comme child_contacts) : ces tables ----------
-- portent child_id, pas household_id directement.

alter table enfant_scolarite enable row level security;
alter table edt_creneaux enable row level security;

drop policy if exists es_read on enfant_scolarite;
create policy es_read on enfant_scolarite for select
  using (exists (select 1 from children c where c.id = child_id and public.is_member(c.household_id)));
drop policy if exists es_write on enfant_scolarite;
create policy es_write on enfant_scolarite for insert
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));
drop policy if exists es_update on enfant_scolarite;
create policy es_update on enfant_scolarite for update
  using (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)))
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));

drop policy if exists edt_read on edt_creneaux;
create policy edt_read on edt_creneaux for select
  using (exists (select 1 from children c where c.id = child_id and public.is_member(c.household_id)));
drop policy if exists edt_write on edt_creneaux;
create policy edt_write on edt_creneaux for insert
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));
drop policy if exists edt_update on edt_creneaux;
create policy edt_update on edt_creneaux for update
  using (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)))
  with check (exists (select 1 from children c where c.id = child_id and public.can_write(c.household_id)));

-- ---------- 4. plans.limits — quota, jamais l'activation (voir "ACTIVATION" plus bas) ----------

update plans set limits = limits || '{"edt_scolaire_quota_annuel": 5}'::jsonb
 where id in ('premium','pro');

-- ---------- 5. Lecture : état (quota, config) pour un enfant ----------

create or replace function public.edt_scolaire_etat(
  p_household uuid, p_child uuid, p_annee text
)
returns table (
  actif boolean,
  imports_utilises int,
  imports_max int,
  semaine_ab_active boolean,
  date_ancrage_semaine_a date
)
language plpgsql stable security definer set search_path = public as $$
declare
  ent record;
  lim jsonb;
  cfg record;
begin
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;
  if not exists (select 1 from children where id = p_child and household_id = p_household) then
    raise exception 'Enfant introuvable dans ce foyer';
  end if;

  select * into ent from public.household_entitlement(p_household);
  select p.limits into lim from plans p where p.id = ent.plan_id;

  select es.imports_utilises, es.semaine_ab_active, es.date_ancrage_semaine_a
    into cfg
    from enfant_scolarite es
   where es.child_id = p_child and es.annee_scolaire = p_annee and es.deleted_at is null;

  return query select
    coalesce((lim->>'edt_scolaire_enabled')::boolean, false),
    coalesce(cfg.imports_utilises, 0),
    coalesce((lim->>'edt_scolaire_quota_annuel')::int, 0),
    coalesce(cfg.semaine_ab_active, false),
    cfg.date_ancrage_semaine_a;
end $$;

-- ---------- 6. Lecture : créneaux d'un enfant ----------

create or replace function public.list_edt_creneaux(p_child uuid, p_annee text)
returns table (
  id uuid, jour_semaine smallint, heure_debut time, heure_fin time,
  matiere text, salle text, professeur text, semaine_ab text, source text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.jour_semaine, e.heure_debut, e.heure_fin,
         e.matiere, e.salle, e.professeur, e.semaine_ab, e.source
    from edt_creneaux e
    join children c on c.id = e.child_id
   where e.child_id = p_child and e.annee_scolaire = p_annee and e.deleted_at is null
     and public.is_member(c.household_id)
   order by e.jour_semaine, e.heure_debut;
$$;

-- ---------- 7. Lecture : créneaux + config de tout le foyer (superposition planning) ----------

create or replace function public.list_edt_creneaux_foyer(p_household uuid, p_annee text)
returns table (
  child_id uuid, jour_semaine smallint, heure_debut time, heure_fin time,
  matiere text, salle text, semaine_ab text,
  semaine_ab_active boolean, date_ancrage_semaine_a date
)
language sql stable security definer set search_path = public as $$
  select e.child_id, e.jour_semaine, e.heure_debut, e.heure_fin, e.matiere, e.salle, e.semaine_ab,
         coalesce(es.semaine_ab_active, false), es.date_ancrage_semaine_a
    from edt_creneaux e
    join children c on c.id = e.child_id
    left join enfant_scolarite es
      on es.child_id = e.child_id and es.annee_scolaire = e.annee_scolaire and es.deleted_at is null
   where c.household_id = p_household and e.annee_scolaire = p_annee and e.deleted_at is null
     and public.is_member(p_household)
   order by e.jour_semaine, e.heure_debut;
$$;

-- ---------- 8. Écriture : commit d'un import validé ----------
-- Remplace UNIQUEMENT les créneaux source='photo' du même enfant/année — les
-- créneaux ajoutés à la main (source='manuel') ne sont jamais touchés par un
-- ré-import. Rien n'est écrit avant : la relecture/validation a lieu
-- entièrement côté client, cette fonction ne reçoit que le résultat déjà
-- approuvé par l'utilisateur.

create or replace function public.enregistrer_edt_import(
  p_household uuid,
  p_child uuid,
  p_annee text,
  p_semaine_ab_active boolean,
  p_date_ancrage date,
  p_creneaux jsonb   -- [{jour_semaine, heure_debut, heure_fin, matiere, salle, professeur, semaine_ab}]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ent record;
  lim jsonb;
  quota int;
  deja int;
  cr jsonb;
begin
  if not exists (select 1 from children where id = p_child and household_id = p_household) then
    raise exception 'Enfant introuvable dans ce foyer';
  end if;
  if not public.can_write(p_household) then
    raise exception 'Vous n''avez pas les droits pour modifier le planning de ce foyer';
  end if;

  select * into ent from public.household_entitlement(p_household);
  select p.limits into lim from plans p where p.id = ent.plan_id;
  if not coalesce((lim->>'edt_scolaire_enabled')::boolean, false) then
    raise exception 'L''emploi du temps scolaire n''est pas inclus dans votre offre actuelle.';
  end if;
  quota := coalesce((lim->>'edt_scolaire_quota_annuel')::int, 0);

  insert into enfant_scolarite (child_id, annee_scolaire, semaine_ab_active, date_ancrage_semaine_a, created_by)
  values (p_child, p_annee, p_semaine_ab_active, p_date_ancrage, auth.uid())
  on conflict (child_id, annee_scolaire) do update
    set semaine_ab_active = excluded.semaine_ab_active,
        date_ancrage_semaine_a = excluded.date_ancrage_semaine_a
  where enfant_scolarite.deleted_at is null;

  select imports_utilises into deja from enfant_scolarite
   where child_id = p_child and annee_scolaire = p_annee and deleted_at is null;
  if deja >= quota then
    raise exception 'Quota d''imports atteint pour cet enfant cette année scolaire (% sur %).', deja, quota;
  end if;

  update enfant_scolarite set imports_utilises = imports_utilises + 1
   where child_id = p_child and annee_scolaire = p_annee and deleted_at is null;

  update edt_creneaux set deleted_at = now()
   where child_id = p_child and annee_scolaire = p_annee and source = 'photo' and deleted_at is null;

  for cr in select * from jsonb_array_elements(coalesce(p_creneaux, '[]'::jsonb))
  loop
    insert into edt_creneaux (
      child_id, annee_scolaire, jour_semaine, heure_debut, heure_fin,
      matiere, salle, professeur, semaine_ab, source, created_by
    ) values (
      p_child, p_annee,
      (cr->>'jour_semaine')::smallint,
      (cr->>'heure_debut')::time,
      (cr->>'heure_fin')::time,
      cr->>'matiere', cr->>'salle', cr->>'professeur',
      nullif(cr->>'semaine_ab', ''),
      'photo', auth.uid()
    );
  end loop;
end $$;

revoke all on function public.enregistrer_edt_import from public, anon;
grant execute on function public.enregistrer_edt_import to authenticated;
revoke all on function public.edt_scolaire_etat from public, anon;
grant execute on function public.edt_scolaire_etat to authenticated;
revoke all on function public.list_edt_creneaux from public, anon;
grant execute on function public.list_edt_creneaux to authenticated;
revoke all on function public.list_edt_creneaux_foyer from public, anon;
grant execute on function public.list_edt_creneaux_foyer to authenticated;

commit;

-- ============================================================
-- SCÉNARIOS DE VÉRIFICATION (documentaires — voir supabase/tests/scolarite_test.sql
-- pour les assertions automatisées rejouables, mêmes fixtures que rls_fixtures.sql)
-- ============================================================
--
-- 1. Isolation : Carol (foyer B) ne doit rien voir sur Léa (foyer A) via
--    list_edt_creneaux ni edt_scolaire_etat — la jointure children->is_member
--    doit échouer silencieusement (0 ligne), pas lever d'exception, pour ne
--    pas révéler l'existence de l'enfant à un tiers.
--
-- 2. Quota : après 5 appels réussis à enregistrer_edt_import pour le même
--    enfant/année, le 6e doit lever une exception explicite, jamais une
--    écriture silencieuse.
--
-- 3. Entitlement : un foyer sur le plan 'free' (limits sans
--    edt_scolaire_enabled) doit voir enregistrer_edt_import lever une
--    exception, même avec can_write() = true (un propriétaire de foyer
--    gratuit ne doit pas pouvoir contourner le premium par cette voie).
--
-- 4. Ré-import : deux appels successifs à enregistrer_edt_import pour le
--    même enfant/année ne doivent jamais faire cohabiter deux versions des
--    créneaux source='photo' (le premier jeu doit finir deleted_at non nul) ;
--    un créneau source='manuel' ajouté entre les deux doit survivre intact.
--
-- ============================================================
-- ACTIVATION EN PRODUCTION (À NE PAS EXÉCUTER DANS CETTE MIGRATION)
-- Une fois la fonctionnalité vérifiée en conditions réelles :
--
--   update plans set limits = limits || '{"edt_scolaire_enabled": true}'::jsonb
--    where id in ('premium','pro');
--
-- ============================================================
