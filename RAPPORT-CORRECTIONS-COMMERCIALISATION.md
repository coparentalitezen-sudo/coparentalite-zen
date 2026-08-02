# Corrections de préparation commerciale

Base : archive `coparentalite-zen-develop-2.zip` (dernière version Claude).

## Corrections intégrées

- pages publiques `/confidentialite`, `/cgu`, `/mentions-legales`, `/contact` ;
- liens juridiques actifs dans le pied de page ;
- acceptation explicite et versionnée des CGU et de la politique à l'inscription ;
- migration `00037_commercial_readiness.sql` pour journaliser les consentements ;
- variables publiques d'identité légale documentées dans `.env.example` ;
- en-têtes HTTP de sécurité et CSP dans `next.config.mjs` ;
- suppression des assertions `parent1!` ;
- historique financier chargé par pages de 200 sans troncature silencieuse ;
- encart d'installation intégré à la page publique, à l'accueil connecté et aux paramètres ;
- Checkout Stripe renforcé (référence foyer, adresse de facturation, création client pour paiement unique) ;
- gestion des événements `invoice.paid` et `invoice.payment_failed` ;
- diagnostic indiquant le mode Stripe `test` ou `live` ;
- guide complet `STRIPE-MISE-EN-SERVICE.md`.

## Contrôles exécutés

- analyse syntaxique de tous les fichiers TypeScript/TSX : réussie ;
- validation de `package.json` et `package-lock.json` : réussie ;
- validation syntaxique de `scripts/test-sql.sh` : réussie ;
- recherche de secrets Stripe réels et de fichier `.env.production` : aucun secret réel trouvé, `.env.production` absent ;
- vérification de l'absence des assertions `parent1!` et des limites 50/100 dans les historiques financiers : réussie.

## Contrôle non exécutable dans cet environnement

`npm ci` échoue sur le miroir npm interne, qui ne fournit pas
`why-is-node-running@2.3.0`. Le build complet, Vitest et Playwright doivent être
confirmés par GitHub Actions ou Vercel après le push.

## Actions obligatoires avant encaissement réel

1. Appliquer la migration `00037_commercial_readiness.sql`.
2. Compléter dans Vercel les variables `NEXT_PUBLIC_LEGAL_*` et l'e-mail support.
3. Suivre `STRIPE-MISE-EN-SERVICE.md` : clés live, tarifs `price_...`, webhook et portail.
4. Vérifier que `/api/diagnostic` indique `stripe_mode: live` et aucune conséquence Stripe.
5. Effectuer un paiement réel de faible montant puis un remboursement depuis Stripe.
6. Faire relire les textes juridiques par un professionnel avant ouverture publique.
