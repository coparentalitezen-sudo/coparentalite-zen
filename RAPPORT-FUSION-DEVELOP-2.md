# Fusion commerciale sur la dernière version Claude

Base utilisée : `coparentalite-zen-develop-2.zip`.

## Nouveautés Claude préservées

- migration `00036_jour_changement.sql` conservée ;
- derniers changements du planning, des rythmes, des exceptions et des rappels conservés ;
- aucun fichier de la nouvelle base n'a été remplacé globalement par une ancienne version.

## Corrections réappliquées

- pages publiques : confidentialité, CGU/CGV, mentions légales et contact ;
- liens juridiques actifs dans le pied de page ;
- acceptation explicite et versionnée des CGU et de la politique à l'inscription ;
- migration `00037_commercial_readiness.sql` pour journaliser les consentements ;
- variables d'identité légale dans `.env.example` ;
- en-têtes HTTP de sécurité et CSP ;
- encart d'installation sur la page publique ;
- suppression de l'assertion dangereuse `parent1!` ;
- chargement paginé de l'historique des dépenses et remboursements ;
- Checkout Stripe renforcé ;
- gestion des événements `invoice.paid` et `invoice.payment_failed` ;
- diagnostic du mode Stripe test/live et de la complétude juridique ;
- guide `STRIPE-MISE-EN-SERVICE.md`.

## Vérifications réalisées

- syntaxe TypeScript/TSX de tous les fichiers : valide via TypeScript `transpileModule` ;
- syntaxe `next.config.mjs` : valide ;
- `package.json` et `package-lock.json` : JSON valides ;
- `scripts/test-sql.sh` : syntaxe shell valide ;
- migration Claude `00036_jour_changement.sql` et nouvelle migration `00037_commercial_readiness.sql` toutes deux présentes ;
- aucun fichier `.env.production` dans l'archive ;
- aucune assertion `parent1!` restante.

## Limite de contrôle

`npm ci` n'a pas pu terminer car le miroir npm de l'environnement ne fournit pas `why-is-node-running@2.3.0`. Le build Next.js, Vitest et Playwright doivent être confirmés par GitHub Actions ou Vercel après le push.

## Avant encaissement réel

1. appliquer `00037_commercial_readiness.sql` ;
2. compléter les variables `NEXT_PUBLIC_LEGAL_*` dans Vercel ;
3. configurer Stripe en mode Test puis Live selon `STRIPE-MISE-EN-SERVICE.md` ;
4. vérifier le webhook et le portail client ;
5. effectuer un paiement test complet avant tout paiement réel.
