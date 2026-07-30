# AGENTS.md — carte du projet

Ce fichier existe pour qu'un intervenant qui découvre le dépôt — développeur,
assistant conversationnel, prestataire — puisse agir juste **sans avoir à
deviner**. Il répond à trois questions : où se trouve quoi, quelles règles ne
se négocient pas, et comment vérifier avant de livrer.

Complément indispensable : [`CONTRIBUER.md`](./CONTRIBUER.md) décrit le
processus de vérification et de déploiement.

---

## Le produit en trois phrases

**Coparentalité Zen** aide des parents séparés à organiser le planning de garde
et les dépenses partagées de leurs enfants. Le sujet est chargé
émotionnellement : chaque décision d'interface, chaque mot, chaque règle
comptable vise à réduire les occasions de conflit plutôt qu'à les arbitrer.

Marque : ParentZenFrance. Marché francophone. Application web progressive
installable, pensée pour iPhone d'abord.

---

## Pile technique

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
Supabase (PostgreSQL 16, Auth, Storage, RLS) · Vercel · Vitest · Playwright.

Aucune dépendance d'interface ajoutée : les icônes sont des tracés SVG maison
(`src/components/icons.tsx`), le service worker est écrit à la main.

---

## Où se trouve quoi

### Écrans (`src/app/`)

| Route | Fichier | Rôle |
|---|---|---|
| `/` | `page.tsx` | page commerciale publique |
| `/connexion`, `/inscription` | dossiers homonymes | authentification |
| `/mot-de-passe-oublie`, `/reinitialisation` | idem | récupération de compte |
| `/auth/callback` | `auth/callback/route.ts` | retour des liens e-mail |
| `/invitation/[token]` | dossier homonyme | acceptation nominative |
| `/app/accueil` | `app/accueil/page.tsx` | tableau de bord : solde, actions, dernières dépenses |
| `/app/planning` | `app/planning/page.tsx` | calendrier mensuel, légende, détail du jour |
| `/app/exceptions` | `app/exceptions/page.tsx` | vacances et changements ponctuels |
| `/app/depenses` | `app/depenses/page.tsx` | dépenses et remboursements, solde, validation |
| `/app/ajouter` | `app/ajouter/page.tsx` | saisie d'une dépense |
| `/app/enfants` | `app/enfants/page.tsx` | ajout, archivage |
| `/app/foyer` | `app/foyer/page.tsx` | membres, rythme de garde, invitation, RGPD, suppressions |
| `/app/plus` | `app/plus/page.tsx` | menu |
| `/app/offre` | `app/offre/page.tsx` | offre, extensions, abonnement, achats |
| `/api/paiement` | `api/paiement/route.ts` | ouverture d'un paiement Stripe |
| `/api/paiement/portail` | `api/paiement/portail/route.ts` | portail de gestion |
| `/api/stripe/webhook` | `api/stripe/webhook/route.ts` | réception des événements |
| `/hors-ligne` | `hors-ligne/page.tsx` | repli du service worker |
| `/sw.js` | `sw.js/route.ts` | service worker, version injectée au build |

`src/app/app/layout.tsx` porte l'en-tête, le bandeau bêta et le hash de version
affiché en haut à droite — ce hash est le seul moyen fiable de savoir quelle
version est réellement servie.

### Cœur métier (`src/lib/`)

`actions/` est un module découpé par domaine — `core` (socle et ActionResult),
`types`, `context`, `children`, `custody`, `household`, `balance`, `expenses`,
`reimbursements`, `attachments`, `privacy`, `premium` — réexporté par
`actions/index.ts`. Les écrans importent toujours `@/lib/actions` : le
découpage interne peut évoluer sans rien casser.

| Fichier | Responsabilité |
|---|---|
| `stripe.ts` | appels Stripe en HTTP et vérification de signature, **serveur seul** |
| `premium-horizon.ts` | garde d'horizon, fonction pure testable |
| `tarifs.ts` | lecture de la grille publique ; **aucun montant en dur** |
| `custody.ts` | moteur de planning : six rythmes, priorités, périodes continues |
| `money.ts` | répartition au plus fort reste, solde, formulations neutres |
| `serenite.ts` | score de complétude administrative du foyer (présentation seule) |
| `files.ts` | validation des justificatifs, chemins de stockage sûrs |
| `actions.ts` | **seule** couche d'accès aux données ; aucun composant n'appelle Supabase directement |
| `use-contexte.tsx` | chargement du foyer courant (membres, enfants, catégories) |
| `supabase/client.ts`, `server.ts` | création des clients |

### Composants (`src/components/`)

`ui.tsx` (badges parents, navigation basse), `icons.tsx` (16 glyphes, pastilles,
correspondance catégorie → icône), `etats.tsx` (chargement, erreur, sans foyer,
vide), `service-worker.tsx` (enregistrement et invite de mise à jour).

### Base de données (`supabase/`)

`migrations/` numérotées dans l'ordre d'application, `tests/` avec les suites
SQL et leurs jeux d'essai.

| Migration | Apport |
|---|---|
| `00001` – `00003` | 33 tables, RLS, données de référence |
| `00004` | profil automatique, foyer, invitations, export RGPD, suppressions |
| `00005` | policies Storage (nécessite le schéma `storage` de Supabase) |
| `00006` | création de dépense transactionnelle, revue, rythme de garde |
| `00007` | privilèges de table du rôle applicatif |
| `00008` | invitation nominative |
| `00009` – `00010` | remboursements et annulation |
| `00011` | modification et suppression de dépense |
| `00013` | **intégrité comptable** : écritures directes bloquées, solde autoritaire, verrouillage |
| `00014` | exceptions de planning : vacances et changements ponctuels |
| `00015` | **offres** : horizon de planning, extensions, abonnement, facturation |
| `00016` | **grille tarifaire unique** : prix, formules, tarifs Stripe, fonctions |

---

## Règles qui ne se négocient pas

Chacune vient d'un défaut rencontré en production. Les tests les font respecter :
si une modification en casse une, c'est presque toujours la modification qu'il
faut revoir.

**Argent.** Montants en centimes entiers (`bigint`), jamais de flottant.
Pourcentages en points de base (10000 = 100 %). La répartition utilise la
méthode du plus fort reste : la somme des parts égale toujours exactement le
total. Un test vérifie 3 000 combinaisons.

**Écriture.** Les tables `expenses`, `expense_shares`, `expense_children`,
`expense_comments` et `reimbursements` sont en **lecture seule** pour le rôle
applicatif. Toute écriture passe par une fonction serveur `SECURITY DEFINER`
qui contrôle l'identité, l'appartenance au foyer, les rôles et la cohérence,
puis journalise. La RLS protège le foyer ; elle ne protège pas les règles
comptables — d'où ce verrouillage.

**Solde.** Calculé exclusivement par `household_balance()` côté serveur, sur
l'intégralité des données. Les listes paginées servent à l'affichage, jamais au
calcul. Deux écrans ne doivent jamais afficher deux soldes différents.

**Rôles.** Un parent ne valide pas sa propre dépense, ni celle qu'il a saisie.
Chacun n'enregistre que les remboursements **qu'il effectue lui-même**. Un
remboursement ne peut ni excéder ce qui est dû, ni aller à contresens. Seuls
`owner` et `parent` sont comptables : médiateur et observateur sont exclus des
calculs.

**Verrouillage.** Une dépense entrée dans un solde déjà réglé ne peut plus être
modifiée ni supprimée. Il faut annuler le remboursement d'abord. Le critère est
chronologique : seul un remboursement postérieur à l'entrée de la dépense dans
le solde la verrouille.

**Planning.** Priorité stricte : vacances > changement ponctuel > rythme
récurrent. Une exception **masque** le rythme sans jamais le décaler ; à son
terme, le rythme reprend sur son calendrier d'origine.

**Traçabilité.** Suppressions logiques (`deleted_at`) sur toute donnée à valeur
probatoire. `audit_logs` et `expense_comments` sont immuables : aucune policy
de modification ni de suppression.

**Isolation.** Un foyer ne voit jamais les données d'un autre, même en
connaissant un identifiant.

**Prix.** La table `plans` est la seule source de vérité : montants mensuel et
annuel, identifiants de tarif Stripe, libellé public, liste des fonctions. La
table `plan_extensions` fait de même pour les achats ponctuels. La page
commerciale, l'écran d'offre et la création de session Stripe lisent tous ces
tables via `grille_tarifaire()` et `grille_extensions()`, publiques et sans
authentification. **Aucun montant n'est écrit dans le code** — trois prix
différents avaient coexisté dans le projet, et annoncer un tarif tout en
facturant un autre se règle devant un médiateur de la consommation. Ajuster un
prix se fait par un `update` sur ces tables, et nulle part ailleurs.

**Offres.** L'offre gratuite couvre trois mois de planning à compter de la
création du foyer ; les extensions achetées s'y ajoutent et restent acquises ;
un abonnement actif rend l'horizon illimité. La limite ne porte **que sur la
planification future** : dépenses, remboursements, justificatifs et export
restent accessibles en toutes circonstances. Bloquer l'accès à des pièces qui
peuvent servir devant un médiateur serait indéfendable.

---

## Conventions

**Langue.** Interface intégralement en français. Le code, les noms de fonctions
serveur et les messages d'erreur métier aussi.

**Vocabulaire neutre.** « Montant à régulariser », pas « dette ». « Dépense à
vérifier », pas « refusée ». « En attente de réponse », pas « ignoré ».
« Demande de modification », pas « conflit ». Le produit s'adresse à des parents
séparés : les mots pèsent.

**Identité visuelle.** Logo officiel dans `public/branding/`, jamais redessiné
ni recoloré. Couleurs mesurées sur le logo : navy `#4E6381`, corail `#E4A196`,
sauge `#9AA791`, crème `#FCF9F6`, encre `#101B2C`. Corail et sauge ne passent
pas le contraste AA en texte : réservés aux fonds, variantes texte dédiées dans
`globals.css`.

**Accessibilité.** Les deux parents ne sont **jamais** distingués par la seule
couleur : toujours une initiale ou un libellé. Cibles tactiles ≥ 44 px. Mobile
d'abord.

**Honnêteté produit.** Aucun bouton factice, aucune donnée décorative, aucune
simulation présentée comme fonctionnelle. Un écran incomplet le dit. Un message
ne promet jamais ce que le produit ne fait pas — « l'autre parent en est
informé » était faux tant que les notifications n'existaient pas.

**Erreurs.** Affichées là où l'utilisateur agit, pas en haut de page. Les
détails techniques sont masqués en production et regroupés dans un dépliant
« Détails techniques » pendant la bêta.

---

## Commandes

```bash
npm ci                # installation
npm run dev           # développement
npm run verify        # types + tests unitaires + build + bout en bout
npm run test:sql      # 14 migrations + 116 assertions (PostgreSQL requis)
```

`scripts/test-sql.sh` applique les migrations sur une base vierge, puis exécute
chaque suite sur **un clone frais** — l'isolation est indispensable, les suites
créant des remboursements qui déclencheraient les verrous des suivantes.

---

## Pièges vérifiés à nos dépens

**Vercel ignore les commits dont l'auteur Git est inconnu du compte GitHub.**
Une heure perdue à croire l'application figée. Configurer une fois :

```bash
git config user.email "<identifiant>+<utilisateur>@users.noreply.github.com"
git config user.name  "<utilisateur>"
```

**Ne jamais annoncer un déploiement sans l'avoir constaté.** Le hash affiché
dans l'application est la seule preuve.

**Une migration SQL ne change pas le hash.** Modifier la base ne modifie pas le
code : ne pas confondre les deux quand on cherche pourquoi « rien n'a changé ».

**`clients.claim()` dans un service worker interrompt les navigations en
cours.** Retiré volontairement : le worker prend la main au chargement suivant.

**Un service worker casse les redirections du middleware** s'il ne relaie pas
la réponse en mode `manual` — la garde d'authentification tombe alors en erreur.

**Les fonctions `SECURITY DEFINER` masquent les droits manquants.** Des tests
peuvent passer alors que la lecture directe échoue en production. Le banc de
test n'accorde donc jamais de privilège que le rôle applicatif n'aurait pas.

---

## Ce qui reste à faire

Journal d'activité et écran Historique · notifications internes et badge ·
pièces jointes multiples et corbeille · page d'administration bêta · export PDF
mensuel · sauvegarde automatique · validation juridique des textes
(`juridique/`, non validés par un professionnel).

Les paiements attendent uniquement les clés Stripe (voir `.env.example`) : le
code est en place et testé, mais aucun encaissement n'est possible sans elles.
