-- Vérification de 00046_paiement_partage.sql
--
-- CE FICHIER N'EST PAS UNE MIGRATION. Il ne doit jamais être appliqué en
-- production. Il se termine par un ROLLBACK : aucune de ses écritures ne
-- survit à son exécution.
--
-- Où l'exécuter
-- -------------
-- Sur une base jetable portant le schéma complet — branche Supabase de
-- développement, ou instance locale. Jamais sur la base de production, même
-- avec le rollback : un déclencheur mal écrit pourrait verrouiller des lignes
-- réelles le temps de la transaction.
--
-- Comment le lire
-- ---------------
-- Chaque scénario est un bloc do $$ ... $$ qui lève une exception s'il échoue.
-- Une exécution silencieuse jusqu'au dernier « TOUS LES SCENARIOS PASSENT »
-- signifie que tout est vert. La première exception arrête tout.
--
-- Prérequis : les fonctions is_member() et upsert_subscription() existent, et
-- la table plans contient 'premium'.

begin;

-- ---------- Jeu d'essai ----------
-- Deux foyers, trois parents. Le troisième appartient à un autre foyer : il
-- sert à vérifier qu'on ne peut ni contribuer, ni lire chez les voisins.
do $$
declare
  v_foyer_a uuid; v_foyer_b uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
begin
  insert into households (name) values ('Essai A') returning id into v_foyer_a;
  insert into households (name) values ('Essai B') returning id into v_foyer_b;

  insert into profiles (id, email, display_name)
  values (gen_random_uuid(), 'p1@essai.test', 'Parent 1') returning id into v_p1;
  insert into profiles (id, email, display_name)
  values (gen_random_uuid(), 'p2@essai.test', 'Parent 2') returning id into v_p2;
  insert into profiles (id, email, display_name)
  values (gen_random_uuid(), 'p3@essai.test', 'Parent 3') returning id into v_p3;

  insert into household_members (household_id, profile_id, role)
  values (v_foyer_a, v_p1, 'owner'), (v_foyer_a, v_p2, 'parent'),
         (v_foyer_b, v_p3, 'owner');

  create temporary table jeu_essai (cle text primary key, val uuid);
  insert into jeu_essai values
    ('foyer_a', v_foyer_a), ('foyer_b', v_foyer_b),
    ('p1', v_p1), ('p2', v_p2), ('p3', v_p3);
end $$;

create or replace function pg_temp.j(p text) returns uuid
language sql stable as $$ select val from jeu_essai where cle = p $$;

-- ---------- 1. Une seule moitié payée : jamais actif ----------
do $$
declare v_arr uuid; v_etat text;
begin
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'half', 'premium', 'year', 1499);
  perform public.enregistrer_contribution(v_arr, pg_temp.j('p1'), 'paid', 750);
  perform public.enregistrer_contribution(v_arr, pg_temp.j('p2'), 'awaiting_second_setup', 749);
  v_etat := public.recalculer_partage(pg_temp.j('foyer_a'));

  if v_etat = 'actif' then
    raise exception 'ECHEC 1 : une seule moitié payée a activé le foyer';
  end if;
  if exists (select 1 from subscriptions
              where household_id = pg_temp.j('foyer_a') and status = 'active') then
    raise exception 'ECHEC 1 : un droit a été inscrit sans les deux parts';
  end if;
  raise notice 'OK 1 — une moitié payée : état %, aucun droit ouvert', v_etat;
end $$;

-- ---------- 2. Deux moitiés payées : actif ----------
do $$
declare v_arr uuid; v_etat text;
begin
  select id into v_arr from subscription_payment_arrangements
   where household_id = pg_temp.j('foyer_a') order by created_at desc limit 1;

  update subscription_contributions set status = 'paid'
   where arrangement_id = v_arr and user_id = pg_temp.j('p2');

  v_etat := public.recalculer_partage(pg_temp.j('foyer_a'), now() + interval '1 year');

  if v_etat <> 'actif' then
    raise exception 'ECHEC 2 : deux moitiés payées donnent %', v_etat;
  end if;
  if not exists (select 1 from subscriptions
                  where household_id = pg_temp.j('foyer_a')
                    and status = 'active' and arrangement_id = v_arr) then
    raise exception 'ECHEC 2 : aucun droit inscrit malgré deux parts réglées';
  end if;
  raise notice 'OK 2 — deux moitiés payées : foyer actif, droit rattaché';
end $$;

-- ---------- 3. Trois contributions : refusées ----------
do $$
declare v_arr uuid; v_erreur boolean := false;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_a');
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'half', 'premium', 'year', 1499);

  begin
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p1'), 'paid', 500);
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p2'), 'paid', 500);
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p3'), 'paid', 499);
  exception when others then v_erreur := true;
  end;

  if not v_erreur then
    raise exception 'ECHEC 3 : une troisième contribution a été acceptée';
  end if;
  raise notice 'OK 3 — troisième contribution refusée';
end $$;

-- ---------- 4. Deux contributions du même parent : refusées ----------
-- La contrainte unique (arrangement_id, user_id) transforme la seconde en
-- mise à jour : le résultat attendu est UNE ligne, jamais deux.
do $$
declare v_arr uuid; v_n int;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_a');
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'half', 'premium', 'year', 1499);

  perform public.enregistrer_contribution(v_arr, pg_temp.j('p1'), 'paid', 750);
  perform public.enregistrer_contribution(v_arr, pg_temp.j('p1'), 'paid', 750);

  select count(*) into v_n from subscription_contributions
   where arrangement_id = v_arr and user_id = pg_temp.j('p1');
  if v_n <> 1 then
    raise exception 'ECHEC 4 : % lignes pour un même parent', v_n;
  end if;
  raise notice 'OK 4 — un parent, une seule contribution';
end $$;

-- ---------- 5. Appels concurrents : aucune duplication ----------
-- Deux appels successifs dans la même transaction simulent le rejeu ; le test
-- réellement concurrent demande deux sessions et figure dans la checklist.
do $$
declare v_arr uuid; v_n int;
begin
  select id into v_arr from subscription_payment_arrangements
   where household_id = pg_temp.j('foyer_a') order by created_at desc limit 1;

  perform public.enregistrer_contribution(v_arr, pg_temp.j('p2'), 'paid', 749);
  perform public.enregistrer_contribution(v_arr, pg_temp.j('p2'), 'paid', 749);

  select count(*) into v_n from subscription_contributions where arrangement_id = v_arr;
  if v_n <> 2 then
    raise exception 'ECHEC 5 : % contributions au lieu de 2', v_n;
  end if;
  raise notice 'OK 5 — le rejeu met à jour, il ne duplique pas';
end $$;

-- ---------- 6. Montant total incorrect : refusé ----------
do $$
declare v_arr uuid; v_erreur boolean := false;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_a');
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'half', 'premium', 'year', 1499);

  begin
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p1'), 'paid', 750);
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p2'), 'paid', 800);
  exception when others then v_erreur := true;
  end;

  if not v_erreur then
    raise exception 'ECHEC 6 : une somme de 1550 a été acceptée pour un total de 1499';
  end if;
  raise notice 'OK 6 — somme des parts incohérente refusée';
end $$;

-- ---------- 7. Arrangement expiré : aucun débit ni activation ----------
do $$
declare v_arr uuid; v_etat text;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_b');
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_b'), 'full', 'premium', 'year',
                                     1499, now() - interval '1 day');
  perform public.enregistrer_contribution(v_arr, pg_temp.j('p3'), 'ready_to_charge', 1499);

  v_etat := public.recalculer_partage(pg_temp.j('foyer_b'));
  if v_etat <> 'expire' then
    raise exception 'ECHEC 7 : arrangement périmé donne %', v_etat;
  end if;
  if exists (select 1 from subscriptions
              where household_id = pg_temp.j('foyer_b') and status = 'active') then
    raise exception 'ECHEC 7 : un droit a été ouvert sur un arrangement périmé';
  end if;
  raise notice 'OK 7 — arrangement périmé : ni débit ni activation';
end $$;

-- ---------- 8. Parent étranger au foyer : contribution refusée ----------
do $$
declare v_arr uuid; v_erreur boolean := false;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_a');
  v_arr := public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'full', 'premium', 'year', 1499);
  begin
    perform public.enregistrer_contribution(v_arr, pg_temp.j('p3'), 'paid', 1499);
  exception when others then v_erreur := true;
  end;
  if not v_erreur then
    raise exception 'ECHEC 8 : un parent étranger au foyer a pu contribuer';
  end if;
  raise notice 'OK 8 — parent étranger au foyer refusé';
end $$;

-- ---------- 9. Les tables ne sont pas lisibles par authenticated ----------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from information_schema.role_table_grants
   where table_name in ('subscription_contributions',
                        'subscription_payment_arrangements')
     and grantee in ('authenticated', 'anon', 'PUBLIC');
  if v_n > 0 then
    raise exception 'ECHEC 9 : % droits directs accordés hors service_role', v_n;
  end if;
  raise notice 'OK 9 — aucun accès direct aux tables hors service_role';
end $$;

-- ---------- 10. service_role dispose bien de ses droits ----------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from information_schema.role_table_grants
   where table_name = 'subscription_contributions'
     and grantee = 'service_role'
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE');
  if v_n < 3 then
    raise exception 'ECHEC 10 : service_role n''a que % droits sur 3', v_n;
  end if;
  raise notice 'OK 10 — service_role peut écrire, le webhook ne cassera pas';
end $$;

-- ---------- 11. lire_partage ne révèle aucun identifiant Stripe ----------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from information_schema.parameters
   where specific_name like 'lire_partage%'
     and parameter_name ilike '%stripe%';
  if v_n > 0 then
    raise exception 'ECHEC 11 : lire_partage expose % colonnes Stripe', v_n;
  end if;
  raise notice 'OK 11 — la lecture au foyer ne contient aucun repère Stripe';
end $$;

-- ---------- 12. Un second arrangement vivant est refusé ----------
do $$
declare v_erreur boolean := false;
begin
  update subscription_payment_arrangements set status = 'canceled'
   where household_id = pg_temp.j('foyer_a');
  perform public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'full', 'premium', 'year', 1499);
  begin
    perform public.ouvrir_arrangement(pg_temp.j('foyer_a'), 'half', 'premium', 'year', 1499);
  exception when others then v_erreur := true;
  end;
  if not v_erreur then
    raise exception 'ECHEC 12 : deux arrangements vivants coexistent';
  end if;
  raise notice 'OK 12 — un arrangement en cours ne peut pas être doublé';
end $$;

do $$ begin raise notice '=== TOUS LES SCENARIOS PASSENT ==='; end $$;

rollback;
