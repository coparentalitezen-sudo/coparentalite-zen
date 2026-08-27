# 13 — Ce que nous ferions différemment

Étape 7 de la mission.

**Règle appliquée : aucun problème inventé.** Chaque entrée est vérifiable
dans le dépôt — un commentaire de code, une migration corrective, un
contournement dans le banc de test, une note dans `AGENTS.md`. La référence
est donnée à chaque fois.

Format constant : **Problème · Cause · Correction · Bonne pratique ·
Mécanisme à intégrer au starter.**

---

# 1. Git, GitHub et branches

## 1.1 La CI ne vérifie pas la branche qui déploie

**Problème.** `.github/workflows/ci.yml` se déclenche sur `main`
(`on: push/pull_request: branches: [main]`). Or Vercel déploie depuis
`develop`. La branche livrée n'est pas celle qui est vérifiée.
**Référence :** `.github/workflows/ci.yml`, ligne 4-8 ; `AGENTS.md`, « Vercel
déploie depuis `develop`, pas `main` ».

**Cause.** La configuration par défaut de la CI a été conservée alors que la
stratégie de branches a changé ensuite.

**Correction.** Déclencher sur les deux branches.

**Bonne pratique.** La branche de production se déclare **à un seul endroit**
et tout le reste s'y aligne.

**Mécanisme starter.** `on: push: branches: [main, develop]` livré par défaut,
et une ligne dans `scripts/verifier-config.ts` : la branche de production
Vercel déclarée en configuration doit figurer dans les déclencheurs de la CI.

## 1.2 Vercel ignore silencieusement certains commits

**Problème.** Un déploiement qui ne se déclenche jamais, sans message. Une
heure perdue à croire l'application figée.
**Référence :** `AGENTS.md`, « Pièges vérifiés à nos dépens ».

**Cause.** Vercel ignore les commits dont l'auteur Git est inconnu du compte
GitHub.

**Correction.** `git config user.email
"<id>+<utilisateur>@users.noreply.github.com"`.

**Bonne pratique.** Ne jamais annoncer un déploiement sans l'avoir constaté.
Le hash affiché dans l'application est la seule preuve.

**Mécanisme starter.** Un script `scripts/preparer-session.sh` qui configure
l'auteur Git, et un hash de version affiché dans l'en-tête applicatif dès le
premier jour.

## 1.3 Une branche locale en retard produit un diagnostic faux

**Problème.** Le 2026-08-23, un audit complet a tourné sur `develop` avec 68
commits de retard : la moitié des tests rapportés (286 au lieu de 536) et un
correctif déjà appliqué en amont ressorti comme un problème critique. **Rien
ne le signale** — le code se construit, les tests passent, sur une version
ancienne.
**Référence :** `AGENTS.md`, protocole agent ; `CLAUDE.md`.

**Cause.** Aucune synchronisation obligatoire en début de session.

**Correction.** `git fetch origin && git reset --hard origin/<branche>` en
première commande, sans exception. Puis `npm ci` — `package.json` a pu changer.

**Bonne pratique.** Aucun commit ne reste local en fin de session. Un seul
intervenant écrit sur la branche de production à la fois.

**Mécanisme starter.** Protocole en tête de `AGENTS.md`, script
`preparer-session.sh` qui enchaîne fetch/reset/`npm ci` et affiche l'écart de
commits, et une ligne d'avertissement si des commits locaux ne sont pas
poussés.

## 1.4 Un conflit de fusion commité

**Problème.** Des marqueurs `<<<<<<< HEAD` sont restés commités plusieurs
jours dans `AGENTS.md`.
**Référence :** `AGENTS.md`, protocole point 3.

**Cause.** Deux intervenants avançant en parallèle sur la même branche.

**Correction.** Un seul intervenant à la fois sur la branche de production.

**Mécanisme starter.** Vérification en CI : aucun fichier ne contient
`<<<<<<<`, `=======` en début de ligne ou `>>>>>>>`. Trois secondes, une
catégorie entière de problèmes éliminée.

---

# 2. Vercel

## 2.1 Une tâche planifiée trop fréquente casse la construction, en silence

**Problème.** Un horaire `*/15 * * * *` a bloqué les déploiements plusieurs
heures. La construction échoue **sans qu'aucun déploiement n'apparaisse dans
la liste**.
**Référence :** `AGENTS.md`, « Tâches planifiées ».

**Cause.** L'offre Hobby n'autorise qu'une exécution par jour et par tâche.

**Correction.** Un créneau quotidien maximum, et enchaînement des traitements
dans une même exécution.

**Bonne pratique.** Concevoir les traitements planifiés pour être groupables
dès le départ.

**Mécanisme starter.** `verifier-config.ts` refuse tout `schedule` plus
fréquent que quotidien tant qu'un drapeau `vercelPro` n'est pas levé.
Commentaire explicatif dans `vercel.json`.

## 2.2 `vercel.json` rejette tout champ supplémentaire

**Problème.** Un champ ajouté dans une entrée de cron fait rejeter le fichier.
**Référence :** `AGENTS.md`, même section.

**Correction.** `path` et `schedule` uniquement.

**Mécanisme starter.** `$schema` déclaré dans le fichier (validation par
l'éditeur) et contrôle en CI.

## 2.3 Une PWA installée reste sur son ancien domaine

**Problème.** Les installations faites depuis une adresse `.vercel.app`
continuent d'y pointer indéfiniment et produisent des liens d'invitation vers
un domaine abandonné.
**Référence :** `src/middleware.ts`, commentaire `HOTES_OBSOLETES`.

**Cause.** L'icône de l'écran d'accueil fige l'hôte d'origine.

**Correction.** Redirection dans le middleware, vers des hôtes **nommément
désignés** — jamais par motif générique `*.vercel.app`, qui détournerait les
déploiements de prévisualisation. En **307**, pas 308 : une permanente est
mise en cache par le navigateur et devient pénible à corriger.

**Bonne pratique.** Brancher le domaine définitif **avant** la première
installation par un utilisateur.

**Mécanisme starter.** Mécanisme `HOTES_OBSOLETES` livré ; checklist :
« domaine définitif branché avant toute installation ».

## 2.4 Une migration ne change pas le hash de version

**Problème.** Confusion récurrente en cherchant pourquoi « rien n'a changé »
après une modification de base.
**Référence :** `AGENTS.md`, « Pièges vérifiés à nos dépens ».

**Correction.** Distinguer explicitement les deux artefacts : version de code
(hash) et version de schéma.

**Mécanisme starter.** L'écran de diagnostic affiche **les deux** : hash du
build et dernière migration appliquée.

---

# 3. Supabase et PostgreSQL

## 3.1 `pgcrypto` dans `public` — un banc de test qui ment

**Problème.** L'invitation est tombée en panne en production alors que le banc
de test passait au vert.
**Référence :** `scripts/test-sql.sh`, commentaire de création du gabarit.

**Cause.** Supabase installe ses extensions dans le schéma `extensions`,
jamais dans `public`. Un `create extension if not exists pgcrypto` dans
`public` est donc **sans effet**, et `gen_random_bytes` reste introuvable pour
toute fonction dont le `search_path` se limite à `public`. Le banc, lui,
l'installait dans `public` où tout se résolvait tout seul.

**Correction.** Le banc reproduit l'implantation réelle : schéma `extensions`,
extension dedans, `grant usage`. Les fonctions concernées déclarent
`set search_path = public, extensions`.

**Bonne pratique — la plus importante de ce document.** Un banc de test **plus
permissif que la production** ne teste rien. Il produit pire que l'absence de
test : une fausse assurance.

**Mécanisme starter.** Banc de test livré avec la reproduction fidèle
(extensions, rôles, schéma `auth`) et un commentaire expliquant pourquoi
chaque contournement existe — pour qu'aucun successeur ne les « simplifie ».

## 3.2 La RLS ne remplace pas les GRANT de table

**Problème.** `permission denied for table …` en production sur les lectures
directes, alors que tout fonctionnait via les fonctions.
**Référence :** migration corrective `00007_grants.sql`, en-tête.

**Cause.** Les fonctions `SECURITY DEFINER` s'exécutent avec les droits du
propriétaire et **masquaient l'omission**. Seules les lectures directes
échouaient.

**Correction.** `grant select, insert, update, delete on all tables … to
authenticated` + `alter default privileges` pour les tables futures.

**Bonne pratique.** Deux couches distinctes : les GRANT ouvrent la porte, les
policies décident qui passe. Et le banc de test ne doit **jamais** accorder au
rôle applicatif un privilège qu'il n'aurait pas en production.

**Mécanisme starter.** Migration de grants dans le socle dès `00007`, avec
`alter default privileges`. Test SQL : pour chaque table, une lecture directe
par le rôle applicatif.

## 3.3 `revoke from public` prive aussi `service_role`

**Problème.** Un traitement sans utilisateur échoue sur `permission denied for
function` **sans rien écrire** : import silencieusement impossible, ou
paiement encaissé sans contrepartie.
**Référence :** `AGENTS.md` ; migration `00020_droits_service_role.sql` ;
banc de test, création du rôle `service_role`.

**Cause.** Révoquer « pour tous » retire aussi le droit implicite de
`service_role`.

**Correction.** `grant execute … to service_role` explicite sur toute fonction
appelée sans utilisateur.

**Mécanisme starter.** Le banc reproduit le rôle `service_role` (avec
`grant … with inherit false` pour pouvoir basculer sans hériter), et une
assertion vérifie que chaque fonction destinée au service est exécutable par
lui — et **inexécutable** par `anon`.

## 3.4 `drop function` emporte les grants

**Problème.** L'acheminement Push échoue à l'exécution suivante, sans le
moindre message.
**Référence :** `AGENTS.md` ; migrations `00047_pastille_non_lues.sql` et
`00048_push_foyers_supprimes.sql`, qui reposent le grant à chaque fois.

**Cause.** PostgreSQL refuse `create or replace` quand la signature de retour
change (ajouter une colonne à un `returns table`). Il faut supprimer puis
recréer — et la suppression retire **tous** les grants.

**Correction.** Reposer systématiquement les `grant execute` en fin de
migration.

**Mécanisme starter.** Gabarit de migration comportant le bloc `grant` en
fin de fichier, et une assertion SQL générique : toute fonction destinée à
`service_role` doit lui être exécutable après application de **toutes** les
migrations.

## 3.5 `NULL in (...)` vaut `NULL`, pas `FALSE`

**Problème.** Pour un non-membre, `member_role_in()` renvoie `NULL` ; sans
`coalesce`, `NULL in ('owner','parent')` vaut `NULL` — ce qui neutralise
`if not can_write(...)`.
**Référence :** `00002_rls.sql`, commentaire de `can_write`.

**Correction.** `coalesce(..., false)` sur tout prédicat d'autorisation.

**Bonne pratique.** Un prédicat de sécurité doit être **total** : jamais de
troisième valeur.

**Mécanisme starter.** Helpers livrés avec le `coalesce`, et un test qui
vérifie explicitement le cas du non-membre sur chaque helper.

## 3.6 Une clé étrangère invalide fait disparaître du contenu sans erreur

**Problème.** Un écran d'administration affiche « un élément de moins », rien
n'indique pourquoi.
**Référence :** `AGENTS.md` ; `src/lib/marketing/depot.ts`.

**Cause.** Un `upsert(...).select('id').single()` dont on ne lit que `data` :
si la clé étrangère est invalide, l'upsert échoue, `data` vaut `null`, la
fonction journalise côté serveur et passe au suivant.

**Correction.** Lire `error` **avant** `data`, systématiquement, et remonter
l'échec dans un `ActionResult`.

**Bonne pratique.** Aucun faux succès silencieux. La règle existait déjà dans
`actions/core.ts` — elle n'avait simplement pas été appliquée partout.

**Mécanisme starter.** Un enrobage `executer()` autour des appels Supabase qui
**refuse de compiler** si `error` n'est pas traité, et une vérification de CI
interdisant `.select(...).single()` sans lecture de `error`.

## 3.7 Un test écrit et jamais exécuté

**Problème.** `supabase/tests/00046_verification.sql` contient 12 scénarios de
vérification du paiement partagé, **jamais exécutés**.
**Référence :** fichier présent ; `scripts/test-sql.sh` n'exécute que les
fichiers `*_test.sql`.

**Cause.** Une convention de nommage qui exclut le fichier du banc, sans que
rien ne le signale.

**Correction.** Renommer, ou faire échouer la CI sur les suites orphelines.

**Mécanisme starter.** Contrôle en CI : tout fichier de `supabase/tests/` non
exécuté par le banc fait échouer la chaîne.

## 3.8 Une fonction d'agrégat inexistante

**Problème.** Migration corrective `00024_fix_propositions_vacances.sql` —
`min(uuid)` n'existe pas en PostgreSQL.
**Référence :** `AGENTS.md`, tableau des migrations.

**Correction.** Réécriture de la requête.

**Bonne pratique.** Toute migration doit être appliquée sur une base vierge
locale avant d'être poussée. Le banc l'aurait attrapée.

**Mécanisme starter.** `npm run test:sql` obligatoire avant tout push touchant
`supabase/` — inscrit dans la CI et dans `CONTRIBUER.md`.

---

# 4. Variables d'environnement et configuration

## 4.1 Deux clés visuellement identiques

**Problème.** Les clés `anon` et `service_role` sont deux JWT commençant tous
deux par `eyJhbGci`. Les confondre donne une configuration en apparence
correcte et des appels refusés, sans rien qui l'indique.
**Référence :** `src/app/api/diagnostic/route.ts`, fonction `roleDeLaCle`.

**Correction.** Lire le rôle déclaré dans la charge utile du jeton (ou le
préfixe `sb_secret_` / `sb_publishable_`) sans jamais afficher la clé.

**Mécanisme starter.** `roleDeLaCle()` livré dans le diagnostic du socle.

## 4.2 Une consigne de rédaction publiée comme adresse de contact

**Problème.** La consigne « ton adresse e-mail de contact » s'est retrouvée
dans une variable d'environnement, prête à s'afficher sur des mentions légales
publiques.
**Référence :** `src/lib/legal.ts`, fonction `estUneAdresse`.

**Correction.** Valider le format : une adresse doit ressembler à une adresse,
sinon afficher « À compléter ».

**Bonne pratique.** Une valeur d'attente visible vaut mieux qu'une phrase qui
trahit l'inachèvement.

**Mécanisme starter.** Validation de format sur toute valeur juridique
affichée (e-mail, SIREN à neuf chiffres, longueur minimale d'adresse), et
`verifier-config.ts` qui refuse toute valeur d'attente en production.

## 4.3 Un module serveur importable côté client

**Problème.** Les variables sans préfixe `NEXT_PUBLIC_` sont vides dans le
navigateur : importé depuis un composant client, le module d'identité légale
aurait affiché « À compléter » sur des pages publiques.
**Référence :** `src/lib/legal.ts`, avertissement en en-tête.

**Cause.** La protection est un **commentaire**, pas un mécanisme.

**Correction.** `import 'server-only'` en tête de tout module lisant un secret
— l'importation devient une erreur de compilation.

**Mécanisme starter.** `src/config/env.ts` séparé en deux modules, celui du
serveur portant `server-only`. Aucun `process.env` ailleurs dans le socle,
vérifié en CI.

## 4.4 Le renommage de variables de production

**Problème.** `src/lib/legal.ts` accepte jusqu'à **quatre noms différents**
pour la même valeur, parce que renommer une variable en production est risqué
quand on ne peut pas refaire l'opération à l'identique.
**Référence :** `src/lib/legal.ts`, fonction `premiere`.

**Cause.** Les noms de variables ont été fixés au fil de l'eau, sans
convention.

**Correction retenue.** Le code s'adapte, puisque lui se relit.

**Bonne pratique.** Fixer la convention de nommage **avant** le premier
déploiement.

**Mécanisme starter.** `.env.example` exhaustif et figé dès le départ, une
seule orthographe par valeur, `verifier-config.ts` refusant toute variable
inconnue.

## 4.5 Un JSON sans jeu de caractères déclaré

**Problème.** « clés » s'affiche « clÃ©s » dans les réponses de diagnostic.
**Référence :** `src/app/api/diagnostic/route.ts`, fonction `reponseJSON`.

**Correction.** `Content-Type: application/json; charset=utf-8`.

**Mécanisme starter.** Utilitaire de réponse JSON du socle, jamais
`NextResponse.json` brut pour du contenu accentué.

---

# 5. Stripe et modèle économique

## 5.1 Trois prix différents dans le projet

**Problème.** Trois montants divergents ont coexisté — page commerciale, écran
d'offre, session Stripe.
**Référence :** `AGENTS.md`, section « Prix » ; `src/lib/tarifs.ts`.

**Cause.** Chaque écran portait sa propre valeur.

**Correction.** Table `plans` comme source unique, exposée par
`grille_tarifaire()`. **Aucun montant n'est écrit dans le code.** Les
`price_id` Stripe y vivent aussi, à côté des montants qu'ils représentent.

**Bonne pratique.** Annoncer un tarif et en facturer un autre se règle devant
un médiateur de la consommation. Le risque justifie la contrainte.

**Mécanisme starter.** Table `plans` dans le socle, et `verifier-config.ts`
qui refuse tout littéral monétaire dans `src/`.

## 5.2 Une période de grâce inerte

**Problème.** `subscriptions.grace_until` est renseignée par le code mais
**n'est pas lue** par la fonction de droits. La colonne est sans effet.
**Référence :** `00046_paiement_partage.sql`, en-tête, « Deux points laissés
ouverts » : *« en l'état la colonne est inerte »*.

**Cause.** Le branchement changeait la règle d'accès en vigueur et demandait
une validation métier séparée — décision assumée et documentée, mais restée
ouverte.

**Correction.** Livrer la fonction de droits avec ses **trois** états dès le
départ : actif, grâce, expiré.

**Bonne pratique.** Une colonne écrite mais non lue est une dette qui se
présente au pire moment — le jour d'un échec de prélèvement.

**Mécanisme starter.** `workspace_entitlement()` à trois états dans le socle,
avec un test SQL couvrant la grâce.

## 5.3 Une fonctionnalité de paiement livrée mais dormante

**Problème.** Le paiement 50/50 est implémenté, testé en unitaire, et
volontairement **maintenu inactif** : `PAYMENT_SPLIT_ENABLED` est absent de la
production et le flux réel n'a jamais été validé de bout en bout.
**Référence :** `.env.example`, commentaire du drapeau ;
`00046_paiement_partage.sql`.

**Ce n'est pas une erreur — c'est la bonne décision**, et elle mérite d'être
codifiée : *un bouton actif qui ne peut pas aboutir est pire qu'un bouton
absent.*

**Mécanisme starter.** Un drapeau par fonctionnalité de paiement, levé
seulement après un test réel de bout en bout ; deux variables séparées (route
et affichage) qui doivent être levées ensemble.

## 5.4 Les frais fixes rendent le petit montant non viable

**Problème.** Les frais fixes par transaction Stripe rendent un partage de
coût entre deux personnes viable **uniquement en facturation annuelle**.
**Référence :** conception documentée du paiement partagé.

**Bonne pratique.** Calculer la marge nette **avant** de promettre une
modalité de paiement.

**Mécanisme starter.** Section « viabilité des frais » dans `08-STRIPE.md`, et
un rappel dans l'étape 0.

---

# 6. PWA, iOS et notifications

## 6.1 Des icônes rognées

**Problème.** Les icônes générées avec une marge insuffisante sont rognées par
les masques d'iOS et d'Android.
**Référence :** `AGENTS.md`, section « Icônes » ; `scripts/generer-icones.py`.

**Cause.** Le symbole source touche les bords de son fichier.

**Correction.** Recadrage sur le contenu réel puis marges conformes : **80 %**
de la largeur pour les icônes standard, **54 %** pour les maskable — un carré
inscrit dans le cercle de sécurité d'Android ne mesure que 0,8/√2 ≈ 56 % du
côté. Le script vérifie qu'aucun logo ne touche un bord.

**Mécanisme starter.** Script livré avec sa vérification, et un test E2E qui
contrôle qu'aucune icône déclarée dans le manifeste ne renvoie 404.

## 6.2 `clients.claim()` interrompt les navigations

**Problème.** Prendre le contrôle d'un onglet déjà ouvert interrompt la
navigation en cours.
**Référence :** `src/app/sw.js/route.ts`, commentaire d'activation.

**Correction.** Retiré volontairement. Le worker pilote la page au chargement
suivant.

## 6.3 Un service worker casse les redirections du middleware

**Problème.** La garde d'authentification tombe en erreur.
**Référence :** `AGENTS.md`, « Pièges vérifiés à nos dépens ».

**Cause.** Le worker ne relaie pas la réponse en mode `manual`.

**Mécanisme starter.** Worker livré avec le bon traitement des redirections,
et un test E2E vérifiant qu'une redirection survit à l'activation du worker.

## 6.4 `Notification?.permission` plante

**Problème.** L'optional chaining ne protège pas d'un identifiant global
inexistant : l'accès lève une `ReferenceError`.
**Référence :** `src/components/cloche.tsx` — `if (typeof Notification ===
'undefined') return;`.

**Correction.** Toujours `typeof X !== 'undefined'` pour un global de
navigateur.

**Mécanisme starter.** Enrobages du socle pour Notification, setAppBadge,
serviceWorker et clipboard, avec la garde intégrée.

## 6.5 `mailto:` et le partage natif échouent silencieusement

**Problème.** Depuis une PWA installée, un lien `mailto:` ou un partage natif
peut ne rien faire du tout, sans erreur.
**Référence :** `src/app/app/foyer/page.tsx`, commentaire du bouton de repli.

**Correction.** Recours par API Presse-papiers, qui ne dépend d'aucune
application tierce, avec message de confirmation — et un repli explicite si la
copie échoue.

**Mécanisme starter.** Composant « partager un texte » du socle : partage
natif si disponible, presse-papiers sinon, sélection manuelle en dernier
recours. Jamais `mailto:` seul.

## 6.6 Sans index unique, un rappel par nuit

**Problème.** Une tâche planifiée repasse chaque nuit sur les mêmes
événements.
**Référence :** `AGENTS.md`, section « Rappels ».

**Correction.** Index unique `(destinataire, type, entité)`. Un événement
déplacé met à jour l'heure et réactive le rappel ; un événement supprimé voit
son rappel purgé.

**Bonne pratique.** **L'idempotence est la propriété critique** de tout
traitement rejoué.

**Mécanisme starter.** Index livré dans la migration de notifications, avec un
test qui exécute la tâche deux fois et vérifie qu'une seule notification
existe.

## 6.7 `auth.uid()` ne reflète pas la session dans un déclencheur

**Problème.** Appelé depuis une fonction `SECURITY DEFINER`, `auth.uid()` ne
renvoie pas toujours l'utilisateur courant — l'auteur d'une action est alors
faux, et la règle « ne pas se notifier soi-même » tombe.
**Référence :** `AGENTS.md`, section « Émission des notifications ».

**Correction.** Lire l'auteur **dans la ligne** (`created_by`, `from_parent`).

**Mécanisme starter.** Gabarit de déclencheur de notification portant cette
règle en commentaire, et un test qui vérifie qu'un auteur ne reçoit pas sa
propre notification lorsque l'écriture passe par une fonction serveur.

## 6.8 Changer la paire VAPID invalide tous les abonnements

**Référence :** `.env.example`, section Web Push.

**Mécanisme starter.** Avertissement dans `.env.example` et dans la checklist ;
clés générées une fois, identiques sur tous les environnements.

---

# 7. Tests et qualité

## 7.1 Une chaîne toujours rouge n'apprend qu'à ignorer le rouge

**Problème.** Les tests E2E exigeant une base réelle échouaient
systématiquement en CI, où les identifiants sont factices — sans rien prouver.
**Référence :** `e2e/parcours.spec.ts`, en-tête : *« une chaîne toujours rouge
ne protège de rien : elle apprend à ignorer le rouge, ce qui est pire que de
n'avoir aucune vérification »*.

**Correction.** Saut explicite et **motivé**, affiché dans le rapport.

**Bonne pratique.** Un test qu'on ne peut pas honorer se saute avec son motif,
il ne se laisse pas rouge.

## 7.2 Une réécriture large a fait disparaître du code

**Problème.** Une réécriture étendue a supprimé du code existant.
**Référence :** `AGENTS.md`, section « Émission des notifications » : le choix
des déclencheurs est justifié par ce précédent.

**Correction.** Ajouter par observation plutôt que réécrire des fonctions
éprouvées — en particulier celles qui garantissent l'intégrité comptable.

**Bonne pratique.** Préférer l'ajout à la réécriture sur tout ce qui est
couvert par des tests et déjà en production.

## 7.3 Pas de lint, pas d'écrans d'erreur

**Problème.** Aucun ESLint ni Prettier ; aucun `error.tsx`,
`global-error.tsx` ni `not-found.tsx` dans tout `src/app/`.
**Référence :** absence vérifiée dans le dépôt ; `CLAUDE.md` — *« tsc --noEmit
— no separate lint script »*.

**Conséquence.** Une erreur de rendu affiche la page d'erreur brute de Next.
Les conventions de style reposent sur la seule discipline.

**Mécanisme starter.** ESLint + Prettier configurés, `error.tsx`,
`global-error.tsx` et `not-found.tsx` livrés dans le socle.

## 7.4 Un filtre de messages d'erreur par mots métier

**Problème.** `lisible()` transmet les messages des fonctions serveur à
l'utilisateur en les reconnaissant par une expression régulière de mots métier
(`foyer|parent|montant|part|autoris|…`).
**Référence :** `src/lib/actions/core.ts`.

**Cause.** Aucune convention distinguant un message destiné à l'utilisateur
d'un message technique.

**Correction.** Préfixe conventionnel : `raise exception 'APP: …'`. Tout ce
qui porte le préfixe est affiché (préfixe retiré), le reste est remplacé par
un message générique.

**Mécanisme starter.** Convention `APP:` documentée, appliquée dans les
gabarits de fonction et vérifiée par un test.

---

# 8. Synthèse : les cinq mécanismes qui auraient évité le plus

Si un seul enseignement devait survivre à ce document, ce serait ces cinq
mécanismes, par ordre de rendement décroissant :

1. **Un banc de test qui reproduit fidèlement la production** — schéma
   `extensions`, rôle `service_role`, aucun privilège complaisant. Il aurait
   attrapé §3.1, §3.2 et §3.3 avant la production.
2. **`scripts/verifier-config.ts`** — pas de `process.env` dispersé, pas de
   montant en dur, pas de valeur d'attente, pas de couleur littérale, socle
   qui n'importe pas le métier. Il aurait attrapé §4.2, §4.3, §5.1.
3. **Un protocole de session obligatoire** — fetch/reset/`npm ci`, un seul
   intervenant à la fois, aucun commit local en fin de session. §1.3, §1.4.
4. **Une CI qui vérifie la branche qui déploie**, avec contrôle des marqueurs
   de conflit et des suites de tests orphelines. §1.1, §3.7.
5. **La règle « aucun faux succès silencieux »**, appliquée **partout** —
   lire `error` avant `data`, sans exception. §3.6.
