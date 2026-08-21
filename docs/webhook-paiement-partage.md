# Branchement du webhook Stripe pour le paiement partagé

Document préalable. Il décrit ce que `src/app/api/stripe/webhook/route.ts`
devra faire — le webhook n'est **pas encore modifié**.

## Le principe, en une phrase

Un événement Stripe concernant une moitié ne dit rien de l'état du foyer.
Il met à jour **une part**, puis une agrégation relit **les deux** et décide
seule du droit d'accès.

## Ce qu'il ne faut surtout pas faire

Router les deux abonnements Stripe d'un partage vers `upsert_subscription`
comme s'il s'agissait chacun de l'abonnement du foyer. Deux effets, tous deux
graves :

- le second événement écrase le premier, et `subscriptions.stripe_subscription_id`
  finit par désigner arbitrairement l'une des deux moitiés ;
- un `invoice.payment_failed` sur une seule moitié fait basculer le foyer
  entier en `past_due`, alors que l'autre part est à jour et que la période de
  grâce n'a pas commencé.

C'est le comportement actuel du webhook. Il reste correct pour le paiement
intégral et ne doit pas changer pour lui.

## Le chemin retenu

```
événement Stripe
      │
      ├─ objet sans stripe_subscription_id  ────────────►  traitement actuel
      │
      └─ stripe_subscription_id présent
               │
               ▼
      maj_contribution_stripe(id_stripe, statut, fin_periode)
               │
               ├─ renvoie 'hors_partage'  ──►  upsert_subscription (chemin intégral, inchangé)
               │
               └─ met à jour LA part concernée
                        │
                        ▼
                 recalculer_partage(foyer)
                        │
                        ▼
                 une seule écriture sur subscriptions,
                 déduite de l'état agrégé des deux parts
```

L'appelant ne décide de rien. Il transmet le statut Stripe traduit et laisse
la base trancher. `maj_contribution_stripe` renvoie l'état agrégé, que le
webhook peut journaliser mais ne doit pas réinterpréter.

## Table de correspondance des événements

| Événement Stripe | Statut de la part | Remarque |
|---|---|---|
| `checkout.session.completed` (mode `setup`) | `ready_to_charge` | empreinte prise, aucun débit |
| `customer.subscription.created` | `processing` | abonnement créé côté serveur |
| `invoice.paid` | `paid` | seul statut qui ouvre un droit |
| `invoice.payment_failed` | `past_due` | déclenche la grâce, jamais la coupure |
| `customer.subscription.deleted` | `canceled` | |
| `setup_intent.setup_failed` | `failed` | |

Aucune autre transition n'ouvre l'accès. En particulier, l'acceptation du
second parent ne produit aucun statut `paid` : elle fait passer sa part en
`awaiting_second_setup`, rien de plus.

## Règles d'agrégation

Elles vivent dans `recalculer_partage`, pas dans le webhook :

- **toutes** les parts attendues présentes **et** `paid` → `subscriptions` en
  `active`, `arrangement_id` renseigné ;
- une part en `past_due` → `subscriptions` en `past_due` et `grace_until`
  posée, l'accès reste ouvert ;
- `grace_until` dépassée → `canceled`, et seulement alors ;
- nombre de parts, parents distincts ou somme incohérents → `invalide`, aucune
  écriture d'accès ;
- une part perdue alors qu'une autre est payée → `remboursement_du`, à
  régulariser à la main dans Stripe.

La dégradation ne s'applique qu'aux lignes dont `arrangement_id` correspond à
l'arrangement concerné : un abonnement intégral antérieur n'est jamais touché.

## Idempotence et désordre

Trois garde-fous se cumulent :

1. `record_billing_event` en tête de webhook — un identifiant d'événement déjà
   vu s'arrête là. Inchangé.
2. `maj_contribution_stripe` n'écrit que si le statut change, et ignore un
   événement tardif visant une part déjà close (`refused`, `expired`,
   `canceled`).
3. `recalculer_partage` relit systématiquement l'ensemble des parts. Elle ne
   fait pas avancer un compteur : elle recalcule. L'ordre d'arrivée des deux
   `invoice.paid` est donc sans effet sur le résultat.

## Ce qui reste à décider avant la mise en service

`grace_until` est écrite mais `household_entitlement` ne la lit pas. Tant que
ce branchement n'est pas fait, un foyer en `past_due` perd son accès
immédiatement, sans bénéficier de la grâce. L'y brancher change la règle
d'accès en vigueur, y compris pour les abonnements intégraux existants —
décision métier, à prendre séparément.
