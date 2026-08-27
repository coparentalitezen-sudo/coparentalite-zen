# 01 — Architecture : audit réel, frontière socle/métier, cible

Ce document contient les étapes 1 à 4 de la mission : l'audit du code
réellement présent, la séparation socle/métier, l'architecture du futur
starter et la centralisation de la configuration.

---

# Partie A — Audit du dépôt réel

Vérifié sur `develop`, commit `bee66f3`. Chaque ligne indique un emplacement
constaté, pas supposé.

## A.1 Pile et outillage

| Élément | Version constatée | Emplacement |
|---|---|---|
| Next.js | `^15.5.21`, App Router | `package.json`, `src/app/` |
| React | `^19.2.8` | `package.json` |
| TypeScript | `5.8.2`, `strict: true` | `tsconfig.json` |
| Tailwind CSS | `^4.3.3` via `@tailwindcss/postcss` | `postcss.config.mjs`, `src/app/globals.css` |
| Supabase | `@supabase/ssr ^0.12.3`, `supabase-js ^2.110.8` | `src/lib/supabase/` |
| Tests unitaires | Vitest `^4.1.10` | `vitest.config.ts`, `tests/` |
| Tests E2E | Playwright `^1.61.1` | `playwright.config.ts`, `e2e/` |
| Push | `web-push ^3.6.7` | `src/lib/push.ts` |
| Analytics | `@vercel/analytics ^2.0.1` | `src/app/layout.tsx` |
| Génération d'images | `pngjs`, `jpeg-js` | `src/lib/marketing/visuel.ts` |
| Polices | `@fontsource/inter` | `src/polices/inter.ts` |

**Aucune bibliothèque d'interface.** Les icônes sont des tracés SVG maison
(`src/components/icons.tsx`), le service worker est écrit à la main. C'est un
choix à conserver : moins de surface de mise à jour, aucun style imposé.

**Absent et à noter :** aucun ESLint, aucun Prettier, aucun `error.tsx`,
`not-found.tsx` ni `global-error.tsx` dans tout `src/app/`. Le script
`typecheck` (`tsc --noEmit`) tient lieu de lint. Ce sont deux manques réels du
socle, corrigés dans la cible.

## A.2 Structure du projet

```
src/
  app/              routes App Router (pages publiques, /app/*, /api/*)
  components/       18 composants partagés
  lib/              logique : actions/, marketing/, paiement/, supabase/, moteurs
  polices/          chargement de police
  middleware.ts     garde d'authentification + canonisation de domaine
supabase/
  migrations/       00001 → 00049, numérotées, idempotentes
  tests/            21 suites SQL + 3 jeux d'essai
tests/              43 fichiers Vitest
e2e/                parcours.spec.ts
scripts/            test-sql.sh, generer-icones.py, generate-rapport-pdf.py
emails/             base.html + emails.json (gabarits)
juridique/          textes juridiques provisoires
.github/workflows/  ci.yml, supabase-migrations.yml
```

Alias `@ → ./src`, déclaré **trois fois** et c'est nécessaire :
`tsconfig.json` (paths), `next.config.mjs` (webpack), `vitest.config.ts`
(resolve.alias). Oublier le troisième rend intestable tout module utilisant
`@/...`.

## A.3 Supabase / PostgreSQL

| Sujet | Constat | Emplacement |
|---|---|---|
| Clients | 3 : navigateur, serveur (cookies), service (`service_role`) | `src/lib/supabase/client.ts`, `server.ts` |
| Tables | 59 tables, schéma `public` | `supabase/migrations/00001_schema.sql` et suivantes |
| Migrations | 49 fichiers `00001` → `00049`, idempotents, souvent transactionnels | `supabase/migrations/` |
| RLS | activée par boucle sur **toutes** les tables de `public` | `00002_rls.sql` |
| Helpers RLS | `is_member`, `member_role_in`, `can_write`, `is_parent` — `SECURITY DEFINER`, `search_path` verrouillé | `00002_rls.sql` |
| GRANT de table | `authenticated` reçoit CRUD + `alter default privileges` | `00007_grants.sql` |
| Durcissement | `revoke ... from public, anon` puis `grant` explicite par fonction | `00026_security_hardening.sql` |
| Fonctions | ~143 `create (or replace) function` cumulées | toutes migrations |
| Profil auto | trigger `on_auth_user_created` → `handle_new_user()` | `00004_functions.sql` |
| Storage | 3 seaux privés : `justificatifs`, `documents`, `sauvegardes` | `00005`, `00039` |
| Convention de chemin | `{household_id}/{uuid}.{ext}`, foyer déduit par `household_from_path()` | `00005_storage_policies.sql` |
| Suppression logique | `deleted_at` sur toute donnée probatoire | `00001_schema.sql` |
| Immuabilité | `audit_logs`, `expense_comments` : aucune policy update/delete | `00002_rls.sql` |
| Conventions monétaires | centimes `bigint`, pourcentages en points de base | `00001_schema.sql` (en-tête) |

## A.4 Authentification et profils

- Supabase Auth (e-mail + mot de passe), pages `src/app/connexion/`,
  `inscription/`, `mot-de-passe-oublie/`, `reinitialisation/`.
- Retour des liens e-mail : `src/app/auth/callback/route.ts`.
- Garde : `src/middleware.ts`. Protège `/app`, `/connexion`, `/inscription`,
  `/invitation`. Redirige vers `/connexion?suite=<chemin>` si absent de
  session, et vers `/app/accueil` si déjà connecté sur une page d'auth.
- Le middleware sert aussi à **canoniser le domaine** (`HOTES_OBSOLETES`),
  en 307 volontairement — une 308 serait mise en cache par le navigateur.
- **Mode démonstration** : sans variables Supabase, le middleware laisse tout
  passer et l'application affiche un bandeau. Cette propriété rend la CI
  possible sans base réelle.
- Table `profiles` = miroir de `auth.users` (id, email, display_name,
  avatar_url, locale, timezone). Table `user_settings` (thème, début de
  semaine, `preferences jsonb`).

## A.5 PWA

| Élément | Emplacement | Point notable |
|---|---|---|
| Manifeste | `src/app/manifest.ts` (route Next) | 13 icônes dont 2 maskable, 3 raccourcis, `id`, `scope`, `display_override` |
| Service worker | `src/app/sw.js/route.ts` — **généré dynamiquement** | version injectée depuis `VERCEL_GIT_COMMIT_SHA` → chaque déploiement force la réinstallation |
| Enregistrement | `src/components/service-worker.tsx` | invite de mise à jour, message `SKIP_WAITING` |
| Page hors ligne | `src/app/hors-ligne/page.tsx` | repli du worker |
| Icônes | `public/icons/` (21 fichiers) + `public/splash/` (13 écrans) | générées par `scripts/generer-icones.py` |
| Détection plateforme | `src/lib/installation.ts` | fonctions pures, testées (`tests/installation.test.ts`) |
| Invite d'installation | `src/components/install-app-card.tsx`, `installation.tsx` | marche à suivre par plateforme |

**Règle de cache constatée dans le worker :** aucune donnée métier n'est
jamais mise en cache. Supabase est sur un autre domaine (non intercepté), les
pages `/app/*` sont authentifiées (jamais stockées), seuls `/_next/static/` et
les images publiques le sont. Pas de `clients.claim()` — il interrompt les
navigations en cours.

## A.6 Notifications et e-mails

- **Moteur en base** : `notification_types` (11 types, 3 catégories),
  `notification_channels`, `notification_preferences`,
  `notification_deliveries`, `push_subscriptions`, `reminder_settings`.
  Migrations `00025`, `00028`, `00029`, `00030`, `00040`, `00047`, `00048`.
- **Séparation fait / canal** : une notification est un fait ; le canal est
  une question distincte. C'est ce qui a permis d'activer Push puis e-mail
  sans rien reprendre.
- **Émission par déclencheurs** qui observent les changements, plutôt que par
  réécriture des fonctions métier. Dans un déclencheur, l'auteur se lit dans
  la ligne (`created_by`), jamais via `auth.uid()` — qui ne reflète pas la
  session depuis une fonction `SECURITY DEFINER`.
- **Idempotence** : index unique (destinataire, type, entité). La tâche
  nocturne repasse sur les mêmes événements ; sans cet index, un rappel par
  nuit.
- **Push** : `src/lib/push.ts` (web-push, VAPID), `src/app/api/push/abonner`,
  `api/push/envoyer`. Un abonnement appartient à un **appareil**. Un endpoint
  404/410 est supprimé, jamais réessayé. Pastille via `src/lib/pastille.ts` +
  `setAppBadge` posé **dans le service worker** (application fermée).
- **E-mail** : Resend en HTTP brut (`src/lib/email.ts`, pas de SDK), gabarits
  dans `emails/base.html` et `emails/emails.json`, envoi par tâche planifiée
  `api/email/envoyer`.

## A.7 Stripe et modèle économique

| Élément | Emplacement |
|---|---|
| Accès Stripe | `src/lib/stripe.ts` — **fetch HTTP brut, aucun SDK**, `Stripe-Version` figée |
| Ouverture de paiement | `src/app/api/paiement/route.ts` |
| Portail client | `src/app/api/paiement/portail/route.ts` |
| Webhook | `src/app/api/stripe/webhook/route.ts` |
| Idempotence | `src/lib/payment-idempotency.ts` + en-tête `Idempotency-Key` |
| Grille tarifaire | tables `plans`, `plan_extensions` ; RPC publics `grille_tarifaire()`, `grille_extensions()` |
| Lecture côté app | `src/lib/tarifs.ts` — **aucun montant en dur**, cache 1 h |
| Droits Premium | `household_entitlement`, `premium-horizon.ts`, migrations `00015`, `00016`, `00037` |
| Paiement 50/50 | `00046`, `src/lib/paiement-partage.ts`, drapeau `PAYMENT_SPLIT_ENABLED` — **dormant** |

Les `price_id` Stripe vivent **en base**, à côté des montants qu'ils
représentent, pas en variables d'environnement. C'est ce qui interdit
structurellement d'annoncer un prix et d'en facturer un autre.

## A.8 RGPD et juridique

| Droit / obligation | Implémentation | Emplacement |
|---|---|---|
| Export (art. 20) | route GET, session du demandeur (jamais `service_role`) | `src/app/api/mes-donnees/route.ts` + `export_my_data()` |
| Suppression (art. 17) | résiliation Stripe **d'abord**, puis `delete_my_account()` | `src/app/api/supprimer-compte/route.ts`, `00038` |
| Consentements | table `consent_logs` immuable (type, version, granted, ip_hash) | `00001_schema.sql` |
| Version des textes | `LEGAL_VERSION` | `src/lib/legal.ts` |
| Identité éditeur | variables d'environnement, plusieurs noms acceptés, validation SIREN | `src/lib/legal.ts` |
| Pages légales | `/cgu`, `/confidentialite`, `/mentions-legales`, `/contact`, `/aide` | `src/app/*/page.tsx` + `src/components/legal-page.tsx` |
| Textes | non validés par un professionnel | `juridique/TEXTES-JURIDIQUES-PROVISOIRES.md` |
| Confidentialité intra-app | écran dédié | `src/app/app/confidentialite/` |

`identiteComplete()` et `etatIdentite()` permettent de **vérifier
programmatiquement** que l'identité légale est complète avant commercialisation.
Le SIREN a été obtenu et renseigné (2026-08-28) ; la fonction exige en outre
une dénomination distincte du nom du produit et une adresse — à confirmer par
`/api/diagnostic` sur le déploiement de production.
Le champ `mediation` (`LEGAL_MEDIATOR`) vaut encore « À compléter avant
commercialisation publique ».

## A.9 Sécurité

- **En-têtes** dans `next.config.mjs` : CSP complète, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS
  `max-age=63072000; includeSubDomains; preload`.
- **CSP** : `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
  Stripe autorisé explicitement (`js.stripe.com`, `checkout.stripe.com`),
  Supabase autorisé en `connect-src` (https + wss).
- `server-only` en dépendance : garde-fou d'import côté serveur.
- Secrets : `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`
  — jamais préfixés `NEXT_PUBLIC_`, jamais dans Git.
- `src/app/api/diagnostic/route.ts` : dit **quelles variables sont présentes,
  jamais leur valeur**, et identifie le rôle porté par une clé Supabase sans la
  révéler (les clés anon et service_role sont visuellement identiques).

## A.10 Déploiement, CI/CD, sauvegardes

- **Vercel déploie depuis `develop`**, pas `main`.
- `vercel.json` : 6 tâches planifiées (Hobby = **1 exécution/jour maximum**
  par tâche ; un horaire plus fréquent fait échouer la construction
  silencieusement).
- `.github/workflows/ci.yml` : deux jobs parallèles (application : typecheck +
  vitest + build + Playwright ; base : `scripts/test-sql.sh` sur un service
  PostgreSQL 16) + un job `verdict` bloquant.
  **La CI se déclenche sur `main` uniquement** — donc pas sur la branche qui
  déploie réellement. Défaut majeur, traité en `13`.
- `.github/workflows/supabase-migrations.yml` : `workflow_dispatch` manuel avec
  choix `verification` / `appliquer`.
- **Sauvegardes** : `src/app/api/sauvegarde/route.ts` → seau privé
  `sauvegardes`, accessible à la seule clé de service. Procédure dans
  `SAUVEGARDE-RESTAURATION.md`. Purge volontairement non automatisée.

## A.11 Interface

- Mobile d'abord. Tokens de design dans `src/app/globals.css` (`@theme`) :
  palette, `--radius-card`, `--radius-btn`, familles de polices.
- Classes utilitaires maison : `.card`, `.btn`, `.btn-primary`, `.btn-ghost`.
- Cibles tactiles ≥ 44 px imposées sur `.btn`, `input`, `select`, `textarea`.
- États homogènes dans `src/components/etats.tsx` : `Chargement`, `Erreur`
  (avec dépliant « Détails techniques »), `SansFoyer`, `Vide`.
- Accessibilité : `role="status"`, `role="alert"`, jamais de distinction par la
  seule couleur.
- Erreurs affichées **là où l'utilisateur agit**, pas en haut de page.

---

# Partie B — Frontière socle / métier

## B.1 SOCLE RÉUTILISABLE (à extraire tel quel)

### Infrastructure

| Brique | Source dans Coparentalité Zen | Reprise |
|---|---|---|
| Clients Supabase (3) | `src/lib/supabase/*` | telle quelle |
| Garde d'auth + canonisation | `src/middleware.ts` | chemins protégés à paramétrer |
| Mode démonstration | partout (`if (!url \|\| !key) return null`) | tel quel — c'est un principe |
| En-têtes de sécurité + CSP | `next.config.mjs` | domaines tiers à paramétrer |
| Alias `@` (×3) | `tsconfig`, `next.config`, `vitest.config` | tel quel |
| `ActionResult` / `ok` / `err` / `lisible` | `src/lib/actions/core.ts` | tel quel, sans le filtre de mots métier |
| Diagnostic de configuration | `src/app/api/diagnostic/route.ts` | liste de variables à paramétrer |

### Compte et identité

Inscription, connexion, déconnexion, mot de passe oublié, réinitialisation,
callback e-mail, table `profiles` + trigger `handle_new_user()`, table
`user_settings`, écran de paramètres.

### Base de données

- Conventions : centimes `bigint`, points de base, `deleted_at`,
  `created_by`, trigger `set_updated_at` généralisé.
- Modèle RLS : helpers `SECURITY DEFINER` à `search_path` verrouillé,
  activation en boucle sur toutes les tables, GRANT de table séparés,
  `alter default privileges`, durcissement `revoke public/anon` + `grant`
  explicite.
- Discipline de migration : numérotées, idempotentes, transactionnelles,
  chacune accompagnée d'une suite de tests.
- Storage : seaux privés, chemin `{scope_id}/{uuid}.{ext}`, policies par
  appartenance.

### PWA

Manifeste, service worker versionné par le build, page hors ligne,
enregistrement + invite de mise à jour, générateur d'icônes, écrans de
démarrage iOS, détection de plateforme, marche à suivre d'installation.

### Notifications et e-mails

Modèle fait/canal, préférences par utilisateur et par type, file de
livraison idempotente, abonnements Push par appareil, purge des endpoints
morts, pastille, gabarits e-mail, envoi Resend, tâches planifiées.

### Paiement

Client Stripe HTTP, session Checkout (paiement unique et abonnement), portail
client, webhook signé, idempotence, grille tarifaire en base, notion de droit
(`entitlement`) gratuit/payant, résiliation avant suppression de compte.

### Conformité

Export, suppression de compte, journal de consentement, identité éditeur
paramétrable et vérifiable, gabarit de page légale, écran de confidentialité.

### Qualité et livraison

Banc de test SQL (`scripts/test-sql.sh`, y compris la simulation du schéma
`auth`, du rôle `service_role` et de `pgcrypto` dans `extensions`), Vitest,
Playwright avec saut conditionnel documenté, CI à deux jobs + verdict,
workflow de migrations, `.env.example` commenté, `AGENTS.md` / `CONTRIBUER.md`.

### Interface

Tokens de design, `.card` / `.btn`, états homogènes, navigation basse mobile,
jeu d'icônes SVG, règles d'accessibilité.

## B.2 MÉTIER COPARENTALITÉ ZEN (à ne jamais reprendre)

**Ne doit sous aucun prétexte entrer dans le starter :**

- **Domaine** : foyer, membre de foyer, parent, second parent provisoire,
  enfant, contact d'enfant, rôles `owner`/`parent`/`step_parent`/`mediator`.
- **Planning** : rythmes de garde (`src/lib/rythmes.ts`, `custody.ts`),
  périodes, exceptions, types d'exception et priorités, échanges de week-end,
  jour de changement.
- **Vacances scolaires** : `calendar_countries`, `calendar_zones`,
  `calendar_area_zones`, `school_holidays`, import officiel,
  `src/lib/calendrier-officiel.ts`, `actions/vacances.ts`, `localisation.ts`.
- **Comptabilité partagée** : dépenses, parts, répartition au plus fort reste,
  remboursements, solde autoritaire (`household_balance()`), verrouillage
  comptable, `src/lib/money.ts`.
- **Rendez-vous et affaires à prévoir**, messagerie, documents partagés,
  rapport mensuel (`src/lib/rapport.ts`).
- **Score de sérénité** (`src/lib/serenite.ts`), parcours de configuration en
  six étapes (`src/lib/configuration.ts`), quiz de rythme (`src/lib/quiz.ts`).
- **Marketing automatisé** (`src/lib/marketing/*`, ~20 fichiers) : Meta,
  Pinterest, niches, opportunités, liens courts, mesures, bilan hebdomadaire.

### Cas ambigus — la décision retenue

| Élément | Verdict | Motif |
|---|---|---|
| `src/lib/money.ts` | **Socle partiel** | Le formatage et la répartition au plus fort reste sont génériques ; les formulations neutres (« montant à régulariser ») sont métier. Extraire la partie calcul. |
| `src/lib/files.ts` | **Socle** | Validation de type/taille et construction de chemin sûr : aucune notion métier. |
| Notion de **foyer** | **Socle par abstraction** | Presque toute application a un « périmètre partagé » (foyer, espace, organisation, ménage). Le starter fournit un `workspace` neutre — voir C.3. |
| `src/lib/premium-horizon.ts` | **Socle par abstraction** | Une limite d'usage liée à l'offre est générique ; « trois mois de planning » ne l'est pas. Le starter fournit un mécanisme de quota paramétrable. |
| Marketing | **Hors socle** | Trop couplé à Meta/Pinterest et au ton de la marque. Pourra devenir un **module optionnel** séparé plus tard. |
| `src/lib/serenite.ts` | **Métier** | Purement Coparentalité Zen. |

---

# Partie C — Architecture cible du starter

## C.1 Arborescence

```
app-starter/
├── app.config.ts                 ← identité, marque, SEO, légal, offres
├── features.config.ts            ← interrupteurs de fonctionnalités
├── .env.example
├── README.md
├── AGENTS.md                     ← carte du projet, à compléter par application
├── CONTRIBUER.md
├── docs/                          ← ce dossier, copié dans chaque application
│
├── src/
│   ├── config/
│   │   ├── index.ts              ← relit app.config + features, valide, exporte
│   │   ├── env.ts                ← lecture typée des variables d'environnement
│   │   └── legal.ts              ← identité éditeur (généralisé de legal.ts)
│   │
│   ├── socle/                    ← INTERDIT DE MODIFIER pour du métier
│   │   ├── auth/                 pages, callback, garde
│   │   ├── supabase/             client / server / service
│   │   ├── donnees/              ActionResult, erreurs lisibles
│   │   ├── pwa/                  manifeste, worker, installation
│   │   ├── notifications/        moteur, canaux, push, pastille
│   │   ├── email/                Resend + gabarits
│   │   ├── paiement/             Stripe, webhook, droits
│   │   ├── conformite/           export, suppression, consentements
│   │   ├── ui/                   tokens, .card/.btn, états, icônes
│   │   └── diagnostic/
│   │
│   ├── metier/                   ← TOUT le spécifique de l'application
│   │   ├── actions/
│   │   ├── moteurs/
│   │   └── composants/
│   │
│   ├── app/                      ← routes ; les pages composent socle + métier
│   └── middleware.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── socle/                00001 → 00019 : réservé au socle
│   │   └── metier/               01001 → …    : réservé à l'application
│   └── tests/
│       ├── socle/
│       └── metier/
│
├── scripts/                      test-sql.sh, generer-icones.py, verifier-config.ts
├── tests/  e2e/  emails/
└── .github/workflows/            ci.yml, supabase-migrations.yml
```

**Règle structurante :** `src/socle/` ne doit jamais importer `src/metier/`.
L'inverse est autorisé. Un test de CI vérifie cette direction — c'est ce qui
empêche le socle de se contaminer au fil des applications.

## C.2 Numérotation des migrations

| Plage | Propriétaire | Contenu |
|---|---|---|
| `00001` – `00019` | socle | profils, workspace, RLS, grants, durcissement, storage, notifications, offres, conformité |
| `00020` – `00099` | socle | évolutions futures du socle |
| `01001` – … | application | tout le métier |

Deux plages séparées permettent de **rejouer une mise à jour du socle** sur une
application déjà démarrée sans collision de numéros.

## C.3 Le workspace : abstraction du « foyer »

Presque toute application a un périmètre partagé. Coparentalité Zen l'appelle
foyer ; une application de comptes l'appellera ménage ou espace.

Le socle fournit :

```sql
workspaces          (id, name, owner_id, created_at, updated_at, deleted_at)
workspace_members   (workspace_id, profile_id, role, deleted_at)
```

et les helpers `is_member(uuid)`, `member_role_in(uuid)`, `can_write(uuid)` —
exactement le modèle éprouvé de `00002_rls.sql`, renommé.

Une application **mono-utilisateur** (suivi de comptes personnel) n'utilise pas
moins ce modèle : elle crée un workspace d'une personne à l'inscription et
n'expose jamais l'invitation. Le coût est nul et le jour où le partage est
demandé, la structure existe déjà. Le drapeau `features.workspace.partage`
pilote l'affichage.

## C.4 Interface (étape 5)

Le socle livre :

- **Layout applicatif** : en-tête, navigation basse (≤ 5 entrées, déclarées
  dans `app.config.ts`), zone de contenu, marge de sécurité iOS
  (`viewportFit: 'cover'`, `min-h-dvh`).
- **Tokens** dans `globals.css` alimentés par `app.config.ts` (couleurs,
  rayons, polices).
- **États obligatoires** : `Chargement`, `Erreur` (message + détails
  repliables), `Vide` (titre + texte + action), `SansAcces`.
- **`error.tsx`, `global-error.tsx`, `not-found.tsx`** à la racine de
  `src/app/` — absents de Coparentalité Zen, ajoutés au socle.
- **Accessibilité** : cibles ≥ 44 px, jamais d'information portée par la seule
  couleur, `role="alert"` sur les erreurs, contraste AA vérifié pour tout
  texte.

Règle de composition : une page métier **assemble** des composants du socle.
Elle ne les modifie pas. Si un composant du socle ne convient pas, on ajoute un
paramètre au composant du socle — on ne le duplique pas dans `metier/`.

---

# Partie D — Configuration centralisée (étape 4)

Objectif : adapter le starter à une nouvelle application sans chercher dans
des dizaines de fichiers.

## D.1 Répartition en trois fichiers

| Fichier | Contient | Ne contient jamais |
|---|---|---|
| `app.config.ts` | identité, marque, SEO, légal, PWA, offres | aucun secret |
| `features.config.ts` | interrupteurs booléens | aucune valeur métier |
| `.env.local` / Vercel | **tous** les secrets et URL d'environnement | rien de figé |

Et une quatrième source, volontairement en base : **les montants et les
`price_id` Stripe**, dans la table `plans`. C'est la leçon la plus chère de
Coparentalité Zen (trois prix divergents). Un prix n'est jamais dans un
fichier.

## D.2 `app.config.ts`

```ts
export const app = {
  identite: {
    nom: 'Mon Application',
    nomCourt: 'MonApp',              // ≤ 12 car. — écran d'accueil iOS
    domaine: 'https://mon-app.fr',
    description: 'Une phrase, 140 caractères maximum.',
    langue: 'fr-FR',
    emailSupport: 'contact@mon-app.fr',
  },

  marque: {
    couleurs: {
      primaire: '#4E6381',
      accent:   '#E4A196',
      fond:     '#FCF9F6',
      encre:    '#101B2C',
      // + états : ok / attente / erreur
    },
    polices: { corps: 'Nunito Sans', titres: 'Fraunces' },
    rayons:  { carte: '16px', bouton: '12px' },
    logo:    { source: 'public/branding/symbole.png' }, // source des icônes
  },

  pwa: {
    idDemarrage: '/app/accueil',
    startUrl: '/app/accueil?source=pwa',
    affichage: 'standalone',
    orientation: 'portrait',
    categories: ['productivity'],
    raccourcis: [
      { nom: 'Ajouter', url: '/app/ajouter' },
    ],
  },

  seo: {
    titre: 'Mon Application — baseline',
    ogImage: '/og.png',
  },

  navigation: [
    { libelle: 'Accueil', href: '/app/accueil', icone: 'accueil' },
    // ≤ 5 entrées
  ],

  legal: {
    // valeurs de repli ; les variables d'environnement priment toujours
    formeParDefaut: 'Micro-entreprise',
    versionTextes: '2026-01-01',
    conservation: {
      compteInactif: '3 ans',
      journauxTechniques: '12 mois',
      donneesFacturation: '10 ans',   // obligation comptable
    },
  },

  offres: {
    // Les MONTANTS ne sont pas ici : ils vivent dans la table plans.
    libelleGratuit: 'Découverte',
    librePayant: 'Plus',
    quota: { cle: 'horizon_mois', valeurGratuite: 3 },
  },
} as const;
```

## D.3 `features.config.ts`

```ts
export const features = {
  paiement: false,        // Stripe : routes, écrans, webhook
  premium: false,         // distinction gratuit / payant
  paiementPartage: false, // partage du coût entre membres
  push: true,
  email: true,
  workspacePartage: false,// invitations, rôles multiples
  storage: true,
  sauvegardes: true,
  marketing: false,
  modeDemo: true,         // fonctionner sans Supabase configuré
} as const;
```

**Comportement d'un interrupteur à `false` :** la route n'est pas exposée,
l'écran n'apparaît pas, la migration correspondante n'est pas appliquée. Jamais
un bouton visible qui échoue — c'est la règle d'honnêteté produit.

## D.4 `src/config/env.ts`

Lecture unique et typée des variables d'environnement. Aucun `process.env`
ailleurs dans le code du socle.

```ts
export const env = {
  public: {
    siteUrl:      lire('NEXT_PUBLIC_SITE_URL'),
    supabaseUrl:  lire('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnon: lire('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    vapidPublic:  lire('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
  },
  serveur: {                       // import interdit côté client
    supabaseService: lire('SUPABASE_SERVICE_ROLE_KEY'),
    stripeSecret:    lire('STRIPE_SECRET_KEY'),
    stripeWebhook:   lire('STRIPE_WEBHOOK_SECRET'),
    vapidPrive:      lire('VAPID_PRIVATE_KEY'),
    resend:          lire('RESEND_API_KEY'),
    cronSecret:      lire('CRON_SECRET'),
  },
};
```

Le module serveur porte `import 'server-only'` en tête : une importation depuis
un composant client devient une **erreur de compilation** au lieu d'une
variable vide en production. Coparentalité Zen documente ce risque en
commentaire dans `src/lib/legal.ts` ; le starter le rend impossible.

## D.5 Qui lit quoi

| Consommateur | Source |
|---|---|
| `src/app/layout.tsx` (métadonnées, thème) | `app.identite`, `app.seo`, `app.marque` |
| `src/app/manifest.ts` | `app.identite`, `app.pwa`, `app.marque.couleurs` |
| `globals.css` (tokens `@theme`) | généré depuis `app.marque` par `scripts/generer-theme.ts` |
| `scripts/generer-icones.py` | `app.marque.logo.source` |
| Pages légales | `src/config/legal.ts` (env) + `app.legal` |
| Navigation basse | `app.navigation` |
| `middleware.ts` | `app.identite.domaine`, chemins protégés |
| Écrans d'offre | `app.offres` + table `plans` (montants) |
| Routes Stripe / Push / e-mail | `features` puis `env.serveur` |
| Gabarits d'e-mail | `app.identite` (nom, domaine, support) |

## D.6 Vérificateur de configuration

`scripts/verifier-config.ts`, exécuté par `npm run verify` et par la CI :

1. aucun `process.env` hors de `src/config/env.ts` ;
2. aucune couleur littérale (`#RRGGBB`) hors de `app.config.ts` et du thème
   généré ;
3. aucun montant en euros ou en centimes dans `src/` ;
4. `app.identite.nomCourt` ≤ 12 caractères ;
5. toute fonctionnalité active a ses variables d'environnement présentes ;
6. `src/socle/` n'importe jamais `src/metier/` ;
7. aucune valeur d'attente (« À compléter », « votre-domaine ») dans une
   configuration de production.

Ce script est le gardien de toute l'architecture. Sans lui, la centralisation
se dégrade en trois semaines.
