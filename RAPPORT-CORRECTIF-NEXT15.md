# Correctif Next.js 15 — Suspense

Fichiers corrigés :

- `src/app/app/planning/page.tsx`
- `src/app/app/evenements/page.tsx`

Les composants qui appellent `useSearchParams()` sont désormais rendus à
l'intérieur d'une frontière React `Suspense`. La page Offre disposait déjà de
cette protection.

Contrôles exécutés :

- analyse syntaxique de tous les fichiers TypeScript/TSX avec TypeScript 5.8 ;
- vérification de toutes les utilisations de `useSearchParams()` ;
- validation JSON de `package.json` et `package-lock.json` ;
- validation syntaxique de `scripts/test-sql.sh` ;
- nettoyage des artefacts temporaires.

`npm ci` n'a pas pu aboutir dans l'environnement de préparation car son
registre npm interne ne contient pas `why-is-node-running@2.3.0`. Le ZIP ne
modifie ni `package.json` ni `package-lock.json`; GitHub Actions et Vercel
utiliseront leur registre normal.
