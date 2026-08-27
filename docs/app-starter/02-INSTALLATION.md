# 02 — Installation : de l'idée au projet qui démarre

Couvre les étapes 0 et 1 du mode opératoire. À la fin de ce document, une
nouvelle application tourne en local, connectée à rien, mais complète.

---

## Étape 0 — Définir le projet avant d'écrire une ligne

Ne pas sauter. Une demi-journée ici épargne des semaines. Le résultat tient
dans un seul fichier, `docs/00-PROJET.md`, qui répond à neuf questions.

### 0.1 Le problème utilisateur

Une phrase, au présent, sans jargon, du point de vue de la personne :

> « Je ne sais jamais combien il me reste réellement avant la fin du mois. »

Si la phrase parle de la solution (« il manque une application de budget »),
elle est fausse. Recommencer.

### 0.2 La cible

Qui, précisément, dans quelle situation, sur quel appareil. Coparentalité Zen
a été construit pour un parent séparé, sur iPhone, entre deux portes — d'où
mobile d'abord, cibles tactiles généreuses, installation sur l'écran d'accueil.

### 0.3 Les fonctionnalités du MVP

Trois colonnes, honnêtement remplies :

| Indispensable au premier usage | Utile ensuite | Explicitement hors périmètre |
|---|---|---|

Règle : si la colonne 1 dépasse cinq lignes, le MVP est trop gros.

### 0.4 Les données

Pour chaque donnée manipulée :

| Donnée | Sensible ? | Durée de conservation | Qui peut la voir |
|---|---|---|---|

Cette table alimente directement le modèle RLS **et** la politique de
confidentialité. La remplir maintenant évite de la reconstituer sous
contrainte au moment de rédiger le juridique.

### 0.5 Le périmètre partagé

L'application est-elle mono-utilisateur, ou plusieurs personnes partagent-elles
des données ? Réponse → `features.workspacePartage`.

Rappel : même en mono-utilisateur, le socle crée un workspace. Le coût est nul
et le partage devient une option d'affichage.

### 0.6 Le modèle économique

- Gratuit intégral ? Gratuit + payant ? Payant seul ?
- **Où passe la limite ?** Coparentalité Zen limite l'horizon de planification
  future et **jamais** l'accès aux données déjà saisies : bloquer des pièces
  qui peuvent servir devant un médiateur serait indéfendable. Poser la même
  question : que serait-il inacceptable de retenir en otage ?
- Mensuel, annuel, achat ponctuel ?
- Décision : `features.paiement`, `features.premium`, `app.offres.quota`.

### 0.7 Sécurité et données sensibles

- Données de santé, bancaires, ou concernant des mineurs ? → obligations
  renforcées, chiffrement au repos à envisager, DPO éventuel.
- Analyse d'impact (AIPD) nécessaire ? Elle l'est notamment pour un traitement
  à grande échelle de données sensibles ou un profilage systématique.
- **À VALIDER auprès d'un professionnel** dès que la réponse est oui.

### 0.8 Contraintes légales

- Vente à des particuliers en France → **médiateur de la consommation
  obligatoire** (art. L612-1 du code de la consommation), identité de
  l'éditeur, droit de rétractation, CGV.
- Immatriculation (SIREN) requise avant toute facturation.
- Sous-traitants : contrat de sous-traitance (DPA) avec chacun.

### 0.9 Le critère d'arrêt

Une phrase mesurable qui définit « le MVP est terminé ». Sans elle, le
périmètre glisse indéfiniment.

---

## Étape 1 — Créer le projet

### 1.1 Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Node.js | 22 LTS | `node -v` |
| npm | fourni avec Node | `npm -v` |
| Git | récent | `git --version` |
| PostgreSQL | 16 (local, pour `test:sql`) | `psql --version` |
| Python 3 | pour la génération d'icônes | `python3 --version` |
| Compte GitHub / Vercel / Supabase | — | — |
| Compte Stripe | seulement si `features.paiement` | — |

La CI utilise Node 22 : utiliser la même version en local évite les écarts.

### 1.2 Partir du starter

```bash
# Option A — le starter est un template GitHub (recommandé)
gh repo create mon-app --template <compte>/app-starter --private
git clone https://github.com/<compte>/mon-app.git
cd mon-app

# Option B — copie manuelle
git clone https://github.com/<compte>/app-starter.git mon-app
cd mon-app
rm -rf .git && git init
```

### 1.3 Personnaliser en trois fichiers

C'est tout l'intérêt du starter : **trois fichiers, pas trente**.

1. `app.config.ts` — nom, domaine, description, couleurs, navigation, offres.
2. `features.config.ts` — activer ou couper Stripe, Push, e-mail, partage.
3. `.env.local` — copié depuis `.env.example`, secrets renseignés.

Puis :

```bash
npm ci
npm run generer:theme      # globals.css depuis app.config.ts
python3 scripts/generer-icones.py   # 21 icônes + écrans iOS depuis le logo
npm run verifier:config    # doit passer avant toute autre chose
```

### 1.4 Premier démarrage

```bash
npm run dev        # http://localhost:3000
```

Sans Supabase configuré, l'application démarre en **mode démonstration** :
navigation, écrans, PWA fonctionnent, un bandeau annonce l'absence de base.
C'est volontaire — cela permet de travailler l'interface avant d'avoir une
base, et cela rend la CI possible sans identifiants réels.

### 1.5 Vérifier que tout est en place

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:sql      # exige PostgreSQL local
```

Les cinq doivent passer **avant** la première ligne de code métier. Une chaîne
rouge dès le départ n'est jamais réparée ensuite : elle apprend à ignorer le
rouge.

### 1.6 Renommer et nettoyer

Avant le premier commit :

- [ ] `package.json` : `name`, `description`
- [ ] `README.md` réécrit pour cette application
- [ ] `AGENTS.md` : produit décrit en trois phrases, tableau des écrans vidé
- [ ] `docs/00-PROJET.md` rempli (étape 0)
- [ ] aucun reste du starter d'exemple dans `src/metier/`
- [ ] `npm run verifier:config` passe

### 1.7 Ordre de travail recommandé

```
1. app.config + features + .env          ← ce document
2. GitHub + branches + Vercel            ← 03
3. Supabase : projet, auth, socle         ← 04
4. Migrations métier + RLS métier         ← 04 puis 12
5. Écrans métier                          ← 01 partie C.4
6. PWA : icônes, installation réelle      ← 06
7. Notifications et e-mails               ← 07
8. Stripe en Test                         ← 08
9. RGPD et textes légaux                  ← 09
10. Tests complets                        ← 10
11. Bêta privée                           ← 11
12. Stripe Live + production              ← 08 puis 11
```

Deux inversions coûtent cher et sont vérifiées :

- **Ne pas repousser le RGPD à la fin.** L'export doit être écrit en même
  temps que les tables ; ajouté après, il en oublie.
- **Ne pas passer Stripe en Live avant que l'identité légale soit complète.**
  Encaisser sans mentions légales conformes est un risque inutile.
