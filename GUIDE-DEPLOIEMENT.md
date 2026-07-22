# Guide de déploiement — Coparentalité Zen

Ce guide te mène du code livré à une application en ligne. Durée totale estimée :
**60 à 90 minutes**, sans écrire une ligne de code.

---

## Actions strictement nécessaires de la part du propriétaire

Ces actions ne peuvent pas être faites à ta place (création de comptes, propriété
légale). Tout le reste est déjà prêt dans le code.

### Action 1 — Créer le projet Supabase (~15 min)
- **Plateforme :** Supabase · **Objectif :** base de données, authentification, stockage
- **Lien :** https://supabase.com/dashboard → « New project »
- **Étapes :** créer un compte (ou se connecter) → New project → nom `coparentalite-zen`
  → **région : choisir une région UE (ex. eu-west-3 Paris ou eu-central-1 Francfort)** —
  important pour le RGPD → mot de passe base de données : générer et conserver dans
  un gestionnaire de mots de passe.
- **À me transmettre ensuite (ou à saisir toi-même dans Vercel) :** `Project URL` et
  `anon public key` (menu Settings → API).
- **Erreurs à éviter :** ne jamais exposer la clé `service_role` côté client ;
  ne pas choisir une région hors UE.

### Action 2 — Appliquer les migrations (~10 min)
- **Lien :** tableau de bord Supabase → SQL Editor
- **Étapes :** copier-coller puis exécuter, dans l'ordre :
  `supabase/migrations/00001_schema.sql` → `00002_rls.sql` → `00003_seed.sql`.
  Chaque script doit se terminer sans erreur (« Success »).
- **Vérification :** Table Editor → les 33 tables apparaissent ; Authentication →
  Policies → les policies RLS sont listées.
- **Erreurs à éviter :** ne pas exécuter les scripts dans le désordre.

### Action 3 — Configurer le Storage (~5 min)
- **Étapes :** Storage → New bucket → nom `justificatifs`, **Public bucket : OFF** ;
  répéter avec `documents` (privé aussi).
- Ces buckets privés + URL signées sont utilisés par les justificatifs et documents.

### Action 4 — Déployer sur Vercel (~15 min)
- **Plateforme :** Vercel · **Lien :** https://vercel.com/new
- **Étapes :** créer un compte → importer le projet (déposer le dossier de l'app sur
  GitHub d'abord : https://github.com/new, puis « Import Git Repository » dans Vercel)
  → Framework : Next.js (détecté automatiquement) → Environment Variables :
  - `NEXT_PUBLIC_SUPABASE_URL` = Project URL (Action 1)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key (Action 1)
  → Deploy.
- **Vérification :** l'URL fournie par Vercel affiche la page d'accueil ; sans les
  variables, l'app resterait en mode démo (bandeau jaune).
- **Erreurs à éviter :** variables mal orthographiées (elles doivent commencer par
  `NEXT_PUBLIC_`).

### Action 5 — Configurer l'authentification (~10 min)
- **Étapes :** Supabase → Authentication → URL Configuration → Site URL = l'URL
  Vercel ; Redirect URLs : ajouter la même URL. Email Templates : personnaliser
  avec les gabarits du dossier `emails/` (facultatif au début, les modèles Supabase
  par défaut fonctionnent).
- **Test :** créer un compte sur l'app → l'e-mail de confirmation arrive →
  connexion OK.

### Action 6 — Nom de domaine (facultatif, ~15 min + achat)
- **Plateforme :** OVH, Gandi ou Namecheap · **Objectif :** ex. `coparentalitezen.fr`
- **Étapes :** acheter le domaine (~10-15 €/an) → Vercel → Settings → Domains →
  ajouter le domaine → suivre les instructions DNS affichées → mettre à jour la
  Site URL Supabase (Action 5).

### Action 7 — Validation juridique (avant toute vente)
- Faire relire `juridique/TEXTES-JURIDIQUES-PROVISOIRES.md` par un juriste et
  compléter l'identité légale. Points listés en fin de document.

### Action 8 — Stripe (plus tard, pour les offres payantes)
- **Lien :** https://dashboard.stripe.com/register
- L'architecture (tables `plans`, `subscriptions`) est prête ; l'intégration du
  paiement est volontairement hors MVP. Ne pas activer avant l'Action 7.

---

## Après le déploiement : vérifications obligatoires

Reprendre la liste de la section 31 du cahier des charges, sur l'app EN LIGNE :

1. Inscription réelle + e-mail de confirmation reçu.
2. Connexion / déconnexion / mot de passe oublié.
3. Test d'isolation en conditions réelles : créer 2 comptes, 2 foyers, vérifier
   qu'aucune donnée ne fuit (les tests SQL du dossier `supabase/tests/` peuvent
   être rejoués dans le SQL Editor pour confirmation).
4. Installation PWA sur un iPhone et un Android réels (Partager → Sur l'écran d'accueil).
5. Policies Storage : vérifier qu'un fichier d'un foyer n'est pas téléchargeable
   depuis l'autre foyer (URL signées uniquement).

## Coûts mensuels estimés au lancement

Supabase Free (0 €, suffisant pour démarrer, limite 500 Mo) · Vercel Hobby (0 €) ·
domaine ~1 €/mois lissé · e-mails transactionnels : inclus Supabase au début.
**Total : ~0-2 €/mois** jusqu'aux premiers utilisateurs payants, puis Supabase Pro
(25 $/mois) quand le foyer dépasse les limites gratuites.
