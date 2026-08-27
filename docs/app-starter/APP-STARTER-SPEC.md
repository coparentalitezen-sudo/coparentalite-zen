# APP-STARTER-SPEC — spécification du dépôt générique

Document le plus opérationnel du dossier. Il décrit **exactement ce qu'il
faudra extraire, généraliser ou recréer** pour transformer cette méthode en un
véritable dépôt template indépendant.

Tant que ce dépôt n'existe pas, ce fichier tient lieu de plan de fabrication.

⚠ **Aucune de ces opérations ne modifie Coparentalité Zen.** Le starter se
construit dans un dépôt **neuf**, par recopie et généralisation. Coparentalité
Zen ne dépendra jamais du starter et n'a pas à être migré.

---

## 1. Identité du dépôt

| | |
|---|---|
| Nom | `app-starter` |
| Visibilité | privé, marqué **Template repository** |
| Branches | `main` (référence) et `develop` (production des applications filles) |
| Licence | privée |
| Version | étiquettes `v1.0.0`, `v1.1.0`… — une application fille note la version dont elle est issue |

---

## 2. Inventaire d'extraction

Trois traitements possibles :

| Code | Signification |
|---|---|
| **C** | Copie quasi conforme (renommage éventuel) |
| **G** | Généralisation nécessaire (retirer le métier, paramétrer) |
| **N** | À écrire, n'existe pas dans Coparentalité Zen |

### 2.1 Racine et outillage

| Cible | Source | Trait. | Travail |
|---|---|---|---|
| `package.json` | idem | G | retirer `pngjs`, `jpeg-js` (marketing) ; ajouter ESLint/Prettier ; `name` neutre |
| `tsconfig.json` | idem | C | — |
| `next.config.mjs` | idem | G | CSP construite depuis `features` ; retirer la réécriture spécifique |
| `vitest.config.ts` | idem | C | conserver l'alias `@` |
| `playwright.config.ts` | idem | C | — |
| `postcss.config.mjs` | idem | C | — |
| `vercel.json` | idem | G | crons du socle uniquement, commentaire sur la limite Hobby |
| `.gitignore` | idem | C | — |
| `.env.example` | idem | G | retirer Pinterest/Meta ; conserver la pédagogie des commentaires |
| `eslint.config.mjs` | — | **N** | à écrire |
| `.prettierrc` | — | **N** | à écrire |
| `app.config.ts` | — | **N** | voir `01-ARCHITECTURE.md` § D.2 |
| `features.config.ts` | — | **N** | voir § D.3 |

### 2.2 Configuration

| Cible | Source | Trait. | Travail |
|---|---|---|---|
| `src/config/env.ts` | `process.env` dispersés | **N** | centralisation ; module serveur avec `server-only` |
| `src/config/legal.ts` | `src/lib/legal.ts` | G | retirer les valeurs de repli « Coparentalité Zen » ; conserver `premiere()`, `estUneAdresse()`, `sirenPlausible()`, `identiteComplete()` |
| `src/config/index.ts` | — | **N** | relecture + validation au démarrage |

### 2.3 Socle applicatif

| Cible | Source | Trait. | Travail |
|---|---|---|---|
| `socle/supabase/client.ts` | idem | C | — |
| `socle/supabase/server.ts` | idem | C | ajouter `server-only` |
| `src/middleware.ts` | idem | G | chemins protégés et hôtes obsolètes lus en configuration |
| `socle/donnees/resultat.ts` | `lib/actions/core.ts` | G | remplacer la regex de mots métier par la convention `APP:` |
| `socle/donnees/montants.ts` | `lib/money.ts` | G | garder formatage et plus fort reste ; **retirer** les formulations métier |
| `socle/donnees/fichiers.ts` | `lib/files.ts` | G | seau et préfixe paramétrés |
| `socle/donnees/executer.ts` | — | **N** | enrobage Supabase forçant la lecture de `error` |
| `socle/pwa/installation.ts` | `lib/installation.ts` | C | fonctions pures, déjà génériques |
| `socle/pwa/service-worker.tsx` | `components/service-worker.tsx` | C | — |
| `src/app/sw.js/route.ts` | idem | G | préfixe de cache depuis `app.config` |
| `src/app/manifest.ts` | idem | G | intégralement lu depuis `app.config` |
| `socle/notifications/*` | `lib/push.ts`, `pastille.ts` | C | — |
| `socle/email/*` | `lib/email.ts`, `emails/` | G | gabarits neutres ; nom d'application en variable |
| `socle/paiement/stripe.ts` | `lib/stripe.ts` | G | retirer les libellés « Coparentalité Zen » |
| `socle/paiement/idempotence.ts` | `lib/payment-idempotency.ts` | C | — |
| `socle/paiement/droits.ts` | `lib/premium-horizon.ts` | G | quota générique paramétré |
| `socle/conformite/*` | `api/mes-donnees`, `api/supprimer-compte` | G | liste de tables déclarée par l'application |
| `socle/ui/etats.tsx` | `components/etats.tsx` | G | `SansFoyer` → `SansAcces` |
| `socle/ui/icons.tsx` | `components/icons.tsx` | G | conserver les glyphes universels, retirer les catégories métier |
| `socle/ui/legal-page.tsx` | `components/legal-page.tsx` | C | — |
| `socle/ui/layout-app.tsx` | `app/app/layout.tsx` | G | navigation lue en configuration |
| `socle/diagnostic/route.ts` | `api/diagnostic/route.ts` | G | liste de variables paramétrée ; **conserver `roleDeLaCle()` et `reponseJSON()`** |
| `src/app/error.tsx` | — | **N** | à écrire |
| `src/app/global-error.tsx` | — | **N** | à écrire |
| `src/app/not-found.tsx` | — | **N** | à écrire |
| `socle/ui/liste-paginee.tsx` | — | **N** | révélé par l'exercice du § 12 |
| `socle/ui/partager.tsx` | logique de `app/foyer/page.tsx` | G | partage natif → presse-papiers → sélection manuelle |

### 2.4 Migrations du socle

Réécriture propre, en s'inspirant fortement des originales.

| Cible | Inspirée de | Trait. | Contenu |
|---|---|---|---|
| `00001_socle_schema.sql` | `00001` (extraits) | G | `profiles`, `user_settings`, `workspaces`, `workspace_members`, `audit_logs`, `consent_logs`, `set_updated_at`, énumérés génériques |
| `00002_socle_rls.sql` | `00002` | G | helpers renommés `workspace`, activation en boucle, policies du socle |
| `00003_socle_grants.sql` | `00007` | C | grants + `alter default privileges` |
| `00004_socle_fonctions.sql` | `00004` | G | `handle_new_user`, `create_workspace`, invitations, `export_my_data`, `delete_my_account` |
| `00005_socle_storage.sql` | `00005` | G | seaux paramétrés, `workspace_from_path` |
| `00006_socle_durcissement.sql` | `00026` | G | `revoke`/`grant` explicites |
| `00007_socle_notifications.sql` | `00025`,`00028`,`00029`,`00030`,`00040` | G | types, canaux, préférences, livraisons, abonnements, **index unique d'idempotence** |
| `00008_socle_offres.sql` | `00015`,`00016`,`00037` | G | `plans`, `plan_extensions`, `subscriptions`, `billing_events`, `grille_tarifaire()`, **`workspace_entitlement()` à trois états** |
| `00009_socle_sauvegardes.sql` | `00039` | C | seau privé sans policy |

⚠ Correction à intégrer dès l'extraction : la **période de grâce doit être
lue** par `workspace_entitlement()` — le défaut de Coparentalité Zen ne doit
pas être recopié.

### 2.5 Tests et CI

| Cible | Source | Trait. | Travail |
|---|---|---|---|
| `scripts/test-sql.sh` | idem | C | **copie fidèle** : simulation `auth`, `service_role`, `pgcrypto` dans `extensions`, clone par suite |
| `supabase/tests/socle/*` | `rls_isolation_test`, `service_role_test`, `suppression_compte_test`, `premium_test`, `notifications_test`, `rappels_test` | G | dépouiller du métier |
| `tests/*` | `money`, `files`, `installation`, `legal`, `payment-idempotency`, `premium`, `push-pastille` | G | adapter aux modules généralisés |
| `e2e/socle.spec.ts` | `e2e/parcours.spec.ts` | G | pages publiques, garde, manifeste, worker ; **conserver le saut motivé** |
| `.github/workflows/ci.yml` | idem | G | déclenchement sur `main` **et** `develop` ; + contrôles marqueurs de conflit, suites orphelines, `verifier:config` |
| `.github/workflows/supabase-migrations.yml` | idem | C | — |
| `scripts/verifier-config.ts` | — | **N** | les sept contrôles de `01-ARCHITECTURE.md` § D.6 |
| `scripts/preparer-session.sh` | protocole de `AGENTS.md` | **N** | fetch/reset/`npm ci`, auteur Git, écart de commits |
| `scripts/generer-theme.ts` | — | **N** | `globals.css` depuis `app.config.marque` |
| `scripts/generer-icones.py` | idem | C | **copie fidèle** : recadrage, marges 80 % / 54 %, contrôle des bords |

### 2.6 Documentation

| Cible | Source | Trait. |
|---|---|---|
| `docs/app-starter/*` | ce dossier | C |
| `AGENTS.md` | idem | G — gabarit vidé du métier, protocole de session conservé |
| `CONTRIBUER.md` | idem | G |
| `README.md` | — | **N** — démarrage rapide en 10 lignes |
| `juridique/GABARITS/*` | `juridique/` | G — emplacements `[À COMPLÉTER]`, avertissement en tête |
| `docs/PROCEDURE-VIOLATION.md` | — | **N** |

### 2.7 Ce qui n'entre jamais dans le starter

`src/lib/marketing/**` · `custody.ts` · `rythmes.ts` · `calendrier-officiel.ts`
· `quiz.ts` · `serenite.ts` · `rapport.ts` · `configuration.ts` ·
`paiement-partage.ts` · `partage-invitation.ts` · `intention-achat.ts` ·
toutes les migrations métier · tous les écrans de `/app/*` sauf le layout ·
`public/branding/*` et les icônes générées · les rapports d'audit
(`RAPPORT-*.md`) · `emails/emails.json` (contenu, le gabarit reste).

---

## 3. Chantiers à écrire (résumé)

Par ordre de priorité :

| # | Chantier | Effort | Pourquoi |
|---|---|---|---|
| 1 | `app.config.ts` + `features.config.ts` + `src/config/` | moyen | sans lui, il n'y a pas de starter |
| 2 | `scripts/verifier-config.ts` | moyen | gardien de toute l'architecture |
| 3 | Migrations socle `00001`–`00009` | élevé | le cœur, et le plus délicat |
| 4 | `workspace_entitlement()` à trois états + test | faible | corrige un défaut connu |
| 5 | `error.tsx` / `global-error.tsx` / `not-found.tsx` | faible | manque avéré |
| 6 | ESLint + Prettier | faible | manque avéré |
| 7 | `socle/donnees/executer.ts` | faible | supprime la classe d'erreurs « faux succès » |
| 8 | `scripts/generer-theme.ts` | faible | permet la centralisation des couleurs |
| 9 | `scripts/preparer-session.sh` | faible | protocole rendu exécutable |
| 10 | `socle/ui/liste-paginee.tsx` | moyen | révélé par l'exercice du § 12 |
| 11 | Module d'import de fichiers générique | élevé | **v2** — révélé par l'exercice du § 12 |
| 12 | Briques de graphiques | moyen | **v2** — à arbitrer (SVG maison vs dépendance) |

---

## 4. Critère de recette du starter

Le starter est utilisable le jour où **toutes** ces affirmations sont vraies :

- [ ] `gh repo create` depuis le template, puis `npm ci && npm run dev` :
      l'application démarre en mode démonstration
- [ ] modifier `app.config.ts` change nom, couleurs, icônes, manifeste, SEO et
      navigation **sans toucher à un autre fichier**
- [ ] `features.paiement: false` fait disparaître routes, écrans, entrées CSP
      et migration Stripe
- [ ] `npm run verifier:config` détecte : un `process.env` égaré, un montant en
      dur, une couleur littérale, une valeur d'attente, un import
      `socle → metier`
- [ ] `npm run test:sql` applique les 9 migrations du socle et passe toutes
      les assertions d'isolation
- [ ] `npm run verify` passe sur un projet vierge
- [ ] la CI est verte au premier commit, sur `main` **et** `develop`
- [ ] `grep -ri "coparent\|foyer\|garde\|enfant" src/ supabase/` ne renvoie
      **rien**
- [ ] une inscription réelle crée profil + workspace + ligne de consentement
- [ ] export et suppression fonctionnent sur un compte réel
- [ ] l'application s'installe sur iPhone avec une icône non rognée
- [ ] un paiement Stripe Test crédite le droit ; la période de grâce fonctionne

---

## 5. Cycle de vie

### Versionner

Étiquettes sémantiques. Chaque application fille note dans son `AGENTS.md` la
version du starter dont elle est issue.

### Faire remonter les enseignements

Quand une application découvre un défaut du socle :

1. corriger **d'abord dans le starter** ;
2. étiqueter une nouvelle version ;
3. reporter le correctif dans les applications concernées ;
4. ajouter le test qui empêche la récidive ;
5. si la leçon est structurelle, l'ajouter à
   `13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md`.

Corriger uniquement dans l'application fille garantit de rencontrer le même
défaut dans la suivante.

### Reporter une mise à jour du socle

Les plages de numérotation séparées (socle `000xx`, métier `01xxx`) permettent
d'appliquer les nouvelles migrations du socle sans collision. Le report reste
manuel et volontaire : une application en production ne se met pas à jour
« parce qu'une version existe ».

### Ce qui ne doit jamais arriver

- une application fille qui modifie `src/socle/` pour son besoin propre ;
- une notion métier qui remonte dans le socle « parce que deux applications
  l'utilisent » — deux n'est pas un motif suffisant, il faut trois usages et
  une abstraction claire ;
- un starter qui grossit sans que rien n'en soit jamais retiré.

---

## 6. Estimation

Fourchette indicative, pour une personne seule travaillant sur le sujet.

| Lot | Charge |
|---|---|
| Extraction et généralisation du code | 3 à 5 jours |
| Migrations du socle et leurs tests | 3 à 4 jours |
| Configuration centralisée + vérificateur | 2 jours |
| Manques à écrire (lint, erreurs, thème, session) | 1 à 2 jours |
| Recette complète (les 12 critères du § 4) | 2 jours |
| **Total** | **11 à 15 jours** |

À mettre en regard : l'infrastructure de Coparentalité Zen a demandé plusieurs
mois. Le retour sur investissement est atteint dès la **première** application
suivante — et la seconde ne coûte plus que son métier.

⚠ Recommandation de calendrier : **ne pas commencer l'extraction avant la mise
en production de Coparentalité Zen.** Deux chantiers simultanés sur un même
socle, par une seule personne, est précisément la situation qui a produit les
conflits documentés au § 1.4 du retour d'expérience.
