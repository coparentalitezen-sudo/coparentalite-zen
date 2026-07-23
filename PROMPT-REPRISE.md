# PROMPT DE REPRISE — Projet « Coparentalité Zen »

Tu reprends un projet SaaS existant, déjà développé, déjà déployé et partiellement testé. Tu n'en es pas l'auteur, mais tu dois le connaître comme si tu l'avais écrit. Lis intégralement ce document avant toute action. Le code source complet est fourni avec ce prompt (archive ZIP) et hébergé sur GitHub.

---

## 1. Le produit

**Coparentalité Zen** — application web progressive (PWA) pour parents séparés. Promesse : « Le planning de garde et le budget partagé des parents séparés, réunis dans une seule application simple et apaisante. »

Quatre problèmes à résoudre : ne plus se tromper sur les jours de garde ; savoir qui a payé quoi ; calculer automatiquement les montants à régulariser ; conserver justificatifs et historique fiable.

Propriétaire : entrepreneur solo, marque **ParentZenFrance**, marché francophone. Il vend déjà des fichiers Excel/Google Sheets de coparentalité sur Etsy/Payhip/Gumroad ; cette application en est la version SaaS.

Modèle économique prévu : Gratuit / Premium 4,99 €/mois / Professionnel-Médiateur 14,99 €/mois. Architecture Stripe préparée (tables `plans`, `subscriptions`) mais paiement volontairement hors MVP.

## 2. Accès et environnements

| Élément | Valeur |
|---|---|
| Application en ligne | https://coparentalite-zen-yvtn.vercel.app |
| Dépôt GitHub | `coparentalitezen-sudo/coparentalite-zen` (privé, branche `main`) |
| Projet Supabase | ref `terjitzvmalggytqpjpc` · https://terjitzvmalggytqpjpc.supabase.co |
| Clé publiable (client) | `sb_publishable_ugA-lYxtiB-LrVuSFMCQ-w_PFx-cAAA` |
| Hébergement | Vercel (plan Hobby), déploiement auto depuis `main` |

Variables d'environnement (`.env.production`, committé — ces valeurs sont publiques par conception) :
```
NEXT_PUBLIC_SUPABASE_URL=https://terjitzvmalggytqpjpc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ugA-lYxtiB-LrVuSFMCQ-w_PFx-cAAA
```

**Ne jamais exposer la clé `service_role` côté client.** Elle n'est pas utilisée dans le code actuel.

### Piège de déploiement à connaître
Vercel **ignore les commits dont l'auteur Git est inconnu du compte GitHub**. Les 6 premiers commits poussés avec une adresse arbitraire n'ont jamais été déployés (l'app est restée bloquée sur la version initiale pendant une heure). Configurer impérativement :
```
git config user.email "308161725+coparentalitezen-sudo@users.noreply.github.com"
git config user.name "coparentalitezen-sudo"
```
Après chaque push, **vérifier que la nouvelle version est réellement servie** (voir §8).

## 3. Stack technique

Next.js 15.5 (App Router) · React 19 · TypeScript 5.8 en mode strict (⚠️ ne pas passer à TS 7, incompatible avec Next 15) · Tailwind CSS 4 · Supabase (Auth, PostgreSQL 16, Storage, RLS) · Vercel · Vitest 4 · Playwright · Capacitor prévu pour le natif ultérieur.

## 4. Arborescence

```
src/
  app/
    page.tsx                  page commerciale publique
    connexion/ inscription/ mot-de-passe-oublie/ reinitialisation/
    auth/callback/route.ts    échange du code des liens e-mail
    invitation/[token]/       acceptation d'invitation
    app/                      espace connecté (layout + 5 onglets)
      accueil/ planning/ ajouter/ depenses/ plus/ foyer/
    manifest.ts globals.css layout.tsx
  components/ui.tsx           ParentBadge, StatusPill, BottomNav
  lib/
    custody.ts                moteur de planning de garde  (testé)
    money.ts                  moteur monétaire             (testé)
    files.ts                  validation des justificatifs (testé)
    actions.ts                couche d'accès aux données Supabase
    demo-data.ts              données d'exemple
    supabase/client.ts server.ts
  middleware.ts               session + protection de /app/*
supabase/
  migrations/00001..00005     schéma, RLS, seed, fonctions, Storage
  tests/                      tests SQL d'isolation et de flux
public/branding/              logo officiel + variantes + charte
emails/                       9 modèles transactionnels (HTML + texte)
juridique/                    textes RGPD provisoires
e2e/ tests/                   Playwright et Vitest
supabase-setup-complet.sql    script d'installation idempotent (1162 lignes)
```

## 5. Base de données

33 tables. Conventions **non négociables** :
- Montants en **centimes entiers** (`bigint`) — jamais de flottants.
- Pourcentages en **points de base** (10000 = 100 %).
- Suppression **logique** (`deleted_at`) ; jamais de DELETE sur `expenses`, `messages`, `audit_logs`, `expense_comments` (valeur probatoire).
- `expense_comments` et `audit_logs` sont **immuables** (aucune policy update/delete).

Sécurité RLS : isolation stricte par foyer via `is_member()`, `member_role_in()`, `can_write()`, `is_parent()` (SECURITY DEFINER, `search_path` verrouillé). **Attention** : `can_write` et `is_parent` doivent contenir un `coalesce(..., false)` — sans lui, un non-membre obtient NULL, et `IF NOT NULL` en PL/pgSQL ne bloque rien. Cette faille a réellement existé et a été corrigée ; ne pas la réintroduire.

Rôles : `owner`, `parent`, `step_parent`, `viewer`, `mediator`, `admin`. Les données médicales des enfants (`allergies`, `medical_notes`) ne sont accessibles qu'aux parents, via la vue `children_medical` — ne jamais lire ces colonnes directement.

Fonctions serveur (migration 00004) : `handle_new_user` (trigger sur `auth.users`), `create_household`, `create_invitation`, `accept_invitation`, `revoke_invitation`, `export_my_data`, `delete_household`, `delete_my_account`.

Storage : buckets privés `justificatifs` (10 Mo) et `documents` (20 Mo). Convention de chemin **obligatoire** : `{household_id}/{uuid}.{ext}` — les policies en déduisent le foyer. Le nom d'origine n'apparaît jamais dans le chemin (conservé en base dans `file_name`). Accès par URL signée 5 minutes.

Toutes les migrations sont **idempotentes** (vérifié par 3 exécutions consécutives + une interruption simulée en plein milieu). Garder cette propriété pour toute nouvelle migration.

## 6. Moteurs métier (le cœur du produit)

**`custody.ts`** — 6 rythmes : une semaine sur deux, semaines paires, semaines impaires, un week-end sur deux, 2-2-3, 2-2-5-5, plus rythme libre. Hiérarchie de priorité stricte : `règle régulière < vacances scolaires < exception < échange accepté`. `buildSchedule()` produit des périodes continues, `validateSchedule()` vérifie l'absence de trou et de chevauchement.

**`money.ts`** — `splitAmount()` répartit un montant selon des règles (pourcentage, montant fixe, mixte) avec la méthode du **plus fort reste** : la somme des parts égale toujours exactement le total, aucun centime perdu ni créé. `computePairBalance()` calcule le solde net. `balanceLabel()` produit les formulations neutres imposées : « Vous devez recevoir X € » / « Vous avez X € à régulariser » / « Les comptes sont équilibrés ».

## 7. État réel — ce qui marche, ce qui ne marche pas

### Fonctionne et vérifié en production
- Inscription, connexion, session, middleware de protection de `/app/*`.
- Création automatique du profil à l'inscription (trigger).
- Création de foyer (le propriétaire a bien le rôle `owner`).
- Création d'invitation (lien affiché, jeton à usage unique, 7 jours).
- Base de données complète installée (33 tables, 84 policies RLS, 8 policies Storage, 2 buckets, 17 catégories, 3 plans, vacances 2026-2027).

### Développé mais non validé en conditions réelles
- Acceptation d'invitation par un second compte (bloquée par le point ci-dessous).
- Création de dépense réelle + dépôt de justificatif.
- Export RGPD, suppression de compte et de foyer.
- Réinitialisation du mot de passe.

### Blocage actuel — à diagnostiquer en priorité
La **création du second compte échoue** et la **réinitialisation du mot de passe ne fonctionne pas**. Cause **non établie**. Une hypothèse de limite d'envoi d'e-mails Supabase a été avancée mais **le propriétaire indique n'avoir demandé qu'une seule réinitialisation** — l'hypothèse n'est donc pas confirmée. **Diagnostiquer avant de conclure** : Supabase Dashboard → Authentication → Logs, et Auth → Users (le compte `tchargement93@gmail.com` existe-t-il ? est-il confirmé ?). Ne pas proposer de correctif sans avoir lu ces journaux.

### Non développé
Écrans Enfants, Documents, Messages, Rapports, Notifications ; rapports annuels, CSV, Excel, ICS ; envoi automatique des e-mails d'invitation ; Stripe ; export/suppression via interface testée ; reformulation neutre des messages.

### Écrans encore sur données d'exemple
Accueil, Planning, Dépenses affichent des données fictives (Camille, Julien, Léa, Noah) — **non branchés sur la base**. Un bandeau l'indique. Le seul écran réellement branché est **Plus → Paramètres du foyer**. **Priorité de reprise n°1** : brancher ces trois écrans sur les données réelles du foyer.

## 8. Tests existants — 76 au total, tous passants

```bash
npm run typecheck      # TypeScript strict, 0 erreur
npm test               # 40 tests Vitest (moteurs + fichiers)
npx playwright test    # 10 tests E2E Chromium sur le build de production
npm run build          # build Next.js
```
Tests SQL : `supabase/tests/rls_isolation_test.sql` (13 tests d'isolation entre foyers) et `flows_test.sql` (13 tests : invitations, export RGPD, suppressions). À rejouer sur un PostgreSQL 16 avec `auth.uid()` simulé, en rôle non privilégié.

Le test le plus important de `money.test.ts` vérifie 3 000 combinaisons montant × répartition : la somme des parts doit toujours égaler exactement le total. Ne jamais l'affaiblir.

**Vérifier qu'un déploiement est réellement en ligne** : récupérer une page publique et chercher un marqueur de version (un numéro de version est affiché sur l'écran Paramètres du foyer). Ne jamais annoncer une correction comme livrée sans cette vérification.

## 9. Règles de conception à respecter

- **Langue** : toute l'interface en français. Vocabulaire neutre et non accusatoire imposé : « montant à régulariser » (pas « dette »), « demande de modification » (pas « conflit »), « en attente de réponse » (pas « ignoré »), « dépense à vérifier » (pas « refusée »).
- **Identité visuelle** : logo officiel fourni dans `public/branding/`, à ne jamais redessiner ni recolorer. Couleurs mesurées sur le logo : navy `#4E6381`, corail `#E4A196`, sauge `#9AA791`, crème `#FCF9F6`, encre `#101B2C`. Corail et sauge ne passent pas le contraste AA en texte → réservés aux fonds ; variantes texte accessibles définies dans `globals.css`.
- **Accessibilité** : les deux parents ne sont **jamais** distingués par la couleur seule (toujours initiale + libellé). Cibles tactiles ≥ 44 px. Mobile first.
- **Honnêteté produit** : aucun bouton principal factice, aucune simulation présentée comme fonctionnelle, aucun faux témoignage. Les écrans non branchés doivent le dire.
- **Mention légale obligatoire** partout où c'est pertinent : « Coparentalité Zen est un outil d'organisation et de suivi. Il ne remplace ni une décision judiciaire, ni une convention parentale, ni un conseil juridique professionnel. »

## 10. Juridique et RGPD

`juridique/TEXTES-JURIDIQUES-PROVISOIRES.md` contient des brouillons de mentions légales, politique de confidentialité et CGU. **Ils ne sont pas validés.** Un juriste doit les relire avant toute commercialisation, avec cinq points signalés (dont la qualification des données de santé des enfants au titre de l'article 9 du RGPD, et la clause de médiation de la consommation obligatoire pour un service payant).

## 11. Méthode de travail attendue

Le propriétaire travaille **depuis un iPhone** : il ne peut ni lancer de commandes, ni ouvrir facilement des fichiers volumineux. En conséquence :
- Fournir le SQL et les instructions en **blocs copiables directement dans la conversation**, découpés si nécessaire.
- Donner **une seule instruction à la fois** et attendre son retour.
- Pour chaque action manuelle : le site à ouvrir, le lien exact, ce qu'il doit créer, les champs à remplir, ce qu'il doit transmettre, les erreurs à éviter.
- Il attend des livrables finis, pas des validations intermédiaires — mais il vérifie, et il a raison de le faire.
- **Ne jamais affirmer qu'une chose est testée si elle ne l'est pas.** Distinguer explicitement « développé », « testé en local », « vérifié en production ».

## 12. Feuille de route suggérée

1. Diagnostiquer le blocage de création de compte (journaux Supabase Auth) et le résoudre.
2. Terminer le parcours d'invitation à deux comptes réels.
3. Brancher Accueil, Planning et Dépenses sur les données réelles (priorité produit n°1).
4. Écran Enfants + configuration du rythme de garde par l'utilisateur.
5. Dépense réelle de bout en bout avec justificatif, puis validation/contestation par le second parent.
6. Export RGPD et suppression de compte testés en production.
7. Rapports PDF côté serveur (gabarit de référence dans `scripts/generate-rapport-pdf.py`).
8. E-mails transactionnels branchés (modèles dans `emails/`).
9. Validation juridique, puis Stripe.

---

**Première action attendue de ta part** : lire le code fourni, confirmer que tu as compris l'état réel du projet, puis proposer un plan pour le point 1 de la feuille de route — sans rien affirmer que tu n'aies vérifié.
