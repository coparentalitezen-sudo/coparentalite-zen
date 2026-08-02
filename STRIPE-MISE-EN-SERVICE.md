# Mise en service des paiements Stripe

Le code d’encaissement est branché sur Stripe Checkout et le portail client.
Aucune donnée bancaire ne transite par l’application.

## 1. Créer les tarifs dans Stripe

Dans Stripe en mode **Live**, créez le produit « Zen Plus » avec un tarif mensuel
et un tarif annuel. Copiez les identifiants `price_...`.

## 2. Renseigner Supabase

Exécutez dans le SQL Editor, en remplaçant les identifiants :

```sql
update public.plans
set stripe_price_id_monthly = 'price_MENSUEL_LIVE',
    stripe_price_id_yearly  = 'price_ANNUEL_LIVE'
where id = 'premium';
```

Les extensions ponctuelles utilisent déjà le prix stocké en base. Pour les
rattacher à un tarif Stripe existant :

```sql
update public.plan_extensions
set stripe_price_id = 'price_EXTENSION_LIVE'
where id = 'IDENTIFIANT_EXTENSION';
```

## 3. Variables Vercel Production

- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `NEXT_PUBLIC_SITE_URL=https://votre-domaine.fr`

## 4. Webhook Stripe

Créez l’endpoint :

`https://votre-domaine.fr/api/stripe/webhook`

Événements à cocher :

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## 5. Portail client

Activez le portail client Stripe et autorisez au minimum :

- mise à jour du moyen de paiement ;
- consultation des factures ;
- résiliation à la fin de la période.

## 6. Test avant ouverture

1. Utilisez d’abord `sk_test_...` et les tarifs test.
2. Effectuez un abonnement complet avec la carte test Stripe.
3. Vérifiez l’activation dans la table `subscriptions`.
4. Testez le portail, la résiliation et un paiement échoué.
5. Passez ensuite aux clés et tarifs Live.

La route `/api/diagnostic` indique sans révéler les secrets si Stripe est en
mode `test` ou `live`.
