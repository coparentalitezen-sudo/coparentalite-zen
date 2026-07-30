-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00016 : grille tarifaire unique
--
-- PROBLÈME RÉSOLU
-- Trois prix coexistaient : 4,99 €/mois en base, 4,99 €/an puis 1,49 €/mois
-- ou 14,99 €/an sur la page commerciale, et un montant codé en dur dans
-- l'écran d'offre. Annoncer un tarif et en facturer un autre est le genre
-- d'écart qui se règle devant un médiateur de la consommation.
--
-- La table plans devient la SEULE source de vérité :
--   * price_cents_monthly / price_cents_yearly : les deux formules ;
--   * stripe_price_id_monthly / stripe_price_id_yearly : les tarifs Stripe ;
--   * public_label : ce que le client lit, calculé une fois pour toutes.
-- La page commerciale, l'écran d'offre et Stripe lisent tous cette table.
-- Aucun montant n'est plus écrit dans le code.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- ---------- 1. Deux formules d'abonnement ----------
alter table plans add column if not exists price_cents_yearly bigint not null default 0;
alter table plans add column if not exists stripe_price_id_monthly text;
alter table plans add column if not exists stripe_price_id_yearly text;
alter table plans add column if not exists public_label text;
alter table plans add column if not exists sort_order smallint not null default 100;
alter table plans add column if not exists features jsonb not null default '[]';

-- La colonne stripe_price_id existait sans périodicité : on la reprend comme
-- tarif mensuel pour ne perdre aucune configuration déjà saisie.
update plans set stripe_price_id_monthly = stripe_price_id
 where stripe_price_id is not null and stripe_price_id_monthly is null;

-- ---------- 2. Grille appliquée ----------
-- Valeurs alignées sur la page commerciale : 1,49 €/mois ou 14,99 €/an.
-- Modifier un prix se fait ICI, et nulle part ailleurs.
update plans set
  name = 'Gratuit',
  public_label = 'Gratuit',
  price_cents_monthly = 0,
  price_cents_yearly = 0,
  sort_order = 10,
  features = '["Planning de garde sur 3 mois",
               "Dépenses partagées illimitées",
               "Justificatifs photo",
               "Validation par les deux parents",
               "Export de vos données"]'::jsonb
 where id = 'free';

update plans set
  name = 'Coparentalité Zen Plus',
  public_label = 'Zen Plus',
  price_cents_monthly = 149,
  price_cents_yearly = 1499,
  sort_order = 20,
  features = '["Planning sans limite de durée",
               "Vacances et changements ponctuels illimités",
               "Export PDF mensuel du planning et des dépenses",
               "Historique complet des modifications",
               "Justificatifs multiples par dépense"]'::jsonb
 where id = 'premium';

update plans set
  public_label = 'Professionnel',
  sort_order = 30
 where id = 'pro';

-- ---------- 3. Extensions : mêmes prix qu'annoncés publiquement ----------
alter table plan_extensions add column if not exists description text;
alter table plan_extensions add column if not exists recommande boolean not null default false;

update plan_extensions set
  label = '+1 mois', price_cents = 99, sort_order = 10, recommande = false,
  description = 'Pour préparer une période ponctuelle un peu plus éloignée.'
 where id = 'ext_1m';

update plan_extensions set
  label = '+6 mois', price_cents = 399, sort_order = 20, recommande = true,
  description = 'Idéal pour organiser les prochaines vacances et la rentrée.'
 where id = 'ext_6m';

update plan_extensions set
  label = '+12 mois', price_cents = 599, sort_order = 30, recommande = false,
  description = 'Pour préparer sereinement une année complète.'
 where id = 'ext_12m';

-- Grille des extensions, publique comme celle des abonnements
create or replace function public.grille_extensions()
returns table (
  extension_id text, libelle text, mois int, prix_cents bigint,
  description text, recommande boolean, ordre smallint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.label, e.months, e.price_cents,
         e.description, e.recommande, e.sort_order
  from plan_extensions e
  where e.active
  order by e.sort_order
$$;

revoke all on function public.grille_extensions() from public;
grant execute on function public.grille_extensions() to anon, authenticated;

-- ---------- 3 bis. Grille tarifaire publique ----------
-- Lisible sans authentification : c'est une grille de prix, elle doit
-- s'afficher sur la page d'accueil comme dans l'application.
create or replace function public.grille_tarifaire()
returns table (
  plan_id            text,
  libelle            text,
  prix_mensuel_cents bigint,
  prix_annuel_cents  bigint,
  economie_annuelle_cents bigint,
  fonctions          jsonb,
  ordre              smallint
)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.public_label, p.name),
         p.price_cents_monthly, p.price_cents_yearly,
         -- Économie réalisée en payant à l'année, calculée et non ressaisie
         greatest(0, p.price_cents_monthly * 12 - p.price_cents_yearly),
         p.features, p.sort_order
  from plans p
  where p.id in ('free', 'premium')
  order by p.sort_order
$$;

revoke all on function public.grille_tarifaire() from public;
grant execute on function public.grille_tarifaire() to anon, authenticated;

-- ---------- 4. L'offre du foyer expose les deux formules ----------
drop function if exists public.household_entitlement(uuid);

create or replace function public.household_entitlement(p_household uuid)
returns table (
  plan_id          text,
  plan_label       text,
  prix_mensuel_cents bigint,
  prix_annuel_cents  bigint,
  periodicite_active text,        -- 'month' | 'year' | null si sans abonnement
  illimite         boolean,
  horizon          date,
  jours_restants   int,
  mois_offerts     int,
  mois_ajoutes     int,
  abonnement_actif boolean,
  abonnement_fin   timestamptz,
  resiliation_programmee boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  base_mois   int := 3;
  ajoutes     int := 0;
  cree        timestamptz;
  sub         record;
  actif       boolean := false;
  fin         date;
  prix_m      bigint;
  prix_a      bigint;
  periode     text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  select h.created_at into cree from households h
   where h.id = p_household and h.deleted_at is null;
  if cree is null then raise exception 'Foyer introuvable'; end if;

  select p.price_cents_monthly, p.price_cents_yearly into prix_m, prix_a
    from plans p where p.id = 'premium';

  select coalesce(sum(e.months), 0)::int into ajoutes
    from household_extensions e where e.household_id = p_household;

  select s.* into sub from subscriptions s where s.household_id = p_household;
  actif := sub.id is not null
       and sub.status in ('active', 'trialing')
       and (sub.current_period_end is null or sub.current_period_end > now());

  if actif then
    -- La formule souscrite se déduit du tarif Stripe enregistré
    select case
             when sub.stripe_price_id is not null
              and sub.stripe_price_id = (select stripe_price_id_yearly from plans where id = 'premium')
             then 'year' else 'month' end
      into periode;
    return query select
      coalesce(sub.plan_id, 'premium'),
      (select coalesce(p.public_label, p.name) from plans p where p.id = coalesce(sub.plan_id, 'premium')),
      prix_m, prix_a, periode,
      true, null::date, null::int, base_mois, ajoutes,
      true, sub.current_period_end, coalesce(sub.cancel_at_period_end, false);
    return;
  end if;

  fin := (cree + make_interval(months => base_mois + ajoutes))::date;
  return query select
    'free',
    (select coalesce(p.public_label, p.name) from plans p where p.id = 'free'),
    prix_m, prix_a, null::text,
    false, fin, greatest(0, (fin - current_date))::int, base_mois, ajoutes,
    false, null::timestamptz, false;
end $$;

revoke all on function public.household_entitlement(uuid) from public, anon;
grant execute on function public.household_entitlement(uuid) to authenticated;

-- ---------- 5. Tarif Stripe résolu côté serveur ----------
-- Le client demande une formule ; c'est la base qui fournit l'identifiant
-- Stripe correspondant. Un client modifié ne peut pas s'inventer un prix.
create or replace function public.tarif_stripe(p_plan text, p_periode text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare id_tarif text;
begin
  if p_periode not in ('month', 'year') then
    raise exception 'Périodicité inconnue : %', p_periode;
  end if;
  select case when p_periode = 'year' then p.stripe_price_id_yearly
              else p.stripe_price_id_monthly end
    into id_tarif
  from plans p where p.id = p_plan;
  return id_tarif;
end $$;

-- Un identifiant de tarif Stripe n'est pas un secret : il apparaît dans toute
-- page de paiement. La fonction ne révèle aucun montant et sert à la route de
-- paiement, qui s'exécute avec la session de l'utilisateur.
revoke all on function public.tarif_stripe(text, text) from public, anon;
grant execute on function public.tarif_stripe(text, text) to authenticated;

commit;
