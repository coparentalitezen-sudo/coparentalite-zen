# 12 — Épreuve du starter : une application de suivi de comptes

Étape 6 de la mission. Exercice **sur le papier** : appliquer l'architecture à
un sujet sans aucun rapport avec la coparentalité, pour vérifier que le socle
est réellement générique.

Règle de l'exercice : **ne réutiliser aucune logique de coparentalité au motif
qu'elle existe.** Si une brique ne se justifie pas ici, elle n'appartenait pas
au socle.

---

## 0. Définition du projet (étape 0)

| Question | Réponse |
|---|---|
| Problème | « Je ne sais jamais combien il me reste réellement avant la fin du mois. » |
| Cible | Personne seule ou couple, revenus réguliers, sur mobile |
| MVP | comptes, transactions, catégories, budget mensuel, tableau de bord |
| Utile ensuite | import de relevés, recherche, alertes, export |
| Hors périmètre | connexion bancaire automatique (agrégation), investissements, fiscalité |
| Données | montants, libellés, dates, catégories — **données financières = sensibles** |
| Périmètre partagé | mono-utilisateur au lancement, couple prévu → workspace conservé, partage coupé |
| Modèle | gratuit : 2 comptes, 12 mois d'historique · payant : illimité + import + export |
| Contraintes | RGPD renforcé, aucune donnée bancaire d'authentification stockée |

Nom de travail : **Compta Claire**.

---

## 1. Ce qui vient du starter SANS MODIFICATION

Aucune ligne à écrire. Le premier jour de développement commence avec tout ceci
qui fonctionne déjà.

### Compte et sécurité

| Brique | Précision |
|---|---|
| Inscription, connexion, déconnexion | inchangé |
| Mot de passe oublié, réinitialisation | inchangé |
| Callback des liens e-mail | inchangé |
| Trigger `handle_new_user()` | inchangé |
| Tables `profiles`, `user_settings` | inchangé |
| Middleware (garde + canonisation) | inchangé, chemins lus en config |
| Trois clients Supabase | inchangé |
| Mode démonstration | inchangé |
| En-têtes de sécurité et CSP | inchangé (entrées Stripe activées) |
| `ActionResult` et erreurs lisibles | inchangé |
| `error.tsx`, `not-found.tsx` | inchangé |
| `/api/diagnostic` | inchangé |

### Base de données

| Brique | Précision |
|---|---|
| `workspaces` + `workspace_members` | **utilisé tel quel** : un workspace d'une personne à l'inscription |
| Helpers `is_member` / `can_write` / `member_role_in` | inchangés |
| Activation RLS en boucle | inchangée |
| Migration de grants | inchangée |
| Migration de durcissement | inchangée |
| `audit_logs` immuable | inchangé |
| `set_updated_at` généralisé | inchangé |
| Conventions centimes / `deleted_at` / `created_by` | inchangées — **et particulièrement adaptées ici** |
| Storage : seaux privés, chemin `{workspace_id}/…` | inchangé (relevés importés) |
| Seau de sauvegardes | inchangé |

Le choix « montants en centimes `bigint`, jamais de flottant » vaut ici encore
plus que sur Coparentalité Zen : une application financière qui arrondit mal
perd toute crédibilité au premier écran.

### PWA

Manifeste, service worker versionné, page hors ligne, invite de mise à jour,
générateur d'icônes, écrans de démarrage iOS, détection de plateforme,
marche à suivre d'installation, pastille — **inchangés**.

### Notifications et e-mails

Moteur fait/canal, préférences par type, file de livraison idempotente,
abonnements Push par appareil, purge des endpoints morts, gabarits e-mail,
Resend, tâches planifiées — **inchangés**.

### Paiement

Client Stripe, Checkout, portail, webhook signé, idempotence, `billing_events`,
grille tarifaire en base, fonction de droits à trois états — **inchangés**.

### Conformité

Export, suppression de compte (avec résiliation Stripe préalable),
`consent_logs`, identité éditeur paramétrable et vérifiable, gabarit de page
légale — **inchangés**.

### Qualité et livraison

Banc de test SQL, Vitest, Playwright, CI à deux jobs + verdict, workflow de
migrations, `.env.example`, `verifier-config.ts` — **inchangés**.

**Estimation : environ 80 % de l'infrastructure, disponible au premier commit.**

---

## 2. Ce qui est SIMPLEMENT CONFIGURÉ

Aucun code, seulement des valeurs.

### `app.config.ts`

```ts
export const app = {
  identite: {
    nom: 'Compta Claire',
    nomCourt: 'Compta',                 // 6 caractères, OK pour iOS
    domaine: 'https://comptaclaire.fr',
    description: 'Vos comptes, vos budgets et ce qu’il vous reste, en clair.',
    langue: 'fr-FR',
    emailSupport: 'contact@comptaclaire.fr',
  },
  marque: {
    couleurs: {
      primaire: '#1F4E46',   // vert profond, registre financier
      accent:   '#C9A227',
      fond:     '#FBFAF7',
      encre:    '#0F1A18',
    },
    polices: { corps: 'Inter', titres: 'Inter' },
    rayons: { carte: '14px', bouton: '10px' },
    logo: { source: 'public/branding/symbole.png' },
  },
  pwa: {
    idDemarrage: '/app/tableau-de-bord',
    startUrl: '/app/tableau-de-bord?source=pwa',
    affichage: 'standalone',
    orientation: 'portrait',
    categories: ['finance', 'productivity'],
    raccourcis: [
      { nom: 'Saisir une dépense', url: '/app/transactions/nouvelle' },
      { nom: 'Budgets',            url: '/app/budgets' },
    ],
  },
  navigation: [
    { libelle: 'Tableau de bord', href: '/app/tableau-de-bord', icone: 'jauge' },
    { libelle: 'Comptes',         href: '/app/comptes',         icone: 'portefeuille' },
    { libelle: 'Transactions',    href: '/app/transactions',    icone: 'liste' },
    { libelle: 'Budgets',         href: '/app/budgets',         icone: 'cible' },
    { libelle: 'Plus',            href: '/app/plus',            icone: 'points' },
  ],
  legal: {
    formeParDefaut: 'Micro-entreprise',
    versionTextes: '2026-09-01',
    conservation: {
      compteInactif: '3 ans',
      journauxTechniques: '12 mois',
      donneesFacturation: '10 ans',
    },
  },
  offres: {
    libelleGratuit: 'Essentiel',
    librePayant: 'Complet',
    quota: { cle: 'nb_comptes', valeurGratuite: 2 },
  },
} as const;
```

### `features.config.ts`

```ts
export const features = {
  paiement: true,
  premium: true,
  paiementPartage: false,   // sans objet ici
  push: true,
  email: true,
  workspacePartage: false,  // couple prévu plus tard : structure prête, écrans masqués
  storage: true,            // relevés importés
  sauvegardes: true,
  marketing: false,
  modeDemo: true,
} as const;
```

### Grille tarifaire (en base, pas en fichier)

```sql
update plans set
  libelle                 = 'Complet',
  price_cents_monthly     = 390,
  price_cents_yearly      = 3900,
  stripe_price_id_monthly = 'price_...',
  stripe_price_id_yearly  = 'price_...',
  fonctions = array['Comptes illimités','Historique illimité',
                    'Import de relevés','Export CSV et PDF']
where id = 'plus';
```

### Types de notification (données, pas structure)

```sql
insert into notification_types (code, libelle, categorie, canaux_par_defaut) values
  ('solde_bas',        'Solde faible',            'alertes', array['internal','push']),
  ('budget_depasse',   'Budget dépassé',          'alertes', array['internal','push']),
  ('budget_80',        'Budget bientôt atteint',  'alertes', array['internal']),
  ('echeance_proche',  'Échéance à venir',        'rappels', array['internal','push']),
  ('import_termine',   'Import de relevé terminé','activite',array['internal'])
on conflict (code) do nothing;
```

### Le reste

- logo déposé, `generer-icones.py` exécuté ;
- textes légaux : gabarits remplis, identité éditeur en variables ;
- durées de conservation ajustées ;
- `.env.local` et variables Vercel.

**Estimation : une demi-journée. Aucun code.**

---

## 3. Ce qui doit être DÉVELOPPÉ SPÉCIFIQUEMENT

Tout le reste — et c'est là que doit passer l'effort.

### 3.1 Migrations métier

`supabase/migrations/metier/01001_comptes.sql` → `01006_import.sql`

```sql
comptes (
  id, workspace_id, libelle, type,          -- courant | epargne | especes | credit
  devise, solde_initial_cents bigint,
  couleur, archive_at, created_by, created_at, updated_at, deleted_at
)

categories (
  id, workspace_id, libelle, sens,          -- 'revenu' | 'depense'
  parent_id,                                -- hiérarchie à un niveau
  couleur, icone, systeme boolean,          -- systeme = jeu par défaut, non supprimable
  ordre
)

transactions (
  id, workspace_id, compte_id, categorie_id,
  montant_cents bigint,                     -- signé : négatif = sortie
  date_operation date, date_valeur date,
  libelle, libelle_normalise,               -- pour la recherche et les règles
  mode,                                     -- carte | virement | prelevement | especes
  pointee boolean,                          -- rapprochement avec le relevé
  transfert_id uuid,                        -- lie les deux moitiés d'un virement interne
  import_id uuid, empreinte text,           -- anti-doublon d'import
  note, created_by, created_at, updated_at, deleted_at
)

budgets (
  id, workspace_id, categorie_id,
  periode,                                  -- 'mensuel' | 'annuel'
  montant_cents bigint, debut date, fin date,
  seuil_alerte_bp int                       -- points de base : 8000 = 80 %
)

echeances (
  id, workspace_id, compte_id, categorie_id,
  libelle, montant_cents bigint,
  recurrence,                               -- mensuel | trimestriel | annuel
  prochaine_date date, actif boolean
)

imports (
  id, workspace_id, compte_id, nom_fichier, format,
  chemin_storage,                           -- {workspace_id}/{uuid}.csv
  etat,                                     -- depose | analyse | valide | echoue
  lignes_total int, lignes_importees int, lignes_doublons int,
  rapport jsonb, created_by, created_at
)

regles_categorisation (
  id, workspace_id, motif text, categorie_id, priorite int, actif boolean
)
```

Policies : `is_member(workspace_id)` en lecture, `can_write(workspace_id)` en
écriture. **Le modèle du socle s'applique tel quel**, ce qui est précisément
ce qu'on voulait vérifier.

### 3.2 Table verrouillée : `transactions`

Décision à prendre selon le critère de `04-SUPABASE.md` § 8.4 : une table
porte-t-elle des règles d'intégrité que la RLS ne sait pas exprimer ?

Ici, oui, pour trois raisons :

1. un **virement interne** doit créer deux lignes cohérentes (débit sur A,
   crédit sur B, même `transfert_id`, montants opposés) — jamais une seule ;
2. le **solde d'un compte** doit rester la somme exacte de ses transactions ;
3. une transaction **pointée** (rapprochée avec le relevé) ne doit plus être
   modifiable sans dépointage explicite.

Donc, exactement comme les tables comptables de Coparentalité Zen :

- aucune policy `insert`/`update`/`delete` pour `authenticated` ;
- écriture par fonctions `SECURITY DEFINER` :
  `creer_transaction()`, `creer_transfert()`, `modifier_transaction()`,
  `supprimer_transaction()`, `pointer_transaction()` ;
- une suite SQL qui **tente** l'écriture directe et vérifie l'échec.

C'est le même mécanisme, pour un motif entièrement différent. Bonne preuve de
généricité.

### 3.3 Moteurs métier (TypeScript, fonctions pures)

| Module | Rôle | Testable seul |
|---|---|---|
| `metier/moteurs/solde.ts` | solde courant, solde projeté, solde pointé | ✔ |
| `metier/moteurs/budget.ts` | consommation, reste à dépenser, rythme | ✔ |
| `metier/moteurs/categorisation.ts` | application des règles sur un libellé normalisé | ✔ |
| `metier/moteurs/import.ts` | analyse CSV/OFX, détection de format, empreinte anti-doublon | ✔ |
| `metier/moteurs/recurrence.ts` | prochaines occurrences d'une échéance | ✔ |
| `metier/moteurs/agregats.ts` | séries mensuelles, répartition par catégorie | ✔ |

Tous en fonctions pures, testés en Vitest — c'est le principe repris de
`custody.ts` et `money.ts`, sans en reprendre une ligne.

⚠ **Réutilisation légitime et unique** : la répartition au plus fort reste de
`money.ts` sert ici à ventiler un montant entre catégories sans perdre un
centime. C'est un calcul générique, pas une règle de coparentalité. Il
appartient donc au socle (`socle/donnees/montants.ts`), pas au métier.

### 3.4 Écrans métier

| Écran | Route | Contenu |
|---|---|---|
| Tableau de bord | `/app/tableau-de-bord` | solde global, budgets du mois, dernières transactions, projection fin de mois |
| Comptes | `/app/comptes` | liste, soldes, archivage |
| Détail de compte | `/app/comptes/[id]` | transactions filtrées, rapprochement |
| Transactions | `/app/transactions` | liste paginée, filtres, recherche |
| Saisie | `/app/transactions/nouvelle` | montant, date, catégorie, compte, virement |
| Budgets | `/app/budgets` | par catégorie, jauges, alertes |
| Catégories | `/app/categories` | arborescence, règles de catégorisation |
| Échéances | `/app/echeances` | à venir, récurrences |
| Import | `/app/import` | dépôt, aperçu, correspondance de colonnes, validation |

Tous composés avec les briques du socle : `.card`, `.btn`, `Chargement`,
`Erreur`, `Vide`, navigation basse, jeu d'icônes (5 nouveaux glyphes à
ajouter).

### 3.5 Import de relevés — la vraie difficulté

Le seul chantier réellement lourd :

1. dépôt du fichier dans le seau privé, chemin `{workspace_id}/{uuid}.csv` ;
2. détection de format (CSV avec séparateur variable, encodage,
   date française vs ISO, décimale virgule, débit/crédit en deux colonnes ou
   montant signé) ;
3. écran de correspondance de colonnes, mémorisé par compte ;
4. **empreinte anti-doublon** : hachage de (compte, date, montant, libellé
   normalisé) — un relevé réimporté ne doit rien dupliquer ;
5. catégorisation automatique par règles, avec revue avant validation ;
6. import **transactionnel** : tout ou rien, avec rapport.

Le socle fournit le stockage, la validation de fichier
(`socle/donnees/fichiers.ts`, généralisé de `files.ts`) et les chemins sûrs.
Le reste est spécifique.

### 3.6 Branchements sur le socle

Trois seulement, tous par ajout :

**Notifications** — un déclencheur par type :

```sql
create or replace function public.notifier_budget_depasse() returns trigger
language plpgsql security definer set search_path = public as $$
declare consomme bigint; budget record;
begin
  select * into budget from budgets
   where categorie_id = new.categorie_id and workspace_id = new.workspace_id
     and new.date_operation between debut and fin;
  if not found then return new; end if;

  select coalesce(sum(-montant_cents), 0) into consomme from transactions
   where categorie_id = new.categorie_id and deleted_at is null
     and date_operation between budget.debut and budget.fin;

  if consomme > budget.montant_cents then
    perform public.notifier(
      destinataires => public.membres_de(new.workspace_id),
      auteur        => new.created_by,      -- lu dans la ligne, jamais auth.uid()
      type          => 'budget_depasse',
      titre         => 'Budget dépassé',
      lien          => '/app/budgets',
      entite        => 'budget', entite_id => budget.id);
  end if;
  return new;
end $$;
```

**Quota Premium** — une fonction métier interrogée par le socle :

```sql
create or replace function public.quota_comptes(wid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when (public.workspace_entitlement(wid)).actif
              then 2147483647 else 2 end;
$$;
```

**Export RGPD** — déclarer les tables métier dans la liste du socle
(`comptes`, `categories`, `transactions`, `budgets`, `echeances`, `imports`,
`regles_categorisation`).

---

## 4. Verdict de l'épreuve

| Domaine | Origine |
|---|---|
| Authentification et comptes | socle, 0 ligne |
| Sécurité, RLS, grants, durcissement | socle, 0 ligne |
| PWA complète | socle + icônes régénérées |
| Notifications et e-mails | socle + 5 lignes de données + 2 déclencheurs |
| Paiement et droits | socle + 1 requête de tarifs + 1 fonction de quota |
| RGPD | socle + liste de tables |
| Tests, CI, déploiement | socle, 0 ligne |
| **Métier** | **7 migrations, 6 moteurs, 9 écrans, l'import** |

**Le socle tient.** Aucune notion de foyer, de parent, de garde ou de dépense
partagée n'est nécessaire, et aucune ne s'est invitée.

### Ce que l'exercice a révélé — à corriger dans le socle

Trois manques que seule cette mise à l'épreuve fait apparaître :

1. **Pagination et recherche.** Une application de comptes affiche des milliers
   de lignes ; Coparentalité Zen en affiche des dizaines. Le socle doit fournir
   un composant de liste paginée avec recherche et un motif de requête associé.

2. **Import de fichier.** Le socle sait stocker, pas analyser. Un module
   générique « déposer → analyser → faire correspondre les colonnes →
   valider » serait réutilisable par de nombreuses applications (comptes,
   budget, suivi administratif). **Candidat prioritaire pour la v2 du
   starter.**

3. **Graphiques.** Aucune brique de visualisation dans Coparentalité Zen. À
   décider : dépendance légère, ou SVG maison dans la continuité du choix
   « aucune bibliothèque d'interface ».

Ces trois points sont reportés dans `APP-STARTER-SPEC.md`.
