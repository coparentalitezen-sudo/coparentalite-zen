# 08 — Paiement (Stripe)

Étape 8 du mode opératoire, dans l'ordre réel :
**Test → produits → prix → Checkout → webhook → abonnement → droits → tests →
Live.**

Toute cette partie est conditionnée par `features.paiement`. Une application
gratuite ne l'active pas : ni route, ni écran, ni migration, ni entrée CSP.

---

## 0. La règle qui domine tout

> **Aucune clé secrète ne doit jamais se trouver dans Git.**
> **Aucun montant ne doit jamais se trouver dans le code.**

La première protège l'argent. La seconde protège du litige : trois prix
différents ont coexisté dans Coparentalité Zen, et annoncer un tarif tout en
en facturant un autre se règle devant un médiateur de la consommation.

Les montants **et** les identifiants de tarif Stripe vivent dans la table
`plans`, exposée par un RPC public. Page commerciale, écran d'offre et
création de session lisent tous la même source.

---

## 1. Stripe en mode Test

1. Créer le compte, rester en **mode Test** (interrupteur du tableau de bord).
2. *Developers → API keys* → clé secrète de test (`sk_test_…`).
3. Renseigner `STRIPE_SECRET_KEY` dans `.env.local` — jamais dans Git.

Sans `STRIPE_SECRET_KEY` **et** `STRIPE_WEBHOOK_SECRET`, `configStripe()`
renvoie `null` : l'écran d'offre annonce l'indisponibilité et le reste de
l'application fonctionne. Aucun écran ne prétend encaisser sans le pouvoir.

## 2. Produits et prix

Dans *Product catalog*, créer le produit et ses tarifs (mensuel, annuel,
achats ponctuels). Relever l'**API ID** de chaque tarif (`price_…`).

Puis en base — et **nulle part ailleurs** :

```sql
update plans set
  price_cents_monthly     = 490,
  price_cents_yearly      = 4900,
  stripe_price_id_monthly = 'price_...',
  stripe_price_id_yearly  = 'price_...'
where id = 'plus';
```

Ajuster un prix devient une requête, jamais un déploiement.

⚠ **Un `price` Stripe est immuable.** Changer un tarif = créer un nouveau
`price` et mettre à jour la ligne. Les abonnements en cours conservent
l'ancien, ce qui est le comportement souhaité.

⚠ **Les frais fixes par transaction pèsent lourd sur les petits montants.**
Constat de Coparentalité Zen : un partage de coût entre deux personnes n'est
viable qu'en facturation **annuelle**. À vérifier avant de promettre un
paiement partagé mensuel.

## 3. Checkout

`src/socle/paiement/stripe.ts` appelle l'API en HTTP brut, sans SDK — trois
points d'entrée ne justifient pas un paquet supplémentaire et sa surface de
mise à jour. La version d'API est **figée** dans l'en-tête `Stripe-Version`,
ce qui protège des évolutions non désirées.

Champs qui comptent :

```
mode                        'payment' (unique) | 'subscription'
line_items[0][price]        lu en base, jamais transmis par le client
success_url / cancel_url    absolues, construites sur NEXT_PUBLIC_SITE_URL
locale                      'fr'
client_reference_id         identifiant du workspace
metadata[workspace_id]      le webhook s'y fie
metadata[type]              'abonnement' | 'extension'
subscription_data[metadata][workspace_id]   pour retrouver le workspace plus tard
```

⚠ **Le webhook se fie aux métadonnées, jamais à un paramètre d'URL** — un
client peut falsifier ce dernier.

⚠ **Le montant vient toujours de la base**, jamais du navigateur. Si aucun
`price` n'est préenregistré, on décrit le produit à la volée avec le montant
lu en base (`price_data[unit_amount]`).

### Idempotence

Un en-tête `Idempotency-Key` sur chaque création. Une requête rejouée — un
double clic, un retour réseau — ne doit pas produire deux paiements.

## 4. Webhook

`POST /api/stripe/webhook`.

### Vérifier la signature — impérativement

Sans vérification, n'importe qui peut s'offrir un abonnement en appelant
l'URL. Le socle refuse tout si `STRIPE_WEBHOOK_SECRET` est absent :
indisponible vaut mieux que crédule.

En local :

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Le secret affiché (`whsec_…`) va dans `.env.local`.

En ligne : *Developers → Webhooks → Add endpoint*,
`https://<domaine>/api/stripe/webhook`, et **un secret distinct par
endpoint** — test et live n'ont pas le même.

### Événements à écouter

| Événement | Effet |
|---|---|
| `checkout.session.completed` | crédite le droit (abonnement ou achat) |
| `customer.subscription.updated` | met à jour statut et échéance |
| `customer.subscription.deleted` | passe le droit à expiré |
| `invoice.paid` | prolonge la période |
| `invoice.payment_failed` | signale l'échec, ouvre la période de grâce |

### Trois exigences

1. **Répondre 200 vite.** Stripe réessaie si le traitement traîne ; le
   traitement long se fait après avoir accusé réception.
2. **Idempotence côté réception.** Le même événement peut arriver deux fois :
   enregistrer les `event.id` déjà traités (table `billing_events`) et sortir
   immédiatement sur un doublon.
3. **Un seul point d'entrée d'écriture.** Coparentalité Zen fait converger
   tout le chemin de paiement vers une fonction atomique
   (`upsert_subscription`). La contourner, c'est créer une seconde vérité.

Le webhook s'exécute **sans utilisateur** : c'est le seul endroit — avec les
tâches planifiées — où le client `service_role` est légitime.

⚠ Rappel critique de `04-SUPABASE.md` : `revoke from public` prive aussi
`service_role`, et `drop function` emporte les grants. Un webhook qui échoue
sur `permission denied for function` **n'écrit rien** : le paiement est
encaissé, le droit n'est pas crédité.

## 5. Droits (gratuit / payant)

Une seule fonction serveur répond à « cette personne a-t-elle accès ? » :

```sql
create or replace function public.workspace_entitlement(wid uuid)
returns table (actif boolean, plan text, expire_le timestamptz, motif text)
```

L'interface ne recalcule jamais un droit. Elle demande.

Trois états, pas deux :

| État | Comportement |
|---|---|
| actif | tout est ouvert |
| **grâce** | échec de paiement récent : accès maintenu, bandeau explicite |
| expiré | retour aux limites de l'offre gratuite |

⚠ **Défaut constaté sur Coparentalité Zen :** `grace_until` est écrit en base
mais **n'est pas lu** par la fonction de droits. La période de grâce est donc
inerte. Le starter doit livrer les trois états **et un test qui vérifie la
grâce**, sinon la colonne existe sans effet.

### Où placer la limite

La question la plus importante du modèle économique. Coparentalité Zen limite
l'**horizon de planification future** et jamais l'accès aux données déjà
saisies : bloquer des pièces pouvant servir devant un médiateur serait
indéfendable.

Poser la même question pour chaque application : **que serait-il inacceptable
de retenir en otage ?** L'export RGPD, en particulier, ne se limite jamais.

## 6. Portail client

`/api/paiement/portail` crée une session du portail Stripe : changement de
carte, historique de factures, résiliation. C'est une obligation pratique
autant qu'un confort — l'utilisateur doit pouvoir résilier seul, sans écrire.

## 7. Suppression de compte

**Ordre non négociable** (voir `09-RGPD-JURIDIQUE.md`) :

1. résilier l'abonnement Stripe ;
2. **seulement ensuite** anonymiser le compte.

Une fois le profil anonymisé, plus rien ne relie le compte au client Stripe et
le prélèvement continuerait au profit d'un compte qui n'existe plus. Un échec
de résiliation interrompt tout : mieux vaut un effacement refusé qu'un
effacement suivi d'un débit.

Un abonnement déjà résilié (404) n'est pas une erreur : le but est atteint.

## 8. Tests

Cartes de test Stripe : `4242 4242 4242 4242` (succès),
`4000 0000 0000 9995` (fonds insuffisants),
`4000 0025 0000 3155` (authentification 3D Secure).

| Cas | Attendu |
|---|---|
| abonnement mensuel | droit actif, échéance correcte |
| abonnement annuel | idem, période d'un an |
| achat ponctuel | droit crédité, non renouvelé |
| carte refusée | aucun droit, message clair |
| 3D Secure | droit crédité après authentification |
| double clic | **un seul** paiement (idempotence) |
| webhook rejoué | un seul crédit |
| webhook mal signé | rejeté en 400 |
| résiliation depuis le portail | droit expiré à l'échéance, pas avant |
| échec de renouvellement | période de grâce active |
| suppression de compte avec abonnement | abonnement résilié **puis** compte supprimé |

Les cas d'idempotence et de signature se testent en unitaire, sans Stripe
(voir les tests `payment-idempotency` et `paiement-*` de Coparentalité Zen).

## 9. Passage en Live

**Préalables bloquants :**

- [ ] identité légale complète : dénomination, forme, **SIREN**, adresse,
      responsable de publication
- [ ] **médiateur de la consommation désigné** (art. L612-1) — obligatoire
      pour vendre à des particuliers en France
- [ ] CGV publiées, incluant droit de rétractation et modalités de résiliation
- [ ] politique de confidentialité et mentions légales à jour
- [ ] compte Stripe activé (identité et coordonnées bancaires vérifiées)

**Bascule :**

1. Stripe → mode Live → nouvelle clé secrète `sk_live_…`.
2. Recréer produits et prix en Live (Test et Live sont **deux catalogues
   séparés** — les `price_…` diffèrent).
3. Mettre à jour la table `plans` avec les identifiants Live.
4. Créer l'endpoint webhook Live → nouveau `whsec_…`.
5. Renseigner `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` **en portée
   Production uniquement** sur Vercel. Preview garde les clés de test.
6. Redéployer (une variable modifiée n'existe qu'au déploiement suivant).
7. **Faire un vrai paiement**, vérifier le droit crédité, puis rembourser
   depuis le tableau de bord.
8. Vérifier `/api/diagnostic` : mode live confirmé.

⚠ **Ne jamais mélanger une clé de test et un `price` live** (ou l'inverse) :
l'erreur renvoyée est peu explicite et coûte du temps.

⚠ **Une fonctionnalité de paiement non validée reste dormante.** Coparentalité
Zen a implémenté le paiement 50/50 puis a délibérément laissé
`PAYMENT_SPLIT_ENABLED` absent de la production : un bouton actif qui ne peut
pas aboutir est pire qu'un bouton absent. Le starter reprend ce principe —
un drapeau par fonctionnalité de paiement, levé seulement après un test réel
de bout en bout.
