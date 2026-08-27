# 03 — Git, GitHub et Vercel

Étapes 2 et 11 du mode opératoire. Ce document contient plusieurs corrections
d'erreurs réellement rencontrées sur Coparentalité Zen : elles sont signalées
par ⚠.

---

## 1. Dépôt et `.gitignore`

```bash
git init
git branch -M main
gh repo create mon-app --private --source=. --remote=origin
```

`.gitignore` minimal indispensable :

```
node_modules/
.next/
out/
.env
.env.local
.env*.local
.vercel
*.tsbuildinfo
next-env.d.ts
test-results/
playwright-report/
.DS_Store
```

**Aucun secret dans Git, jamais.** Un secret poussé une fois est compromis même
après suppression du commit : l'historique le conserve et GitHub l'a indexé.
Le seul remède est la **révocation** de la clé chez son émetteur.

Sécurité à activer immédiatement dans les paramètres du dépôt : *Secret
scanning* et *Push protection*.

## 2. Stratégie de branches

Deux branches, et la règle non négociable qui va avec :

| Branche | Rôle | Déploiement |
|---|---|---|
| `develop` | **branche de production** | Vercel Production |
| `main` | référence stable / historique | aucun |
| `feat/…`, `fix/…` | travail en cours | Vercel Preview |

⚠ **La branche Production de Vercel n'est pas forcément `main`.** Sur
Coparentalité Zen c'est `develop`. Tout push sur `develop` déclenche un
déploiement en production immédiat. Le starter doit **écrire cette information
en tête de `AGENTS.md`** : sa méconnaissance a produit des diagnostics faux.

Recommandation pour les nouvelles applications : garder `develop` comme
branche de production (cohérence entre projets), ou choisir `main` — mais
alors le déclarer partout et aligner la CI.

## 3. Commits

```
type: sujet à l'infinitif, en français, sans point final

Pourquoi ce changement était nécessaire, en deux ou trois lignes.
```

Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `security`.

⚠ **Vercel ignore silencieusement les commits dont l'auteur Git est inconnu du
compte GitHub.** Une heure a été perdue sur Coparentalité Zen à croire
l'application figée. Configurer une fois par machine et par agent :

```bash
git config user.name  "<utilisateur-github>"
git config user.email "<id>+<utilisateur>@users.noreply.github.com"
```

## 4. Pull requests et fusion

```bash
git switch -c feat/import-releves
# … travail …
npm run verify && npm run test:sql
git push -u origin feat/import-releves
gh pr create --base develop --fill
```

Protection de branche sur `develop` :

- [ ] pull request obligatoire
- [ ] statut CI `verdict` requis et vert
- [ ] branche à jour avant fusion
- [ ] force-push interdit
- [ ] suppression interdite

**Ordre de fusion quand une migration est en jeu :**

1. appliquer la migration en Supabase (workflow manuel, mode `verification`
   puis `appliquer`) ;
2. **ensuite seulement** fusionner le code.

L'inverse produit un code déployé qui appelle une fonction inexistante.
⚠ Corollaire : une migration SQL **ne change pas le hash de version affiché
par l'application**. Ne pas confondre les deux en cherchant pourquoi « rien
n'a changé ».

## 5. Intégration continue

`.github/workflows/ci.yml`, deux jobs parallèles et un verdict :

| Job | Contenu |
|---|---|
| `application` | `npm ci`, `typecheck`, `test`, `build`, Playwright (Chromium) |
| `base_de_donnees` | `scripts/test-sql.sh` sur un service `postgres:16` |
| `verdict` | échoue si l'un des deux a échoué — c'est le statut à exiger |

⚠ **Défaut constaté sur Coparentalité Zen à corriger dans le starter :** la CI
se déclenche sur `main` (`on: push/pull_request: branches: [main]`) alors que
la production part de `develop`. Résultat : la branche qui déploie n'est pas
celle qui est vérifiée. Le starter déclenche la CI sur les **deux** branches :

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_dispatch:
```

Variables factices pour le build en CI (jamais de vrais secrets) :

```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: https://exemple.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY: cle-publique-factice-pour-la-construction
```

C'est le mode démonstration du socle qui rend cela possible.

---

## 6. Vercel

### 6.1 Création et liaison

1. Vercel → *Add New Project* → importer le dépôt GitHub.
2. Framework : Next.js (détecté). Aucune commande à surcharger.
3. **Settings → Git → Production Branch : `develop`.** À faire tout de suite
   et à noter dans `AGENTS.md`.

### 6.2 Variables d'environnement

Trois portées : *Production*, *Preview*, *Development*.

| Variable | Prod | Preview | Note |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | ✔ | même projet ou projet de test |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔ | ✔ | publique |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | ✔ | secrète |
| `STRIPE_SECRET_KEY` | clé **live** | clé **test** | ne jamais mélanger |
| `STRIPE_WEBHOOK_SECRET` | endpoint live | endpoint test | un secret par endpoint |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | ✔ | ✔ | identiques partout |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✔ | ✔ | domaine vérifié |
| `CRON_SECRET` | ✔ | — | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | domaine réel | laisser vide | `VERCEL_URL` sert de repli |
| Identité légale (`LEGAL_*`) | ✔ | ✔ | |

⚠ **Une variable ajoutée n'existe qu'au déploiement suivant.** Modifier une
variable ne redéploie rien : il faut *Redeploy*, et sans « Use existing build
cache » si le comportement dépend de la valeur au moment du build.

⚠ **Ne jamais préfixer un secret par `NEXT_PUBLIC_`.** Le préfixe inscrit la
valeur dans le paquet JavaScript envoyé au navigateur. Une clé
`service_role` ainsi exposée donne un accès total à la base, RLS contournée.

### 6.3 Domaine

1. Settings → Domains → ajouter le domaine et son `www`.
2. Enregistrements DNS chez le registraire, certificat automatique.
3. Renseigner `NEXT_PUBLIC_SITE_URL` avec le domaine définitif.
4. Rediriger les anciens hôtes : le middleware du socle lit `HOTES_OBSOLETES`
   (liste d'hôtes nommément désignés).

⚠ Pourquoi cette redirection existe : une PWA installée depuis une ancienne
adresse y reste **indéfiniment** — son icône pointe sur l'hôte d'origine, et
elle continue de produire des liens vers un domaine abandonné.
⚠ Redirection en **307**, pas 308 : une permanente est mise en cache par le
navigateur et devient très pénible à corriger.
⚠ Ne jamais rediriger par motif générique `*.vercel.app` : les déploiements de
prévisualisation utilisent ces adresses et seraient détournés.

### 6.4 Tâches planifiées

`vercel.json` :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/taches/rappels", "schedule": "0 3 * * *" }
  ]
}
```

⚠ **L'offre Hobby n'autorise qu'une exécution par jour et par tâche.** Un
horaire plus fréquent (`*/15 * * * *`) fait **échouer la construction
silencieusement** : aucun déploiement n'est créé et rien n'apparaît dans la
liste. Cela a bloqué les déploiements de Coparentalité Zen plusieurs heures.

Conséquence de conception : enchaîner plusieurs traitements dans une même
exécution plutôt que multiplier les créneaux. Coparentalité Zen fait suivre
l'acheminement Push de la programmation des rappels.

⚠ `vercel.json` n'accepte que `path` et `schedule` dans une entrée de cron :
tout champ supplémentaire est rejeté par le schéma.

Protection des routes planifiées : Vercel envoie `Authorization: Bearer
$CRON_SECRET`. La route refuse tout appel sans ce jeton.

### 6.5 Logs et diagnostic

| Besoin | Où |
|---|---|
| Erreurs d'exécution | Vercel → Deployments → *Runtime Logs* |
| Échec de construction | Deployments → *Building* |
| Résultat des crons | Deployments → *Cron Jobs* |
| Variables présentes | `/api/diagnostic` (noms seulement, jamais les valeurs) |
| Version réellement servie | hash affiché dans l'en-tête applicatif |

⚠ **Ne jamais annoncer un déploiement sans l'avoir constaté.** Le hash affiché
dans l'application est la seule preuve. « J'ai poussé » n'est pas « c'est
déployé ».

### 6.6 Revenir en arrière

Deployments → déploiement sain → *Promote to Production*. Instantané, sans
reconstruction.

⚠ Un retour de code **ne défait pas une migration**. Si la version précédente
ne supporte pas le nouveau schéma, elle échouera. C'est la raison pour
laquelle toute migration doit être **rétro-compatible d'une version** :
ajouter une colonne avant de l'utiliser, supprimer l'ancienne un déploiement
plus tard.

### 6.7 Analytics

`@vercel/analytics` est dans le socle. Les *custom events* exigent l'offre
Pro — à noter si le suivi fin est nécessaire.
