# 00 — Vision

> Ce dossier n'est pas la documentation de Coparentalité Zen.
> C'est le **mode d'emploi de fabrication d'applications**, extrait de
> Coparentalité Zen après audit de son code réel.

---

## Le problème que ce blueprint résout

Coparentalité Zen a coûté des mois. Une grande partie de ce temps n'a rien
coûté au **produit** : authentification, isolation des données, PWA
installable sur iPhone, notifications poussées, paiement Stripe, RGPD,
mentions légales, tests, chaîne de déploiement. Ces briques n'ont aucun
rapport avec la coparentalité. Elles seront identiques dans une application
de suivi de comptes, de budget ou de suivi administratif.

Les refaire une deuxième fois serait payer deux fois le même apprentissage —
y compris les erreurs, qui sont documentées ici parce qu'elles ont chacune
coûté des heures (voir `13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md`).

## Ce que ce blueprint produit

Un **App Starter** : un socle technique générique, sans aucune trace de
coparentalité, à partir duquel une nouvelle application démarre déjà
authentifiée, sécurisée, installable, facturable et conforme.

La promesse concrète : dans quelques mois, donner ce dossier à une IA avec la
consigne

> « Crée-moi une application de suivi de comptes bancaires à partir de mon App
> Starter. Voici son objectif et ses fonctionnalités. »

doit suffire pour que 100 % de l'effort de développement porte sur les
comptes, les transactions et les tableaux de bord — et zéro sur la connexion,
la RLS ou le webhook Stripe.

## Les trois catégories

Toute la méthode tient dans une distinction, appliquée sans exception :

| Catégorie | Définition | Exemple |
|---|---|---|
| **Socle** | Repris tel quel, sans une ligne modifiée | Auth, RLS, PWA, Stripe, RGPD |
| **Configuré** | Repris, mais paramétré par un fichier | Nom, couleurs, tarifs, textes légaux |
| **Métier** | Écrit spécifiquement pour cette application | Comptes, transactions, catégories |

Un composant qui ne rentre dans aucune de ces cases est un composant mal
conçu. Un composant du socle qui « connaît » le métier n'appartient pas au
socle : il faut soit le paramétrer, soit le déplacer.

## Les principes que l'audit a confirmés

Ces principes ne sont pas des opinions : ils sont visibles dans le code de
Coparentalité Zen, et chacun y a évité ou réparé un défaut réel.

**1. Une seule source de vérité par donnée.**
Les prix vivent dans la table `plans`, jamais dans le code (`src/lib/tarifs.ts`
ne contient aucun montant). Trois prix différents avaient coexisté dans le
projet. Annoncer un tarif et en facturer un autre se règle devant un
médiateur.

**2. La RLS filtre les lignes, les GRANT ouvrent les tables.**
Les deux sont nécessaires. La migration `00007_grants.sql` existe uniquement
parce que cette confusion a produit des « permission denied » en production.

**3. Les règles métier vivent dans des fonctions serveur, pas dans l'écran.**
Les tables comptables de Coparentalité Zen sont en lecture seule pour le rôle
applicatif ; toute écriture passe par une fonction `SECURITY DEFINER` qui
vérifie l'identité et la cohérence. La RLS protège l'appartenance, pas
l'intégrité.

**4. Aucun faux succès silencieux.**
Le type `ActionResult` (`src/lib/actions/core.ts`) impose de choisir entre
`ok`, `demo` et `error` avec un message lisible. C'est ce qui a permis de
diagnostiquer les défauts de production sans deviner.

**5. Une fonctionnalité non configurée se désactive, elle ne casse pas.**
Sans clés Stripe, `configStripe()` renvoie `null` et l'écran d'offre annonce
l'indisponibilité ; l'application reste utilisable. Même principe pour Push,
e-mail et Supabase (mode démonstration).

**6. Le banc de test doit reproduire l'environnement réel, pas un environnement
commode.**
`scripts/test-sql.sh` installe `pgcrypto` dans le schéma `extensions` et crée
un rôle `service_role` **précisément parce que** ne pas le faire avait laissé
passer deux pannes en production.

**7. Honnêteté produit.**
Aucun bouton factice, aucune donnée décorative, aucune promesse que le produit
ne tient pas. Un écran incomplet le dit.

## Ce que ce blueprint n'est pas

- Ce n'est pas une copie de Coparentalité Zen. Aucune notion de foyer, de
  parent, d'enfant ou de garde n'entre dans le socle.
- Ce n'est pas un framework. C'est un **dépôt de départ** que l'on clone et
  que l'on modifie librement ensuite.
- Ce n'est pas figé. Chaque nouvelle application qui découvre un manque doit
  le remonter dans le starter (voir la boucle de retour dans
  `APP-STARTER-SPEC.md`).

## Ordre de lecture

| Vous voulez… | Lisez |
|---|---|
| comprendre la frontière socle/métier | `01-ARCHITECTURE.md` |
| démarrer une nouvelle application | `02-INSTALLATION.md` puis la checklist |
| brancher l'infrastructure | `03` à `08` dans l'ordre |
| ne pas vous faire rattraper par le droit | `09-RGPD-JURIDIQUE.md` |
| savoir quand vous pouvez ouvrir la bêta | `11-BETA-PRODUCTION.md` |
| voir la méthode appliquée | `12-EXEMPLE-SUIVI-COMPTES.md` |
| éviter nos erreurs | `13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md` |
| construire réellement le starter | `APP-STARTER-SPEC.md` |

---

**État de Coparentalité Zen au moment de cet audit :** branche `develop`,
commit `bee66f3`, 49 migrations, 43 suites de tests unitaires, 21 suites SQL,
1 fichier de parcours Playwright. Aucune modification n'a été apportée au
projet : cette mission est un audit, pas une refonte.

**Mise à jour du 2026-08-28 :** le **SIREN a été obtenu et renseigné**. Le
verrou juridique restant avant commercialisation est le **médiateur de la
consommation** (`LEGAL_MEDIATOR`), auquel s'ajoutent les DPA des
sous-traitants. Vérifier au passage que `identiteComplete()` renvoie bien
`true` — le SIREN seul n'y suffit pas (voir `09-RGPD-JURIDIQUE.md` § 7).
