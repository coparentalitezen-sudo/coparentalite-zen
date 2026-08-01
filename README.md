# Coparentalité Zen

Application Next.js/Supabase destinée aux parents séparés : planning de garde,
vacances et exceptions, dépenses partagées, remboursements, justificatifs,
notifications internes et offre Zen Plus.

## Installation locale

```bash
npm ci
npm run dev
```

Copier `.env.example` vers `.env.local` et renseigner les variables nécessaires.
Les secrets (`SUPABASE_SERVICE_ROLE_KEY`, clés Stripe et `CRON_SECRET`) ne doivent
jamais être préfixés par `NEXT_PUBLIC_` ni être commités.

## Vérifications

```bash
npm run typecheck
npm test
npm run build
npm run test:sql
npm run test:e2e
```

Les tests E2E publics contrôlent l'installation PWA, les routes publiques et les
gardes d'authentification. Les parcours authentifiés complets nécessitent un
environnement Supabase de test isolé ; ils ne doivent pas être déclarés validés
s'ils n'ont pas réellement été exécutés.

## Base de données

Les migrations sont dans `supabase/migrations/` et doivent être appliquées dans
l'ordre. Le fichier `supabase-setup-complet.sql` est une archive historique et ne doit pas être exécuté. Toujours versionner une modification SQL avant de l'appliquer à la
production afin que le dépôt et la base restent synchronisés.

## Déploiement

Vercel déploie le code Next.js. Avant toute mise en production :

1. appliquer les migrations rétrocompatibles ;
2. exécuter les tests ;
3. déployer le code ;
4. vérifier `/api/diagnostic`, les journaux Vercel et le dernier commit affiché.

## Statut produit

Le produit possède les principaux flux métier. Avant une commercialisation à
grande échelle, maintenir un environnement de staging et exécuter de vrais
parcours authentifiés de bout en bout, notamment invitation du second parent,
planning, dépenses, justificatifs et Stripe en mode test.
