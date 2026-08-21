-- Coparentalité Zen — paiement partagé entre les deux parents
--
-- Rôle de cette migration
-- -----------------------
-- Trois niveaux, un seul sens de lecture :
--
--   subscription_payment_arrangements  ce qui a été convenu : mode, montant
--                                      total, nombre de parts attendues
--   subscription_contributions         ce que chaque parent a engagé, une
--                                      ligne par parent
--   subscriptions                      le droit d'accès du foyer, inchangé,
--                                      toujours une seule ligne par foyer
--
-- L'arrangement est la source du nombre de parts attendues. On ne le déduit
-- jamais des lignes présentes : une contribution annulée ne doit pas faire
-- croire qu'un partage à deux n'en attend plus qu'une.
--
-- Aucune carte n'est débitée avant que les deux moyens de paiement soient
-- validés. Le parcours est donc : empreinte du premier parent, accord et
-- empreinte du second, puis débit des deux — d'où les états awaiting_*_setup
-- et ready_to_charge. C'est ce qui rend le remboursement inutile, plutôt que
-- rare.
--
-- Impact sur les abonnements existants
-- ------------------------------------
-- Les deux tables sont créées vides. subscriptions reçoit deux colonnes
-- nullables, laissées à null sur toutes les lignes existantes : un abonnement
-- historique reste donc marqué comme n'étant issu d'aucun arrangement, et
-- l'échec d'un partage ultérieur ne peut pas le révoquer. Aucune ligne
-- existante n'est modifiée par cette migration.
--
-- Deux points laissés ouverts, à trancher avant mise en service
-- ------------------------------------------------------------
-- 1. grace_until est renseignée mais household_entitlement ne la lit pas :
--    l'y brancher changerait la règle d'accès en vigueur, ce qui demande une
--    validation métier séparée. En l'état la colonne est inerte.
-- 2. subscriptions.stripe_subscription_id ne peut porter qu'un identifiant.
--    Un partage en produit deux. La colonne est donc laissée à null en mode
--    'half' : les deux abonnements Stripe vivent dans les contributions, et
--    le portail de facturation doit être ouvert depuis la contribution du
--    parent connecté, jamais depuis subscriptions.
--
-- Retour arrière
-- --------------
--   begin;
--   drop function if exists public.maj_contribution_stripe(text, text, timestamptz, int);
--   drop function if exists public.lire_partage(uuid);
--   drop function if exists public.recalculer_partage(uuid, timestamptz, int);
--   drop function if exists public.enregistrer_contribution(uuid, uuid, text, bigint, text, text, text);
--   drop function if exists public.ouvrir_arrangement(uuid, text, text, text, bigint, timestamptz);
--   drop trigger if exists trg_touch_contribution on public.subscription_contributions;
--   drop trigger if exists trg_touch_arrangement on public.subscription_payment_arrangements;
--   drop function if exists public.touch_contribution();
--   alter table public.subscriptions drop column if exists arrangement_id;
--   alter table public.subscriptions drop column if exists grace_until;
--   drop table if exists public.subscription_contributions;
--   drop table if exists public.subscription_payment_arrangements;
--   commit;
--
-- L'ordre compte. subscriptions.arrangement_id référence les arrangements :
-- la colonne doit tomber avant la table. Les contributions référencent
-- l'arrangement : elles tombent avant lui. Le retour arrière est sans perte
-- tant qu'aucun partage n'a été encaissé ; passé ce stade, conserver les deux
-- tables — elles justifient les montants prélevés.

begin;

-- ---------- 1. Arrangement : ce qui a été convenu ----------
create table if not exists public.subscription_payment_arrangements (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households(id) on delete cascade,
  mode                   text not null check (mode in ('full', 'half')),
  expected_contributions smallint not null check (expected_contributions in (1, 2)),
  status                 text not null default 'awaiting_first_setup'
    check (status in ('awaiting_first_setup', 'awaiting_partner',
                      'awaiting_second_setup', 'ready_to_charge', 'processing',
                      'active', 'failed', 'refused', 'expired', 'canceled')),
  plan_id                text not null references public.plans(id),
  billing_period         text not null check (billing_period in ('month', 'year')),
  total_amount_cents     bigint not null check (total_amount_cents > 0),
  currency               char(3) not null default 'eur',
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Le mode dicte le nombre de parts. Aucun arrangement 'full' à deux parts,
  -- aucun 'half' à une seule : la cohérence est structurelle, pas applicative.
  constraint mode_coherent check (
    (mode = 'full' and expected_contributions = 1)
    or (mode = 'half' and expected_contributions = 2)
  ),
  -- Référencée par la clé étrangère composite des contributions : garantit
  -- qu'une contribution et son arrangement portent le même foyer.
  unique (id, household_id)
);

-- Un seul arrangement vivant par foyer : un partage en cours ne peut pas être
-- remplacé en silence par un second. La seconde ouverture échoue franchement.
create unique index if not exists uniq_arrangement_vivant
  on public.subscription_payment_arrangements (household_id)
  where status in ('awaiting_first_setup', 'awaiting_partner',
                   'awaiting_second_setup', 'ready_to_charge', 'processing');

create index if not exists idx_arrangement_foyer
  on public.subscription_payment_arrangements (household_id, created_at desc);
create index if not exists idx_arrangement_echeance
  on public.subscription_payment_arrangements (expires_at)
  where status in ('awaiting_first_setup', 'awaiting_partner',
                   'awaiting_second_setup', 'ready_to_charge');

-- ---------- 2. Contributions individuelles ----------
create table if not exists public.subscription_contributions (
  id                         uuid primary key default gen_random_uuid(),
  arrangement_id             uuid not null,
  household_id               uuid not null,
  -- on delete set null : la disparition du droit d'accès ne doit pas effacer
  -- la trace d'un règlement.
  subscription_id            uuid references public.subscriptions(id) on delete set null,
  -- on delete restrict : un profil ayant réglé quelque chose ne s'efface pas
  -- tacitement. delete_my_account() devra statuer sur la contribution.
  user_id                    uuid not null references public.profiles(id) on delete restrict,
  share_type                 text not null check (share_type in ('full', 'half')),
  amount_cents               bigint not null check (amount_cents > 0),
  status                     text not null default 'awaiting_first_setup'
    check (status in ('awaiting_first_setup', 'awaiting_partner',
                      'awaiting_second_setup', 'ready_to_charge', 'processing',
                      'paid', 'past_due', 'failed', 'refused', 'expired',
                      'canceled')),
  -- Références Stripe strictement utiles au serveur. Aucune coordonnée
  -- bancaire : ce sont des identifiants opaques d'objets détenus par Stripe.
  -- Le Setup Intent porte l'empreinte, le Payment Method sert au débit
  -- différé une fois les deux empreintes réunies.
  stripe_customer_id         text,
  stripe_setup_intent_id     text,
  stripe_payment_method_id   text,
  stripe_subscription_id     text,
  stripe_checkout_session_id text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- Le foyer d'une contribution est celui de son arrangement, par construction.
  foreign key (arrangement_id, household_id)
    references public.subscription_payment_arrangements (id, household_id)
    on delete cascade,
  -- Un parent ne contribue qu'une fois par arrangement. Contrainte réelle et
  -- non partielle : elle est donc ciblable par un ON CONFLICT, ce qui rend
  -- l'écriture atomique possible plus bas.
  unique (arrangement_id, user_id)
);

-- Un identifiant Stripe ne crédite qu'une seule contribution : c'est la
-- garantie qu'un webhook rejoué ou un double clic ne facture pas deux fois.
create unique index if not exists uniq_contribution_session
  on public.subscription_contributions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index if not exists uniq_contribution_abonnement
  on public.subscription_contributions (stripe_subscription_id)
  where stripe_subscription_id is not null;
create unique index if not exists uniq_contribution_setup
  on public.subscription_contributions (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

-- Clés étrangères interrogées seules : sans index, chaque suppression de
-- profil ou d'abonnement balaierait la table entière.
create index if not exists idx_contribution_utilisateur
  on public.subscription_contributions (user_id);
create index if not exists idx_contribution_abonnement_lien
  on public.subscription_contributions (subscription_id)
  where subscription_id is not null;
create index if not exists idx_contribution_foyer
  on public.subscription_contributions (household_id, created_at desc);
create index if not exists idx_contribution_arrangement
  on public.subscription_contributions (arrangement_id);

-- ---------- 3. Rattachement du droit d'accès à son arrangement ----------
-- Sans cette colonne, l'échec d'un partage 50/50 révoquerait indistinctement
-- un abonnement intégral valide souscrit auparavant. Elle dit quel
-- arrangement a ouvert le droit en cours ; null signifie « aucun », donc
-- « ne pas y toucher au titre d'un partage ».
alter table public.subscriptions
  add column if not exists arrangement_id uuid
    references public.subscription_payment_arrangements(id) on delete set null;
alter table public.subscriptions
  add column if not exists grace_until timestamptz;
create index if not exists idx_subscription_arrangement
  on public.subscriptions (arrangement_id) where arrangement_id is not null;

-- ---------- 4. Horodatage ----------
create or replace function public.touch_contribution() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_contribution on public.subscription_contributions;
create trigger trg_touch_contribution
  before update on public.subscription_contributions
  for each row execute function public.touch_contribution();

drop trigger if exists trg_touch_arrangement on public.subscription_payment_arrangements;
create trigger trg_touch_arrangement
  before update on public.subscription_payment_arrangements
  for each row execute function public.touch_contribution();

-- ---------- 5. Cohérence d'une contribution ----------
-- Volontairement PAS de déclencheur. Le plafond du nombre de parts,
-- l'appartenance au foyer et la correspondance au mode sont garantis
-- transactionnellement par enregistrer_contribution(), qui verrouille
-- l'arrangement avant de décider — voir section 8. Un déclencheur aurait
-- dispersé la règle en deux endroits sans rien garantir de plus : le verrou
-- reste nécessaire dans les deux cas.
--
-- Ce que la base garantit seule, déclarativement :
--   - un parent ne contribue qu'une fois par arrangement  → unique (arrangement_id, user_id)
--   - une part appartient au foyer de son arrangement     → clé étrangère composite
--   - le mode dicte le nombre attendu                     → contrainte mode_coherent
--   - un identifiant Stripe ne sert qu'une fois           → index uniques partiels
-- Le reste relève des fonctions serveur, et est revérifié avant activation.
drop trigger if exists trg_coherence_contribution on public.subscription_contributions;
drop function if exists public.verifier_contribution();

-- ---------- 6. Confidentialité : RLS et lecture filtrée ----------
-- Les tables complètes ne sont lisibles que par service_role. Les parents y
-- accèdent par lire_partage(), qui ne rend ni identifiant Stripe ni empreinte
-- de moyen de paiement : seulement les montants, le parent concerné, le mode
-- et les états fonctionnels.
--
-- RLS activée sans aucune politique permissive : tout rôle qui y est soumis
-- se voit refuser l'accès. service_role n'y est pas soumis.
alter table public.subscription_payment_arrangements enable row level security;
alter table public.subscription_contributions enable row level security;

drop policy if exists contributions_lecture on public.subscription_contributions;

revoke all on public.subscription_payment_arrangements from public, anon, authenticated;
revoke all on public.subscription_contributions from public, anon, authenticated;
-- REVOKE ... FROM PUBLIC retire aussi les droits implicites de service_role :
-- il faut les rendre explicitement, sans quoi le webhook échoue en silence.
grant select, insert, update on public.subscription_payment_arrangements to service_role;
grant select, insert, update on public.subscription_contributions to service_role;

-- Lecture destinée aux deux parents du foyer. Volontairement large sur les
-- états — l'autre parent doit pouvoir constater où en est le partage — et
-- muette sur tout ce qui touche à Stripe.
create or replace function public.lire_partage(p_household uuid)
returns table (
  arrangement_id   uuid,
  mode             text,
  etat_arrangement text,
  parts_attendues  smallint,
  total_cents      bigint,
  devise           char(3),
  periodicite      text,
  expire_le        timestamptz,
  parent_id        uuid,
  part_cents       bigint,
  etat_part        text,
  est_moi          boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_member(p_household) then raise exception 'Foyer inaccessible'; end if;

  return query
    select a.id, a.mode, a.status, a.expected_contributions,
           a.total_amount_cents, a.currency, a.billing_period, a.expires_at,
           c.user_id, c.amount_cents, c.status, c.user_id = auth.uid()
      from subscription_payment_arrangements a
      left join subscription_contributions c on c.arrangement_id = a.id
     where a.household_id = p_household
       and a.id = (
         select a2.id from subscription_payment_arrangements a2
          where a2.household_id = p_household
          order by a2.created_at desc limit 1
       )
     order by c.created_at;
end $$;

revoke all on function public.lire_partage(uuid) from public, anon;
grant execute on function public.lire_partage(uuid) to authenticated, service_role;

-- ---------- 7. Ouverture d'un arrangement ----------
-- Point d'entrée unique côté serveur. Échoue franchement si un arrangement
-- est déjà vivant pour ce foyer, plutôt que d'en ouvrir un second en silence.
create or replace function public.ouvrir_arrangement(
  p_household uuid,
  p_mode      text,
  p_plan      text,
  p_periode   text,
  p_total     bigint,
  p_expires   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'Montant total invalide : %', p_total;
  end if;

  -- Un foyer ne détient jamais deux droits à la fois. Ouvrir un partage
  -- alors qu'un abonnement intégral court reviendrait à faire cohabiter deux
  -- abonnements Stripe pour le même accès, et à laisser un échec de moitié
  -- dégrader un droit déjà payé. Le changement de mode se fera à l'échéance
  -- de la période en cours, par un parcours distinct.
  if exists (
    select 1 from subscriptions s
     where s.household_id = p_household
       and s.status in ('active', 'trialing')
       and (s.current_period_end is null or s.current_period_end > now())
  ) then
    raise exception 'Ce foyer dispose déjà d''un abonnement actif. '
      'Le changement de mode de règlement sera possible à la fin de la période en cours.';
  end if;

  insert into subscription_payment_arrangements
    (household_id, mode, expected_contributions, plan_id, billing_period,
     total_amount_cents, expires_at)
  values
    (p_household, p_mode, case when p_mode = 'full' then 1 else 2 end,
     p_plan, p_periode, p_total, p_expires)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Un règlement est déjà en cours pour ce foyer.';
end $$;

revoke all on function public.ouvrir_arrangement(uuid, text, text, text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ouvrir_arrangement(uuid, text, text, text, bigint, timestamptz)
  to service_role;

-- ---------- 8. Écriture d'une contribution ----------
-- Atomique. L'insertion tente d'abord ; le conflit sur (arrangement_id,
-- user_id) — contrainte réelle, non partielle, donc ciblable — bascule en
-- mise à jour. Deux appels concurrents ne peuvent pas produire deux lignes :
-- le second attend la fin du premier, puis le met à jour.
create or replace function public.enregistrer_contribution(
  p_arrangement uuid,
  p_user        uuid,
  p_status      text,
  p_amount      bigint,
  p_customer    text default null,
  p_setup       text default null,
  p_session     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid;
  v_arr      record;
  v_vives    int;
  v_existe   boolean;
begin
  -- Verrou d'abord : tout ce qui suit décide à partir d'un décompte, et deux
  -- appels concurrents doivent se sérialiser ici plutôt que de compter tous
  -- les deux « une part sur deux » avant d'en insérer chacun une.
  select * into v_arr from subscription_payment_arrangements
   where id = p_arrangement for update;
  if v_arr.id is null then
    raise exception 'Arrangement introuvable : %', p_arrangement;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant de contribution invalide : %', p_amount;
  end if;

  -- Le payeur doit être membre du foyer qu'il finance.
  if not exists (
    select 1 from household_members
     where household_id = v_arr.household_id
       and profile_id = p_user and deleted_at is null
  ) then
    raise exception 'Ce parent n''appartient pas au foyer concerné.';
  end if;

  -- Plafond. Le nombre attendu vient de l'arrangement ; une part annulée
  -- sort du décompte des vivantes mais ne réduit jamais le nombre attendu.
  -- Une mise à jour de sa propre part ne consomme pas de place.
  select count(*), bool_or(user_id = p_user)
    into v_vives, v_existe
    from subscription_contributions
   where arrangement_id = p_arrangement and status <> 'canceled';

  if not coalesce(v_existe, false)
     and v_vives >= v_arr.expected_contributions then
    raise exception 'Arrangement % : % parts déjà engagées pour % attendues.',
      v_arr.id, v_vives, v_arr.expected_contributions;
  end if;

  insert into subscription_contributions
    (arrangement_id, household_id, user_id, share_type, status, amount_cents,
     stripe_customer_id, stripe_setup_intent_id, stripe_checkout_session_id)
  values
    (p_arrangement, v_arr.household_id, p_user, v_arr.mode, p_status, p_amount,
     p_customer, p_setup, p_session)
  on conflict (arrangement_id, user_id) do update set
    status = excluded.status,
    amount_cents = excluded.amount_cents,
    stripe_customer_id = coalesce(excluded.stripe_customer_id,
                                  subscription_contributions.stripe_customer_id),
    stripe_setup_intent_id = coalesce(excluded.stripe_setup_intent_id,
                                      subscription_contributions.stripe_setup_intent_id),
    stripe_checkout_session_id = coalesce(excluded.stripe_checkout_session_id,
                                          subscription_contributions.stripe_checkout_session_id)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.enregistrer_contribution(uuid, uuid, text, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enregistrer_contribution(uuid, uuid, text, bigint, text, text, text)
  to service_role;

-- ---------- 9. Recalcul du droit d'accès ----------
-- Idempotente : elle lit l'état des parts et en déduit l'accès. Rejouer un
-- webhook ne peut pas faire avancer l'abonnement.
--
-- Ne renvoie jamais 'actif' sans avoir effectivement inscrit un droit dans
-- subscriptions : l'écriture précède la valeur de retour, dans la même
-- transaction, et une relecture le vérifie avant de l'annoncer.
--
-- Un groupe incohérent — mauvais nombre de parts, parts d'un même parent,
-- somme fausse — renvoie 'invalide' et n'ouvre rien.
create or replace function public.recalculer_partage(
  p_household  uuid,
  p_period_end timestamptz default null,
  p_grace_days int default 7
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_arr      record;
  v_vives    int;
  v_parents  int;
  v_payees   int;
  v_perdues  int;
  v_retard   int;
  v_somme    bigint;
  v_abo      record;
  v_customer text;
  v_stripe   text;
begin
  -- Verrou : deux webhooks concurrents sur le même foyer se sérialisent ici.
  select * into v_arr
    from subscription_payment_arrangements
   where household_id = p_household
   order by created_at desc limit 1
     for update;

  if v_arr.id is null then return 'aucun'; end if;

  select count(*), count(distinct user_id),
         count(*) filter (where status = 'paid'),
         count(*) filter (where status in ('failed', 'refused', 'expired')),
         count(*) filter (where status = 'past_due'),
         coalesce(sum(amount_cents), 0)
    into v_vives, v_parents, v_payees, v_perdues, v_retard, v_somme
    from subscription_contributions
   where arrangement_id = v_arr.id and status <> 'canceled';

  -- Cohérence du groupe. Le nombre attendu vient de l'arrangement, jamais du
  -- nombre de lignes trouvées.
  if v_vives > v_arr.expected_contributions
     or v_parents <> v_vives
     or (v_vives = v_arr.expected_contributions
         and v_somme <> v_arr.total_amount_cents) then
    update subscription_payment_arrangements
       set status = 'failed' where id = v_arr.id;
    return 'invalide';
  end if;

  -- Arrangement périmé : aucun débit, aucune activation.
  if v_arr.expires_at is not null and v_arr.expires_at <= now()
     and v_payees < v_arr.expected_contributions then
    update subscription_payment_arrangements
       set status = 'expired' where id = v_arr.id;
    update subscription_contributions
       set status = 'expired'
     where arrangement_id = v_arr.id
       and status not in ('paid', 'canceled', 'refused');
    return 'expire';
  end if;

  -- Toutes les parts attendues sont présentes ET confirmées payées. L'accord
  -- du second parent ne suffit jamais : seul 'paid' compte.
  if v_vives = v_arr.expected_contributions
     and v_payees = v_arr.expected_contributions then

    -- En mode 'half' il existe deux abonnements Stripe : aucun ne peut
    -- représenter le foyer à lui seul, la colonne reste donc vide.
    if v_arr.mode = 'full' then
      select stripe_customer_id, stripe_subscription_id
        into v_customer, v_stripe
        from subscription_contributions
       where arrangement_id = v_arr.id limit 1;
    end if;

    -- Création ou mise à jour atomique, par la fonction qui fait déjà
    -- autorité sur subscriptions : upsert sur la contrainte household_id,
    -- donc pas de course entre deux webhooks.
    perform public.upsert_subscription(
      p_household, v_arr.plan_id, 'active', v_customer, v_stripe,
      null, p_period_end, false, null
    );
    update subscriptions
       set arrangement_id = v_arr.id, grace_until = null
     where household_id = p_household;
    update subscription_payment_arrangements
       set status = 'active' where id = v_arr.id;

    -- Vérification avant annonce : pas de 'actif' sans droit inscrit.
    select * into v_abo from subscriptions where household_id = p_household;
    if v_abo.id is null or v_abo.status <> 'active' then
      raise exception 'Droit non inscrit pour le foyer % malgré % parts réglées',
        p_household, v_payees;
    end if;
    return 'actif';
  end if;

  -- Une part en difficulté. On ne dégrade QUE si le droit en cours vient de
  -- cet arrangement : un abonnement intégral antérieur reste intact.
  --
  -- Le droit ne tombe jamais du seul fait qu'une moitié a échoué. Il passe
  -- en past_due, une échéance de grâce est posée, et l'accès n'est clos
  -- qu'une fois cette échéance dépassée — c'est le sens de la période de
  -- grâce : laisser au parent le temps de corriger son moyen de paiement.
  if v_perdues > 0 or v_retard > 0 then
    update subscription_payment_arrangements
       set status = case when v_perdues > 0 then 'failed' else status end
     where id = v_arr.id;

    update subscriptions
       set status = 'past_due',
           grace_until = coalesce(grace_until,
                                  now() + make_interval(days => p_grace_days))
     where household_id = p_household
       and arrangement_id = v_arr.id
       and status in ('active', 'trialing');

    -- Grâce épuisée : le droit s'éteint, et seulement maintenant.
    update subscriptions
       set status = 'canceled'
     where household_id = p_household
       and arrangement_id = v_arr.id
       and grace_until is not null
       and grace_until <= now();

    if v_payees > 0 and v_perdues > 0 then return 'remboursement_du'; end if;
    if v_perdues > 0 then return 'interrompu'; end if;
    return 'grace';
  end if;

  if v_payees > 0 then return 'moitie_payee'; end if;
  return 'en_attente';
end $$;

revoke all on function public.recalculer_partage(uuid, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.recalculer_partage(uuid, timestamptz, int)
  to service_role;

-- ---------- 10. Point d'entrée du webhook pour une moitié ----------
-- Un événement Stripe concernant une moitié ne dit RIEN de l'état du foyer.
-- Il ne doit donc jamais atteindre upsert_subscription : il met à jour la
-- part correspondante, puis laisse recalculer_partage() décider, à partir
-- des deux parts réunies, ce qu'il advient du droit d'accès.
--
-- Cette fonction est le seul chemin autorisé pour un abonnement issu d'un
-- partage. upsert_subscription reste le chemin du paiement intégral, dont
-- le comportement est inchangé.
--
-- Idempotente : deux passages avec le même statut laissent la base dans le
-- même état, et l'ordre d'arrivée des événements n'a pas d'importance —
-- l'agrégation relit toujours l'ensemble des parts.
create or replace function public.maj_contribution_stripe(
  p_stripe_subscription text,
  p_status              text,
  p_period_end          timestamptz default null,
  p_grace_days          int default 7
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_contrib   record;
  v_household uuid;
begin
  if p_stripe_subscription is null then
    raise exception 'Aucun abonnement Stripe transmis.';
  end if;

  select * into v_contrib from subscription_contributions
   where stripe_subscription_id = p_stripe_subscription;

  -- Abonnement inconnu de la table : c'est un paiement intégral ou un
  -- abonnement hors partage. On le signale sans rien écrire, l'appelant
  -- retombera sur upsert_subscription.
  if v_contrib.id is null then return 'hors_partage'; end if;

  v_household := v_contrib.household_id;

  -- Une part déjà close ne se rouvre pas sur un événement tardif.
  if v_contrib.status in ('refused', 'expired', 'canceled') then
    return 'ignore';
  end if;

  update subscription_contributions
     set status = p_status
   where id = v_contrib.id and status <> p_status;

  return public.recalculer_partage(v_household, p_period_end, p_grace_days);
end $$;

revoke all on function public.maj_contribution_stripe(text, text, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.maj_contribution_stripe(text, text, timestamptz, int)
  to service_role;

commit;
