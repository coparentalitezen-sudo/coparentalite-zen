# 15 — Travailler avec Claude Code

Ce dossier fait environ 29 000 mots. On ne le « donne » pas à un agent : on le
lui rend **consultable au bon moment**. Ce document décrit le dispositif.

---

## 1. Le principe

Un agent de codage travaille bien quand trois conditions sont réunies :

1. **il sait où chercher** plutôt qu'on lui déverse tout en contexte ;
2. **il a une cible vérifiable** pour la session en cours, pas un objectif de
   plusieurs jours ;
3. **quelqu'un constate le résultat** au lieu de le croire sur parole.

Le blueprint sert la première condition, le découpage en sessions la deuxième,
les jalons la troisième.

## 2. Préparer le dépôt

Avant la première session, quatre fichiers doivent exister.

```
mon-app/
├── CLAUDE.md              ← routeur : dit quoi lire et quand
├── AGENTS.md              ← carte du projet, se remplit au fil de l'eau
├── docs/
│   ├── 00-PROJET.md       ← LE brief, rempli par toi, pas par l'agent
│   └── app-starter/       ← ce dossier, copié tel quel
```

### `docs/00-PROJET.md` — à remplir soi-même

C'est le seul document que l'agent ne peut pas écrire à ta place. Il répond
aux neuf questions de `02-INSTALLATION.md` § 0 : problème, cible, MVP,
hors-périmètre, données, périmètre partagé, modèle économique, contraintes
légales, critère d'arrêt.

Une heure de ta part ici vaut trois jours de la sienne. Un brief flou produit
une application floue, et l'agent ne le signalera pas — il comblera.

### `CLAUDE.md` — le routeur

Claude Code lit ce fichier automatiquement à chaque session. Il ne doit pas
répéter le blueprint : il doit **y renvoyer**.

```markdown
# CLAUDE.md

## À lire en premier
- `docs/00-PROJET.md` — ce que fait cette application. Source de vérité métier.
- `docs/app-starter/README.md` — sommaire du blueprint technique.
- `AGENTS.md` — état du projet, décisions prises, pièges rencontrés.

## Où chercher selon la tâche
| Tâche | Document |
|---|---|
| structure, config, frontière socle/métier | `01-ARCHITECTURE.md` |
| dépôt, branches, CI, Vercel | `03-GITHUB-VERCEL.md` |
| migrations, RLS, grants, ajout de tables | `04-SUPABASE.md` |
| auth, sécurité, secrets, erreurs | `05-AUTH-SECURITE.md` |
| manifeste, service worker, iOS | `06-PWA.md` |
| notifications, e-mails | `07-NOTIFICATIONS-EMAIL.md` |
| Stripe, droits, gratuit/payant | `08-STRIPE.md` |
| RGPD, textes légaux | `09-RGPD-JURIDIQUE.md` |
| tests | `10-TESTS.md` |
| écrans, états, accessibilité | `14-INTERFACE.md` |
| **avant toute décision d'architecture** | `13-RETOUR-EXPERIENCE-...md` |

## Règles non négociables
1. `git fetch origin && git reset --hard origin/develop` en PREMIÈRE commande
   de chaque session, avant même de lire le code. Puis `npm ci`.
2. Aucun commit ne reste local en fin de session.
3. Un seul agent écrit sur `develop` à la fois.
4. `src/socle/` ne s'écrit jamais pour un besoin métier. Si le socle ne
   convient pas, on lui ajoute un PARAMÈTRE ; on ne le duplique pas.
5. Aucun secret dans Git. Aucun montant dans le code. Aucune couleur
   littérale hors de `app.config.ts`.
6. Avant de pousser : `npm run typecheck && npm test && npm run build`.
   Si `supabase/` est touché : `npm run test:sql` en plus.
7. Un défaut corrigé = un test ajouté. Sans exception.

## Ce qui doit m'être demandé avant d'agir
- toute migration appliquée à la base de production ;
- tout passage de Stripe en mode Live ;
- toute modification de variable d'environnement en production ;
- tout choix qui contredit `docs/00-PROJET.md`.
```

### `AGENTS.md` — la mémoire du projet

Vide au départ, sauf trois lignes : la branche de production, la pile
technique, et le produit en une phrase. L'agent l'enrichit à chaque session —
c'est ce qui évite de réexpliquer le contexte à chaque fois.

## 3. Découper en sessions

Une session = **un jalon vérifiable par toi en moins de cinq minutes**.
Jamais « construis l'application ».

| # | Session | Jalon vérifiable |
|---|---|---|
| 1 | Socle et configuration | `npm run dev` démarre en mode démo, aux bonnes couleurs et au bon nom |
| 2 | Dépôt, CI, Vercel | premier déploiement en ligne, CI verte, hash de version affiché |
| 3 | Supabase et migrations du socle | inscription réelle → profil + workspace + consentement en base |
| 4 | Modèle de données métier | migrations métier appliquées, tests d'isolation au vert |
| 5 | Écrans métier | parcours principal utilisable de bout en bout sur téléphone |
| 6 | PWA | installation réussie sur ton iPhone, icône non rognée |
| 7 | Notifications | une alerte réelle reçue sur ton appareil |
| 8 | Paiement | paiement Stripe Test → droit crédité |
| 9 | RGPD et textes légaux | export téléchargé, suppression testée |
| 10 | Durcissement et bêta | checklist parcourue, P0/P1 à zéro |

Les sessions 4 et 5 se répètent autant de fois qu'il y a de domaines métier.
Les autres passent une fois.

## 4. Amorcer une session

Prompt type — court, parce que le contexte est dans les fichiers :

> Session 4 — modèle de données métier.
>
> Lis `CLAUDE.md`, `docs/00-PROJET.md` et `docs/app-starter/04-SUPABASE.md`
> (en particulier le § 8 sur l'ajout du métier sans toucher au socle).
>
> Écris les migrations métier dans `supabase/migrations/metier/`, numérotées à
> partir de `01001`, en suivant le gabarit du § 8.3. Décide quelles tables
> doivent être verrouillées en lecture seule selon le critère du § 8.4, et
> justifie chaque décision en tête de migration.
>
> Écris la suite de tests correspondante. `npm run test:sql` doit passer.
>
> **N'applique rien à la base de production.** Tu me diras quoi appliquer et
> dans quel ordre.
>
> Termine par : ce que tu as fait, ce que tu as décidé et pourquoi, ce qui
> reste ouvert.

Trois éléments à toujours inclure : **les documents à lire**, **le jalon**,
**ce qui est interdit sans ton accord**.

## 5. Vérifier le travail

Ne pas croire le rapport de fin de session. Constater :

| Affirmation | Comment tu vérifies |
|---|---|
| « c'est déployé » | le hash de version dans l'application |
| « les tests passent » | l'onglet Actions du dépôt, pas la sortie de l'agent |
| « la migration est appliquée » | une requête sur la base |
| « c'est sécurisé » | une lecture croisée entre deux comptes |
| « c'est installable » | ton iPhone |

Cette discipline vient d'un incident réel : un audit complet a tourné sur une
branche en retard de 68 commits et a produit un diagnostic entièrement faux,
sans qu'aucune erreur n'apparaisse (`13-RETOUR-EXPERIENCE...` § 1.3).

## 6. Le cas de la première application

Le dépôt `app-starter` n'existe pas encore : le blueprint décrit comment le
fabriquer (`APP-STARTER-SPEC.md`), il ne le remplace pas.

Deux stratégies possibles.

**A — Fabriquer le starter d'abord.** 11 à 15 jours de chantier séparé, sans
application au bout. Propre, mais long et démotivant.

**B — Faire naître le starter par la première application.** L'agent extrait
de Coparentalité Zen au fur et à mesure des besoins réels, en suivant
l'inventaire du § 2 de `APP-STARTER-SPEC.md`. À la fin, on remonte ce qui
s'est révélé générique dans un dépôt `app-starter`.

**La stratégie B est recommandée**, pour une raison précise : l'exercice du
suivi de comptes (`12-EXEMPLE-SUIVI-COMPTES.md`) a déjà révélé trois manques
que l'audit seul n'avait pas vus. Un socle conçu dans le vide contient
toujours des abstractions inutiles et des manques invisibles. Un socle extrait
d'un usage réel, non.

Dans ce cas, donner à l'agent l'accès en **lecture** au dépôt Coparentalité
Zen, avec cette consigne explicite :

> Coparentalité Zen est une **référence de lecture seule**. Tu ne la modifies
> jamais. Tu en recopies des briques en les généralisant selon
> `APP-STARTER-SPEC.md` § 2. Toute notion de foyer, parent, enfant, garde,
> planning ou dépense partagée est **interdite** dans le nouveau dépôt. Après
> chaque extraction, vérifie :
> `grep -ri "coparent\|foyer\|garde\|enfant" src/ supabase/` doit ne rien
> renvoyer.

## 7. Quand une brique semble absente du blueprint

Cela arrivera, et c'est presque toujours le même malentendu. Le blueprint dit
**pourquoi** et **quoi**, rarement **comment, ligne à ligne**. Il documente une
architecture ; il ne contient pas le code.

Face à un manque signalé par l'agent — ou constaté par toi — poser les
questions dans cet ordre :

**1. Est-ce vraiment absent, ou seulement décrit sans code ?**
Chercher dans le sommaire. Exemple vécu : « la mise à jour de la PWA installée
n'est pas prévue » — elle l'était, dans `06-PWA.md` § 2, mais sous forme de
principe. L'agent, ne trouvant pas de code, a conclu à une absence et
réimplémenté à sa façon. C'est la panne la plus probable de ce dispositif.

**2. Le code existe-t-il dans Coparentalité Zen ?**
`APP-STARTER-SPEC.md` § 2 donne, pour chaque brique, **le fichier source
exact** et le traitement à appliquer (copie / généralisation / à écrire). Si la
ligne existe et n'est pas marquée **N**, le code existe : il faut le lire, pas
le réinventer.

**C'est le remède structurel : donner à l'agent l'accès en lecture au dépôt
Coparentalité Zen.** Sans cet accès, il produit une réimplémentation
approximative de briques déjà éprouvées en production — et refait les erreurs
documentées au chapitre 13. Consigne à lui donner :

> `coparentalite-zen` est une **référence en lecture seule**. Avant
> d'implémenter une brique du socle, consulte
> `docs/app-starter/APP-STARTER-SPEC.md` § 2 : si la brique y figure avec un
> fichier source, lis ce fichier et généralise-le. N'improvise une
> implémentation que pour les lignes marquées **N** (à écrire).

**3. Est-ce marqué « à écrire » ?**
Les lignes **N** du § 2 et la liste des chantiers du § 3 recensent ce qui
n'existe nulle part : ESLint, `error.tsx`, `verifier-config.ts`,
`generer-theme.ts`, liste paginée, module d'import, graphiques. Là, l'agent
doit effectivement créer — et sa production doit remonter dans le starter.

**4. Est-ce un manque réel du blueprint ?**
Alors il faut le corriger **dans le blueprint**, pas seulement dans
l'application en cours. Sinon la prochaine application rencontrera le même
trou. C'est la boucle de retour d'`APP-STARTER-SPEC.md` § 5.

## 8. Ce qui fait échouer une délégation

- **Un brief flou.** L'agent comble les trous sans le dire.
- **Une session trop large.** « Construis le paiement » produit du volume non
  vérifiable ; « fais qu'un paiement Test crédite un droit » produit un jalon.
- **Aucune vérification indépendante.** Le rapport de fin de session est une
  intention, pas un constat.
- **Deux agents sur la même branche.** Cause vérifiée d'un conflit resté
  commité plusieurs jours sur Coparentalité Zen.
- **Laisser modifier le socle « juste pour cette fois ».** C'est ainsi qu'un
  socle générique meurt, en trois semaines.
- **Ne pas faire remonter les enseignements.** Un défaut corrigé seulement
  dans l'application fille se représentera dans la suivante.

## 9. Ce qui reste ta décision, jamais la sienne

Le problème résolu · la cible · le périmètre du MVP · le modèle économique et
**où passe la limite** entre gratuit et payant · le ton et le vocabulaire ·
l'application d'une migration en production · le passage de Stripe en Live ·
l'ouverture de la bêta · le GO de mise en production.

L'agent construit. Il ne décide pas ce qui vaut la peine d'être construit.
