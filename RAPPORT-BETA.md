# RAPPORT BÊTA — Coparentalité Zen · 22/07/2026

**Vérification finale exécutée d'un seul tenant : build production (16 routes) ✓ · TypeScript strict ✓ · 40/40 tests unitaires ✓ · 10/10 tests E2E Chromium ✓ · 26/26 tests SQL (isolation + flux) rejoués depuis zéro ✓.**

## 1. Ce qui est maintenant fonctionnel

| Fonction | Détail |
|---|---|
| Authentification complète (code) | Connexion, inscription avec vérification d'e-mail, mot de passe oublié, réinitialisation, déconnexion, callback des liens e-mail, middleware qui protège `/app/*` et redirige les sessions actives, création automatique du profil à l'inscription (trigger testé T20) |
| Invitation du second parent | RPC `create_invitation` (e-mail normalisé, une invitation active par adresse), page d'acceptation par lien `/invitation/{token}`, jeton à usage unique, expiration 7 jours, révocation, écran Foyer complet |
| Justificatifs sécurisés | Validation MIME/taille côté client (miroir des contraintes BDD), chemin Storage `{foyer}/{uuid}.{ext}` sans le nom d'origine (anti-injection testée), policies Storage par foyer (migration 00005), URL signées 5 min, nettoyage si l'enregistrement BDD échoue, champ intégré au formulaire de dépense |
| Export RGPD | RPC `export_my_data` : profil, paramètres, consentements, notifications et tous les foyers (enfants, règles de garde, dépenses, remboursements, événements, demandes, documents) — sans les chemins de stockage internes ; téléchargement JSON depuis l'écran Foyer |
| Suppression compte & foyer | Double confirmation à l'écran ; foyer : propriétaire uniquement, suppression logique en cascade ; compte : retrait des foyers partagés, suppression du foyer si dernier membre, anonymisation de l'e-mail, suppression `auth.users` (révoque les sessions) |
| Dépense réelle | `createExpense` : insert + enfants + parts calculées par le moteur testé + justificatif, statut `sent`, erreurs en français |

## 2. Tests réellement réussis (76 au total)

- **26 tests SQL** sur PostgreSQL 16 réel, rôle non privilégié, rejoués depuis une base vierge : 13 d'isolation (T1-T14) + 13 de flux (T20-T32 : trigger profil, foyer, invitations — étranger bloqué, jeton unique, expiration —, export complet et borné au bon utilisateur, suppressions avec règle du dernier membre, extraction stricte des chemins Storage).
- **40 tests unitaires Vitest** : 34 moteurs (planning, argent, dont 3 000 combinaisons d'arrondis) + 6 nouveaux sur la validation de fichiers (types interdits, tailles, anti-injection de chemin).
- **10 tests E2E dans un vrai Chromium** sur le build de production : page commerciale (tarifs, mention légale), navigation 5 onglets, solde et planning calculés exacts, formulaire (validation, aperçu 60/40 au centime : 60,01 €/40,00 €), refus d'un .exe en justificatif, export et double confirmation de suppression, page d'invitation, pages d'auth, manifest PWA.

## 3. Deux anomalies détectées et corrigées pendant cette phase

1. **Faille réelle (sévérité haute, attrapée par T23)** : `can_write()` renvoyait NULL au lieu de FALSE pour un non-membre ; en PL/pgSQL, `IF NOT NULL` ne lève pas d'exception — un étranger pouvait créer une invitation via la RPC. Corrigé par `coalesce(..., false)` sur `can_write` et `is_parent`, chaîne complète rejouée, tous tests verts. Les policies RLS n'étaient pas affectées (NULL y vaut refus).
2. Faux positif de test (T31) : après suppression de son compte, l'utilisateur ne « voit » plus son foyer (RLS), le test ne pouvait donc pas constater la suppression — vérificateur hors-RLS ajouté, la suppression elle-même était correcte.

## 4. Ce qui reste bloqué (impossible depuis cet environnement)

- **Authentification contre un vrai Supabase** : le code utilise l'API officielle et compile, mais aucun projet Supabase n'est joignable depuis cette sandbox — l'envoi réel des e-mails de confirmation/réinitialisation et l'échange de session ne sont pas testés.
- **Policies Storage en conditions réelles** (migration 00005) : la logique de chemin est testée (T32), mais le schéma `storage` n'existe que sur Supabase.
- **E-mail d'invitation** : le lien est généré et affiché à l'écran (transmissible manuellement) ; l'envoi automatique par e-mail nécessite la configuration Supabase.
- Toujours hors périmètre de cette phase : rapports annuels/CSV/ICS, messagerie, notifications, écrans Enfants/Documents détaillés, Stripe, validation juridique.

## 5. Actions manuelles strictement indispensables

Une seule liste, dans l'ordre :

1. **Supabase** — https://supabase.com/dashboard → « New project » → nom `coparentalite-zen`, **région UE** (eu-west-3 Paris), mot de passe BDD généré et conservé. → Me transmettre (ou saisir directement en action 4) : `Project URL` + `anon public key` (Settings → API). Erreur à éviter : jamais la clé `service_role` côté client.
2. **Migrations** — SQL Editor du même tableau de bord → exécuter dans l'ordre `00001` → `00002` → `00003` → `00004` → `00005` (chacun doit finir en « Success »). Erreur à éviter : le désordre.
3. **Buckets** — Storage → New bucket → `justificatifs` (Public : OFF) puis `documents` (OFF).
4. **Vercel** — https://github.com/new (déposer le code) puis https://vercel.com/new → Import → variables `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Deploy. Erreur à éviter : faute de frappe dans les noms de variables (préfixe `NEXT_PUBLIC_` obligatoire).
5. **Auth** — Supabase → Authentication → URL Configuration → Site URL et Redirect URL = l'URL Vercel + `/auth/callback`. → Me transmettre : l'URL de l'app déployée pour que je pilote les tests réels (inscription, invitation entre 2 comptes, justificatif, export, suppression).
6. **Juriste** — faire valider `juridique/TEXTES-JURIDIQUES-PROVISOIRES.md` avant toute ouverture au-delà de testeurs privés.

## 6. Conclusion officielle

**Prêt pour une bêta privée — sous condition des actions 1 à 5 (≈ 1 heure), qui sont désormais les seuls éléments non testés.** Tout ce qui pouvait être développé et prouvé sans compte externe l'a été : 76 tests passent, build de production propre, les critères de la section 31 couverts en local (isolation, exactitude des montants, justificatifs sécurisés par conception, export des données, suppression du compte, écrans d'erreur et confirmations). Ce n'est **pas** encore une bêta publique ni une commercialisation : il faut d'abord la vérification en ligne du parcours d'authentification et des e-mails (action 5), puis la validation juridique (action 6).
