# Release Candidate — corrections autonomes

## Corrections appliquées

- suppression de `.env.production` de l’archive et durcissement de `.gitignore` ;
- sécurisation de `/api/rappels` : le cron est le seul à traiter tous les foyers ;
- ajout d’un `POST` authentifié limité au foyer du membre ;
- programmation immédiate des rappels après création d’un rendez-vous ;
- contrôle des erreurs lors du chargement du rythme et des exceptions ;
- exclusion du profil provisoire dans le choix de l’accompagnant ;
- correction du libellé trompeur « début demain » pour les délais configurables ;
- suppression d’imports inutilisés dans la page Rendez-vous.

## Vérifications exécutées

- `npm ci` tenté : impossible dans cet environnement car le miroir npm interne ne fournit pas `why-is-node-running@2.3.0` ;
- contrôle des fichiers sensibles et des variables d’environnement ;
- inspection des migrations 00026 à 00029 ;
- contrôle statique des routes Stripe, rappels, vacances, Storage et contexte foyer ;
- contrôle de la présence de `Suspense` autour des usages de `useSearchParams`.

## À exécuter automatiquement après copie sur GitHub

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:sql
```
