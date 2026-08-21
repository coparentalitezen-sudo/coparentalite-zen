-- Coparentalité Zen — paiement partagé entre les deux parents
--
-- Rôle de cette migration
-- -----------------------
-- La table subscriptions reste la source de vérité de l'accès du foyer : une
-- ligne, un foyer, contrainte d'unicité inchangée. Elle ne dit pas QUI a payé,
-- seulement si le foyer a droit à Zen Plus.
--
-- subscription_contributions décrit le versant facturation : une ligne par
-- règlement individuel. Un paiement intégral en produit une (share_type
-- 'full'), un partage 50/50 en produit deux ('half'). L'accès du foyer se
-- déduit de l'état de ces lignes, jamais l'inverse.
--
-- Impact sur les abonnements existants
-- ------------------------------------
-- Aucun. La table est créée vide, les abonnements en cours continuent de
-- fonctionner sur subscriptions seule. recalculer_partage() n'est appelée que
-- pour un foyer possédant au moins une contribution : un foyer historique,
-- sans contribution, n'est jamais touché.
--
-- Retour arrière
-- --------------
--   begin;
--   drop function if exists public.recalculer_partage(uuid);
--   drop function if exists public.enregistrer_contribution(uuid, uuid, text, text, bigint, text, text, text, timestamptz);
--   drop table if exists public.subscription_contributions;
--   commit;
-- Aucune donnée de subscriptions n'est modifiée par la création : le retour
-- arrière est sans perte tant qu'aucun partage n'a été encaissé. Une fois des
-- partages encaissés, conserver la table (les lignes justifient les montants).

begin;

-- ---------- 1. Contributions individuelles ----------
create table if not exists public.subscription_contributions (
  id                         uuid primary key default gen_random_uuid(),
  household_id               uuid not null references public.households(id),
  subscription_id            uuid references public.subscriptions(id),
  user_id                    uuid not null references public.profiles(id),
  -- 'full' : un parent règle la totalité. 'half' : chacun règle sa moitié.
  share_type                 text not null check (share_type in ('full', 'half')),
  amount_cents               bigint not null check (amount_cents >= 0),
  status                     text not null default 'awaiting_payment'
    check (status in ('awaiting_partner', 'invited', 'awaiting_payment',
                      'paid', 'failed', 'refused', 'expired', 'canceled')),
  -- Identifiants Stripe. Aucune coordonnée bancaire n'est stockée ici : ces
  -- champs ne sont que des références vers des objets détenus par Stripe.
  stripe_customer_id         text,
  stripe_subscription_id     text,
  stripe_checkout_session_id text,
  -- Groupe les deux moitiés d'un même partage ; identique pour les deux lignes.
  partage_id                 uuid not null default gen_random_uuid(),
  expires_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ---------- 2. Unicité : empêcher les doubles paiements ----------
-- Un même parent ne peut avoir qu'une seule contribution vivante par foyer.
-- Index partiel : les lignes terminées (payées, refusées, expirées, annulées)
-- restent en base pour l'historique sans bloquer une nouvelle tentative.
-- Attention : cet index étant partiel, tout « on conflict » qui le viserait
-- devrait répéter la clause where à l'identique. On ne s'appuie donc jamais
-- dessus pour un upsert — les écritures passent par la fonction ci-dessous,
-- qui teste explicitement avant d'insérer.
create unique index if not exists uniq_contribution_vivante
  on public.subscription_contributions (household_id, user_id)
  where status in ('awaiting_partner', 'invited', 'awaiting_payment');

-- Une session Checkout ne peut créditer qu'une seule contribution : c'est la
-- garantie qu'un webhook rejoué, ou un double clic, ne facture pas deux fois.
create unique index if not exists uniq_contribution_session
  on public.subscription_contributions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists uniq_contribution_abonnement
  on public.subscription_contributions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Un partage 50/50 ne compte jamais plus de deux parts.
create unique index if not exists uniq_partage_par_parent
  on public.subscription_contributions (partage_id, user_id);

create index if not exists idx_contribution_foyer
  on public.subscription_contributions (household_id, created_at desc);
create index if not exists idx_contribution_partage
  on public.subscription_contributions (partage_id);
-- Balayage des demandes périmées par le traitement planifié.
create index if not exists idx_contribution_echeance
  on public.subscription_contributions (expires_at)
  where status in ('awaiting_partner', 'invited', 'awaiting_payment');

create or replace function public.touch_contribution() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_contribution on public.subscription_contributions;
create trigger trg_touch_contribution
  before update on public.subscription_contributions
  for each row execute function public.touch_contribution();

-- ---------- 3. Politiques RLS ----------
-- Lecture : les membres du foyer voient les contributions du foyer. C'est
-- volontaire — l'autre parent doit pouvoir constater que l'abonnement est
-- actif et où en est le partage. Aucune donnée bancaire n'y figure : les
-- colonnes Stripe ne sont que des références opaques.
--
-- Écriture : aucune. Les contributions naissent et changent d'état par le
-- webhook Stripe et les routes serveur, sous service_role. Un client ne doit
-- jamais pouvoir se déclarer payeur.
alter table public.subscription_contributions enable row level security;

drop policy if exists contributions_lecture on public.subscription_contributions;
create policy contributions_lecture on public.subscription_contributions
  for select to authenticated
  using (public.is_member(household_id));

revoke all on public.subscription_contributions from public, anon;
grant select on public.subscription_contributions to authenticated;
-- REVOKE ... FROM PUBLIC retire aussi les droits implicites de service_role :
-- il faut les rendre explicitement, sans quoi le webhook échoue en silence.
grant select, insert, update on public.subscription_contributions to service_role;

-- ---------- 4. Recalcul de l'accès du foyer ----------
-- Idempotente par construction : elle lit l'état des parts et en déduit
-- l'accès. Rejouer un webhook ne peut donc pas faire avancer l'abonnement.
--
-- Règle unique : le foyer n'est ouvert que si TOUTES les parts vivantes du
-- partage le plus récent sont payées. L'accord de l'autre parent ne suffit
-- pas ; seule la confirmation Stripe compte.
create or replace function public.recalculer_partage(p_household uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_partage    uuid;
  v_total      int;
  v_payees     int;
  v_perdues    int;
  v_etat       text;
begin
  select c.partage_id into v_partage
    from subscription_contributions c
   where c.household_id = p_household
     and c.status <> 'canceled'
   order by c.created_at desc
   limit 1;

  if v_partage is null then
    return 'aucun';
  end if;

  select count(*), count(*) filter (where status = 'paid'),
         count(*) filter (where status in ('refused', 'expired', 'failed'))
    into v_total, v_payees, v_perdues
    from subscription_contributions
   where partage_id = v_partage;

  if v_payees = v_total then
    v_etat := 'actif';
  elsif v_perdues > 0 and v_payees > 0 then
    -- Une part encaissée, l'autre perdue : régularisation manuelle attendue.
    v_etat := 'remboursement_du';
  elsif v_perdues > 0 then
    v_etat := 'interrompu';
  elsif v_payees > 0 then
    v_etat := 'moitie_payee';
  else
    v_etat := 'en_attente';
  end if;

  -- L'accès n'est ouvert qu'à l'état 'actif'. Dans tous les autres cas on ne
  -- touche pas à subscriptions : un foyer déjà abonné par ailleurs ne doit pas
  -- perdre son accès parce qu'un partage est en cours.
  if v_etat = 'actif' then
    update subscriptions s
       set status = 'active', updated_at = now()
     where s.household_id = p_household
       and s.status <> 'active';
  end if;

  return v_etat;
end $$;

revoke all on function public.recalculer_partage(uuid) from public, anon, authenticated;
grant execute on function public.recalculer_partage(uuid) to service_role;

-- ---------- 5. Écriture d'une contribution ----------
-- Point d'entrée unique des routes serveur et du webhook. Teste avant
-- d'insérer plutôt que de s'appuyer sur un « on conflict » visant un index
-- partiel : la clause where devrait y être répétée mot pour mot, et un écart
-- ferait échouer l'upsert en silence.
create or replace function public.enregistrer_contribution(
  p_household uuid,
  p_user      uuid,
  p_share     text,
  p_status    text,
  p_amount    bigint,
  p_partage   uuid,
  p_customer  text default null,
  p_session   text default null,
  p_expires   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id
    from subscription_contributions
   where household_id = p_household and user_id = p_user
     and status in ('awaiting_partner', 'invited', 'awaiting_payment');

  if v_id is not null then
    update subscription_contributions
       set status = p_status,
           amount_cents = p_amount,
           partage_id = p_partage,
           stripe_customer_id = coalesce(p_customer, stripe_customer_id),
           stripe_checkout_session_id = coalesce(p_session, stripe_checkout_session_id),
           expires_at = coalesce(p_expires, expires_at)
     where id = v_id;
    return v_id;
  end if;

  insert into subscription_contributions
    (household_id, user_id, share_type, status, amount_cents, partage_id,
     stripe_customer_id, stripe_checkout_session_id, expires_at)
  values
    (p_household, p_user, p_share, p_status, p_amount, p_partage,
     p_customer, p_session, p_expires)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.enregistrer_contribution(uuid, uuid, text, text, bigint, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enregistrer_contribution(uuid, uuid, text, text, bigint, uuid, text, text, timestamptz)
  to service_role;

commit;
