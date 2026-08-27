# App Starter — blueprint de création d'applications

Documentation issue de l'audit du code réel de Coparentalité Zen
(branche `develop`, commit `bee66f3`).

**Objet :** permettre de créer de nouvelles applications (suivi de comptes,
budget, suivi administratif, autre) en réutilisant le socle technique —
authentification, Supabase, sécurité, PWA, notifications, Stripe, RGPD, tests,
GitHub, Vercel — sans le reconstruire.

**Ce dossier ne modifie pas Coparentalité Zen.** C'est une documentation.

---

## Sommaire

| Fichier | Contenu |
|---|---|
| [`00-VISION.md`](./00-VISION.md) | Objet, principes, frontière socle/métier |
| [`01-ARCHITECTURE.md`](./01-ARCHITECTURE.md) | **Audit du dépôt réel**, séparation socle/métier, architecture cible, configuration centralisée |
| [`02-INSTALLATION.md`](./02-INSTALLATION.md) | Définir le projet, créer l'application |
| [`03-GITHUB-VERCEL.md`](./03-GITHUB-VERCEL.md) | Dépôt, branches, CI, déploiement, domaine, crons |
| [`04-SUPABASE.md`](./04-SUPABASE.md) | Projet, migrations, RLS, grants, storage, ajout du métier |
| [`05-AUTH-SECURITE.md`](./05-AUTH-SECURITE.md) | Comptes, garde, en-têtes, secrets, erreurs, logs |
| [`06-PWA.md`](./06-PWA.md) | Manifeste, service worker, icônes, iOS/Android |
| [`07-NOTIFICATIONS-EMAIL.md`](./07-NOTIFICATIONS-EMAIL.md) | Moteur générique, Push, Resend, branchement métier |
| [`08-STRIPE.md`](./08-STRIPE.md) | Test → produits → Checkout → webhook → droits → Live |
| [`09-RGPD-JURIDIQUE.md`](./09-RGPD-JURIDIQUE.md) | Consentement, export, suppression, textes, médiateur |
| [`10-TESTS.md`](./10-TESTS.md) | Six niveaux, banc SQL fidèle, parcours complet |
| [`11-BETA-PRODUCTION.md`](./11-BETA-PRODUCTION.md) | P0/P1, bêta privée, GO/NO-GO, mise en production |
| [`12-EXEMPLE-SUIVI-COMPTES.md`](./12-EXEMPLE-SUIVI-COMPTES.md) | Épreuve de généricité sur une application de comptes |
| [`13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md`](./13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md) | 30 problèmes vérifiés, causes, corrections, préventions |
| [`14-INTERFACE.md`](./14-INTERFACE.md) | Layout, navigation, états, accessibilité, écriture |
| [`15-TRAVAILLER-AVEC-CLAUDE-CODE.md`](./15-TRAVAILLER-AVEC-CLAUDE-CODE.md) | **Déléguer la construction à un agent** : dispositif, sessions, jalons, vérification |
| [`CHECKLIST-NOUVELLE-APPLICATION.md`](./CHECKLIST-NOUVELLE-APPLICATION.md) | Checklist universelle, idée → commercialisation |
| [`APP-STARTER-SPEC.md`](./APP-STARTER-SPEC.md) | **Plan de fabrication du dépôt template** |

---

## Par où commencer

- **Comprendre la méthode** → `00-VISION.md` puis `01-ARCHITECTURE.md`
- **Créer une application maintenant** → `02-INSTALLATION.md` + la checklist
- **Construire réellement le starter** → `APP-STARTER-SPEC.md`
- **Déléguer la construction à un agent** → `15-TRAVAILLER-AVEC-CLAUDE-CODE.md`
- **Ne pas répéter nos erreurs** → `13-RETOUR-EXPERIENCE-COPARENTALITE-ZEN.md`

## État juridique de Coparentalité Zen (2026-08-28)

| Élément | État |
|---|---|
| SIREN | **obtenu et renseigné** |
| Dénomination, adresse, responsable de publication | à confirmer via `/api/diagnostic` |
| Médiateur de la consommation | **manquant — bloquant** |
| DPA sous-traitants | **non signés — bloquant** |
| Textes juridiques | non relus par un professionnel |

## Points restant à valider

Marqués « À VALIDER » dans les documents :

- relecture des textes juridiques par un professionnel ;
- DPA avec Supabase, Vercel, Resend et Stripe ;
- statut de Vercel Analytics au regard du consentement cookies ;
- remplacement de `unsafe-inline` / `unsafe-eval` dans la CSP par des `nonce` ;
- service de suivi d'erreurs externe pour une application à trafic réel.
