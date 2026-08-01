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
| `/app/vacances` | `app/vacances/page.tsx` | répartition des cinq périodes de l'année |
| `/app/exceptions` | `app/exceptions/page.tsx` | échanges, voyages, absences |
| `/app/depenses` | `app/depenses/page.tsx` | dépenses et remboursements, solde, validation |
| `/app/ajouter` | `app/ajouter/page.tsx` | saisie d'une dépense |
| `/app/enfants` | `app/enfants/page.tsx` | ajout, archivage |
| `/app/foyer` | `app/foyer/page.tsx` | membres, rythme de garde, invitation, RGPD, suppressions |
| `/app/plus` | `app/plus/page.tsx` | menu |
| `/app/offre` | `app/offre/page.tsx` | offre, extensions, abonnement, achats |
| `/api/paiement` | `api/paiement/route.ts` | ouverture d'un paiement Stripe |
| `/api/paiement/portail` | `api/paiement/portail/route.ts` | portail de gestion |
| `/api/stripe/webhook` | `api/stripe/webhook/route.ts` | réception des événements |
| `/api/vacances/synchroniser` | `api/vacances/synchroniser/route.ts` | import du calendrier officiel |
| `/api/rappels` | `api/rappels/route.ts` | programmation nocturne des rappels |
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
| `rythmes.ts` | catalogue des six rythmes, explications et schémas |
| `configuration.ts` | étapes du parcours guidé, fonctions pures |
| `actions/notifications.ts` | centre, préférences et délais de rappel |
| `actions/rendez-vous.ts` | rendez-vous et affaires à prévoir |
| `partage-invitation.ts` | numéros, message et liens de transmission |
| `tarifs.ts` | lecture de la grille publique ; **aucun montant en dur** |
| `actions/vacances.ts` | calendrier scolaire officiel du foyer |
| `actions/localisation.ts` | pays, subdivision, déduction depuis le code postal |
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
| `00017` | **vacances scolaires** : calendrier officiel, import, suivi |
| `00018` | **localisation multi-pays** : pays, subdivisions, déduction de zone |
| `00019` | retrait des vacances non vérifiées du jeu de départ |
| `00020` | **droits du rôle de service** : import et facturation |
| `00021` | **moteur générique d'exceptions** : types, priorités, propositions |
| `00022` | rythme 3-4-4-3 et cycle personnalisé configurable |
| `00023` | **second parent provisoire** : nommé avant son inscription |
| `00024` | correction de `propositions_vacances` (min(uuid) impossible) |
| `00025` | **moteur de notifications** : types, canaux, préférences, rappels |
| `00027` | **rendez-vous** : consultations, activités, affaires à prévoir |
| `00028` | **programmation des rappels** : idempotente, par délai de parent |
| `00029` | déclencheurs de notification par observation |
| `00030` | **notifications poussées** : abonnements et file d'envoi |

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

**Émission des notifications.** Les faits du planning passent par les fonctions
métier ; les autres — dépenses, remboursements, invitations, modifications de
période — sont émis par des **déclencheurs qui observent les changements**.

Ce choix évite de réécrire des fonctions éprouvées, dont celles qui garantissent
l'intégrité comptable : une réécriture large a déjà fait disparaître du code
dans ce projet. La notification part en outre quelle que soit la voie
d'écriture employée.

Dans un déclencheur, **l'auteur se lit dans la ligne** (`created_by`,
`from_parent`) plutôt que via `auth.uid()`, qui ne reflète pas toujours la
session lorsqu'il est appelé depuis une fonction `SECURITY DEFINER`.

Deux discrétions volontaires : modifier la note d'une période ne notifie pas,
seuls les dates et le parent gardien comptent ; corriger le libellé d'un
rendez-vous non plus, seule la date déclenche une alerte.

**Notifications poussées.** Le canal Push est actif. Un abonnement appartient
à un **appareil**, pas à un compte : un parent alerté sur son téléphone et sa
tablette possède deux abonnements.

Le protocole chiffre de bout en bout — le serveur de distribution relaie un
message qu'il ne peut pas lire. La bibliothèque `web-push` s'en charge ;
l'implémenter à la main demanderait ECDH, HKDF et AES-GCM.

Chaque envoi laisse une trace dans `notification_deliveries` : une notification
déjà poussée ne l'est jamais deux fois. Un abonnement expiré (404 ou 410) est
retiré plutôt que réessayé — l'application a été désinstallée ou la permission
révoquée.

**Sur iPhone**, le Push exige iOS 16.4 et que l'application soit installée sur
l'écran d'accueil. Depuis Safari, la permission ne peut même pas être demandée :
l'interface explique la marche à suivre au lieu de laisser un bouton échouer.

**Rappels.** Une tâche nocturne programme trois familles de rappels :
rendez-vous à venir avec les affaires restant à préparer, début et fin des
périodes de vacances, changements de garde.

Le calcul des changements vit dans la route applicative et non en base : le
moteur qui détermine qui a les enfants quel jour est en TypeScript, éprouvé
par ses tests. Le réécrire en SQL créerait deux vérités concurrentes.

**L'idempotence est la propriété critique** : la tâche repasse chaque nuit sur
les mêmes événements. Un index unique sur (destinataire, type, entité) rend
l'opération rejouable — sans lui, un rendez-vous produirait un rappel par nuit
jusqu'à sa date. Un événement déplacé met à jour l'heure et réactive le rappel
même s'il avait été lu ; un événement supprimé voit son rappel purgé.

Chaque parent reçoit son propre horaire, calculé depuis son réglage : l'un
veut la veille, l'autre une heure avant.

**Rendez-vous.** Un moment précis concernant un enfant — consultation,
réunion, activité. Il **se superpose au planning sans jamais modifier la
garde** : noter un dentiste ne déplace aucun enfant. C'est la différence
essentielle avec une exception, et un test la vérifie explicitement.

L'accompagnant est explicite et non déduit : un parent peut emmener l'enfant
chez le médecin un jour où il n'est pas chez lui.

Les **affaires à prévoir** (« cartable », « carte Vitale ») s'attachent à un
rendez-vous ou à un jour de la semaine récurrent — c'est au moment du passage
d'un parent à l'autre qu'on oublie le plus. Chaque catégorie propose ses
suggestions.

**Notifications.** Une notification est un fait ; le canal par lequel elle
atteint le parent est une question distincte. Cette séparation permettra
d'activer le Push puis le courriel **sans rien reprendre** : les tables
`notification_channels`, `notification_deliveries` et `push_subscriptions`
existent déjà, et les préférences acceptent les trois canaux. Seul
« application » est actif.

Onze types répartis en trois catégories, chacun réglable par parent. Un parent
n'est **jamais notifié de sa propre action** — `notifier()` écarte l'auteur.
Les notifications sont **privées** : la politique de sécurité les réserve à
leur destinataire, car elles révèlent ce qu'il consulte et quand.

Les rappels portent une date de pertinence (`scheduled_at`) et n'apparaissent
qu'à leur heure, ni dans la liste ni dans le décompte. Le délai est réglable
par parent : 5, 15, 30 minutes, 1 heure ou la veille.

**Parcours de configuration.** Six étapes, dans un ordre qui n'est pas
arbitraire : foyer, enfants, **second parent nommé**, rythme, vacances,
**invitation**. L'invitation vient en dernier parce qu'elle vaut validation —
on ne dérange pas l'autre parent pour lui montrer un espace vide.

Le rythme exigeant deux parents, le premier **nomme** simplement le second :
un profil provisoire est créé, sans compte ni connexion possible, qui sert de
repère dans le planning et les dépenses. À l'acceptation de l'invitation, le
compte réel prend sa place et **hérite de tout** — périodes, dépenses, parts,
remboursements, rythme. Neuf assertions couvrent ce transfert, dont la
justesse du solde après fusion.

Un avertissement signale une invitation prématurée (aucun enfant, pas de
rythme) mais ne bloque jamais : un parent pressé doit pouvoir inviter tout de
suite.

**Planning.** Une exception est une période pendant laquelle un parent
déterminé a les enfants, en dérogation au rythme. Ce qui distingue une vacance
d'un voyage n'est pas sa nature technique mais son **rang de priorité**, défini
dans la table `exception_types` — extensible par une simple ligne, sans
migration ni code. Le moteur ne connaît aucun type : il applique les exceptions
de la moins prioritaire à la plus prioritaire.

Rangs livrés : absence exceptionnelle (50) > voyage (40) > vacances scolaires
(30) > échange de week-end (20) > changement ponctuel (10). Une hospitalisation
prime sur des vacances planifiées ; des billets pris priment sur un échange
convenu de longue date.

Toute exception **masque** le rythme sans jamais le décaler ; à son terme, le
rythme reprend sur son calendrier d'origine.

Les dates officielles de vacances sont des **propositions** : l'écran
`/app/vacances` les pré-remplit période par période, les parents choisissent le
parent gardien et ajustent librement les dates.

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

**Vacances scolaires et localisation.** Le foyer enregistre son pays et sa
subdivision ; les périodes viennent des calendriers officiels, importés chaque
semaine par une tâche planifiée. Aucun parent ne saisit jamais de vacances.

L'architecture est indépendante du pays : `calendar_countries` déclare pour
chacun comment sa subdivision se détermine — `zone` (découpe nationale, cas de
la France), `region` (canton suisse, communauté belge, province québécoise) ou
`national` (Luxembourg). Ajouter un pays revient à activer sa ligne et à
brancher un importateur : **aucune migration de structure**. Cinq pays sont
déclarés, la France est active.

**Aucune date n'est écrite dans le code, et aucune zone n'est devinée.** La
table `calendar_area_zones` (département → zone) est vide à l'installation et
alimentée par l'import officiel ; sans correspondance connue, la fonction
renvoie null et l'utilisateur choisit lui-même. Si l'import n'a pas eu lieu,
l'interface le dit plutôt que d'afficher un calendrier approximatif — une date
fausse dans un planning de garde, c'est un enfant qui attend devant une école.

**Les vacances scolaires n'attribuent jamais la garde.** Elles sont une donnée
de référence, affichée en liseré doré sur le calendrier. La garde est déterminée
uniquement par le rythme, les changements ponctuels et les exceptions décidées
par les parents. Changer de pays, de subdivision ou importer de nouvelles
vacances ne supprime aucune décision utilisateur — le test L7 le vérifie sur les
exceptions, les dépenses, les remboursements et le rythme.

**Icônes.** Le symbole source touche les bords de son fichier ; toute icône
générée avec une marge insuffisante est rognée par les masques d'iOS et
d'Android. `scripts/generer-icones.py` recadre le symbole sur son contenu réel
puis applique les marges conformes : 80 % de la largeur pour les icônes
standard, **54 % pour les maskable** — un carré inscrit dans le cercle de
sécurité d'Android ne mesure que 0,8/√2 ≈ 56 % du côté. Le script vérifie
ensuite qu'aucun logo ne touche un bord. Régénérer après tout changement de
logo : `python3 scripts/generer-icones.py`.

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

## Tâches planifiées

`vercel.json` déclare une tâche hebdomadaire (lundi 4 h) qui appelle
`/api/vacances/synchroniser` pour importer le calendrier scolaire officiel.
Une fois par semaine suffit : il ne change qu'à la publication d'une nouvelle
année scolaire ou d'une correction. Le fichier ne contient que `path` et
`schedule` — le schéma de Vercel rejette tout champ supplémentaire.

La route exige `CRON_SECRET` : Vercel l'envoie automatiquement en en-tête
`Authorization: Bearer …`. Un membre connecté peut aussi déclencher une mise à
jour depuis les paramètres du foyer, limitée à une fois par heure.

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

**`revoke from public` prive aussi `service_role`.** Les traitements sans
utilisateur — import du calendrier, webhook Stripe — s'exécutent avec ce rôle.
Révoquer une fonction « pour tous » lui retire son droit implicite, et l'appel
échoue sur `permission denied for function` sans rien écrire : un import
silencieusement impossible, un paiement encaissé sans contrepartie. Toute
fonction destinée au rôle de service doit recevoir un `grant execute … to
service_role` explicite. Le banc de test reproduit ce rôle et six assertions le
vérifient.

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
