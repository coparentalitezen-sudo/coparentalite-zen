# Contribuer à Coparentalité Zen

Ce document existe pour une raison simple : **personne ne doit être indispensable**.
Développeur, assistant conversationnel, prestataire ou propriétaire du produit —
chacun propose une modification, et c'est la machine qui décide si elle tient.

---

## Ce qui est vérifié automatiquement

À chaque `push` et à chaque proposition de fusion, GitHub exécute :

| Contrôle | Ce qu'il garantit |
|---|---|
| `npm run typecheck` | aucune incohérence de types |
| `npm test` | 60 tests unitaires : moteurs de planning, calculs monétaires, fichiers |
| `npm run build` | l'application se construit réellement |
| `npx playwright test` | 12 parcours dans un vrai navigateur |
| `scripts/test-sql.sh` | 14 migrations appliquées sur un PostgreSQL 16 vierge, puis 116 assertions SQL |

Un seul échec bloque l'ensemble. Le détail est lisible dans l'onglet **Actions**
du dépôt ; en cas d'échec des tests de bout en bout, les traces sont conservées
sept jours.

---

## Vérifier avant de pousser

```bash
npm ci
npm run verify      # types + tests + build + bout en bout
npm run test:sql    # migrations + assertions SQL (nécessite PostgreSQL)
```

`npm run test:sql` fonctionne aussi contre un serveur distant :

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=... npm run test:sql
```

---

## Règles que les tests font respecter

Elles ne sont pas décoratives : chacune vient d'un défaut réellement rencontré
en production.

- **Montants en centimes entiers.** Aucun flottant, jamais. Un test vérifie
  3 000 combinaisons de répartition : la somme des parts égale toujours le total.
- **Aucune écriture directe sur les tables comptables.** `expenses`,
  `expense_shares`, `reimbursements`, `expense_comments`, `expense_children`
  sont en lecture seule pour le rôle applicatif. Toute écriture passe par une
  fonction serveur qui vérifie l'identité, l'appartenance au foyer et la
  cohérence. Six sondes le vérifient.
- **Le solde est calculé côté serveur**, sur l'intégralité des données. Les
  listes paginées servent uniquement à l'affichage. Deux écrans ne doivent
  jamais afficher deux soldes différents.
- **Isolation entre foyers.** Un foyer ne voit jamais les données d'un autre,
  même en connaissant un identifiant.
- **Un parent ne valide pas sa propre dépense**, et n'enregistre que les
  remboursements qu'il effectue lui-même.
- **Une dépense déjà réglée est verrouillée** : il faut annuler le
  remboursement avant de la modifier.
- **Priorité du planning** : vacances > changement ponctuel > rythme récurrent.
  Une exception masque le rythme sans jamais le décaler.
- **Suppressions logiques uniquement** (`deleted_at`) sur les données à valeur
  probatoire. Le journal d'audit n'est ni modifiable ni supprimable.

Si une modification fait échouer l'un de ces tests, c'est presque toujours la
modification qu'il faut revoir — pas le test.

---

## Migrations de base de données

Les fichiers vivent dans `supabase/migrations/`, numérotés dans l'ordre
d'application. Chacune doit être :

- **idempotente** — rejouable sans effet de bord (`create or replace`,
  `if not exists`, `drop policy if exists`, gardes explicites sur les
  contraintes) ;
- **transactionnelle** quand c'est possible (`begin` / `commit`) ;
- **testée** — une suite dans `supabase/tests/` couvrant les règles ajoutées.

### Appliquer à la production

Onglet **Actions** → *Migrations Supabase* → **Run workflow**.

Choisir d'abord `verification` : la liste des migrations en attente s'affiche
sans rien écrire. Puis relancer en `appliquer` si le résultat est conforme.

**Réconciliation initiale, à faire une seule fois.** Les migrations
antérieures ont été appliquées à la main : la base les contient, mais sa table
de suivi les ignore. Sans réconciliation, l'outil tenterait de tout réappliquer.
Depuis un poste disposant du CLI Supabase :

```bash
supabase link --project-ref <ref-du-projet>
supabase migration list                 # colonne « Local » remplie, « Remote » vide
supabase migration repair --status applied 00001 00002 00003 00004 00005 \
                                          00006 00007 00008 00009 00010 \
                                          00011 00013 00014
supabase migration list                 # les deux colonnes concordent désormais
```

Ensuite seulement, les migrations suivantes s'appliquent d'un clic.

Secrets requis dans **Settings → Secrets and variables → Actions** :
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

---

## Paiements

Le parcours de paiement n'est actif que si deux variables sont renseignées :
`STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`, plus
`SUPABASE_SERVICE_ROLE_KEY` pour le webhook. Voir `.env.example`.

**Les prix ne sont écrits nulle part dans le code.** La table `plans` est la
seule source de vérité : montants mensuel et annuel, identifiants de tarif
Stripe, libellé public et liste des fonctions. La page commerciale, l'écran
d'offre et la création de session Stripe lisent tous cette table. Trois prix
différents avaient coexisté dans le projet — annoncer un tarif et en facturer
un autre se règle devant un médiateur de la consommation.

Ajuster un prix :

```sql
update plans set price_cents_monthly = 149, price_cents_yearly = 1499
where id = 'premium';
```

Sans elles, l'écran d'offre annonce que les paiements ne sont pas encore
activés : aucun écran ne prétend encaisser sans pouvoir le faire.

Le webhook Stripe doit pointer vers `/api/stripe/webhook` et écouter :
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

Trois invariants protègent la facturation, chacun couvert par un test :

- **la signature est vérifiée** — sans cela, appeler l'URL du webhook
  suffirait à s'offrir un abonnement ;
- **un événement abouti n'est jamais retraité**, mais un événement
  **échoué reste rejouable** : une erreur passagère ne doit pas faire perdre
  un paiement ;
- **le foyer crédité vient des métadonnées Stripe**, jamais du corps de la
  requête ni d'un paramètre d'URL.

Le client ne peut ni s'accorder une extension ni s'abonner : `grant_extension`
et `upsert_subscription` sont réservées au rôle de service.

## Déploiement de l'application

Vercel construit et publie automatiquement chaque commit de `main`.

Deux pièges vérifiés à leurs dépens :

1. **Vercel ignore les commits dont l'auteur Git est inconnu du compte GitHub.**
   Configurer une fois pour toutes :
   ```bash
   git config user.email "<identifiant>+<utilisateur>@users.noreply.github.com"
   git config user.name  "<utilisateur>"
   ```
2. **Ne jamais annoncer un déploiement sans l'avoir constaté.** Le hash du
   commit servi est affiché en haut à droite de l'application : il doit
   correspondre au commit poussé.

---

## Conventions

- Interface intégralement en français.
- Vocabulaire neutre et non accusatoire : « montant à régulariser » plutôt que
  « dette », « dépense à vérifier » plutôt que « refusée ». Le produit s'adresse
  à des parents séparés ; les mots comptent.
- Les deux parents ne sont jamais distingués par la seule couleur : toujours une
  initiale ou un libellé en complément.
- Aucun bouton factice, aucune simulation présentée comme fonctionnelle. Les
  écrans incomplets le disent.
