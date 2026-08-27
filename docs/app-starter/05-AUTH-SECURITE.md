# 05 — Authentification, comptes et sécurité

Ce que le socle fournit et qui ne doit jamais être réécrit par application.

---

## 1. Parcours de compte livrés par le socle

| Écran | Route | Contenu |
|---|---|---|
| Inscription | `/inscription` | e-mail, mot de passe, acceptation CGU **explicite** |
| Connexion | `/connexion` | + paramètre `?suite=` pour revenir où l'on allait |
| Mot de passe oublié | `/mot-de-passe-oublie` | envoi du lien |
| Réinitialisation | `/reinitialisation` | nouveau mot de passe |
| Retour de lien e-mail | `/auth/callback` | échange du code contre une session |
| Paramètres | `/app/parametres` | profil, préférences, export, suppression |

**L'acceptation des CGU est enregistrée**, pas seulement affichée : une ligne
dans `consent_logs` avec le type, la version des textes et l'horodatage. Sans
cette trace, prouver le consentement est impossible.

## 2. Création automatique du profil

`auth.users` appartient à Supabase ; `profiles` est le miroir applicatif. Le
lien est un trigger, jamais un appel depuis l'application (qui pourrait
échouer après l'inscription et laisser un compte sans profil) :

```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name',
                   split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

Le `on conflict do nothing` rend le trigger rejouable. Le `revoke` de la
migration de durcissement empêche tout appel RPC direct.

## 3. La garde d'authentification

`src/middleware.ts`. Trois responsabilités, dans cet ordre :

1. **canonisation du domaine** — rediriger les hôtes obsolètes nommément
   désignés (307, jamais 308, jamais par motif générique) ;
2. **sortie anticipée** — si le chemin n'est pas protégé, ne rien faire ;
3. **contrôle de session** — rafraîchir la session, rediriger vers
   `/connexion?suite=<chemin>` si absente, ou vers l'accueil si un utilisateur
   connecté visite une page d'authentification.

Chemins protégés déclarés dans `app.config.ts` :

```ts
cheminsProteges: ['/app', '/connexion', '/inscription'],
```

Le `matcher` reste large (la canonisation doit s'appliquer partout) mais
exclut `api`, `_next/static`, `_next/image` et les fichiers à extension. Le
contrôle de session, lui, se limite aux chemins listés.

⚠ **Un service worker casse les redirections du middleware** s'il ne relaie
pas la réponse en mode `manual` : la garde d'authentification tombe alors en
erreur. Le worker du socle en tient compte.

⚠ **Le middleware ne remplace pas la RLS.** Il empêche d'afficher un écran ;
il n'empêche pas de lire une donnée. La sécurité réelle est en base. Une
application dont la sécurité repose sur le middleware est une application non
sécurisée.

## 4. Mode démonstration

Sans variables Supabase, tous les clients renvoient `null`, le middleware
laisse passer, l'interface affiche un bandeau. Trois bénéfices constatés :

1. la CI construit et teste sans identifiants réels ;
2. l'interface se travaille avant l'existence d'une base ;
3. une variable manquante en production **dégrade** l'application au lieu de
   la faire tomber en page blanche.

## 5. En-têtes de sécurité

Dans `next.config.mjs`, appliqués à toutes les réponses :

| En-tête | Valeur | Rôle |
|---|---|---|
| `Content-Security-Policy` | voir ci-dessous | limite les origines |
| `X-Content-Type-Options` | `nosniff` | pas d'interprétation de type |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | fuite d'URL limitée |
| `X-Frame-Options` | `DENY` | anti-détournement de clic |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self)` | capteurs coupés |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS forcé |

CSP de référence, éprouvée en production :

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self' https://checkout.stripe.com;
img-src 'self' blob: data: https:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com;
worker-src 'self' blob:;
manifest-src 'self';
```

Les entrées Stripe sont conditionnées par `features.paiement` : une
application sans paiement ne doit pas les autoriser. Ajouter un service tiers
signifie **ajouter son origine ici** — sinon les appels sont silencieusement
bloqués par le navigateur.

À VALIDER dans une version ultérieure du socle : `'unsafe-inline'` et
`'unsafe-eval'` dans `script-src` affaiblissent la protection. Les remplacer
par des `nonce` demande un travail sur le rendu Next et n'a pas été fait sur
Coparentalité Zen.

## 6. Frontière serveur / navigateur

Trois règles simples, appliquées sans exception :

1. **Tout ce qui n'est pas préfixé `NEXT_PUBLIC_` est un secret.** Le préfixe
   inscrit la valeur dans le paquet JavaScript envoyé au navigateur.
2. **Tout module lisant un secret porte `import 'server-only'`.** Une
   importation depuis un composant client devient alors une erreur de
   compilation, pas une valeur vide en production.
3. **Aucun `process.env` hors de `src/config/env.ts`.** Vérifié par
   `scripts/verifier-config.ts`.

⚠ Le cas réel qui a motivé la règle 2 : un module d'identité légale lisant des
variables sans préfixe, importé depuis un composant client, aurait affiché
« À compléter » sur des mentions légales publiques.

⚠ Cas réel de la règle 1 dans l'autre sens : une consigne de rédaction (« ton
adresse e-mail de contact ») s'est retrouvée dans une variable
d'environnement, prête à s'afficher publiquement. Le socle **valide le format**
des valeurs affichées : une adresse e-mail doit ressembler à une adresse,
sinon on affiche « À compléter ».

## 7. Gestion des erreurs

### 7.1 Côté données

Le type `ActionResult` interdit le faux succès silencieux :

```ts
export type ActionResult<T = undefined> =
  | { status: 'ok'; data: T }
  | { status: 'demo' }
  | { status: 'error'; message: string; details?: string };
```

Le message est **lisible par un utilisateur** ; les détails techniques
n'apparaissent qu'en développement et pendant la bêta, dans un dépliant.

⚠ Le `lisible()` de Coparentalité Zen contient une expression régulière de
mots métier (`foyer|parent|montant|…`) pour laisser passer les messages des
fonctions serveur. **Ce mécanisme est fragile** et doit être remplacé dans le
starter par un préfixe conventionnel :

```sql
raise exception 'APP: Le libellé du compte est requis';
```

Tout message préfixé `APP:` est transmis tel quel à l'utilisateur (préfixe
retiré) ; tout autre est remplacé par un message générique. Plus de liste de
mots à maintenir.

### 7.2 Côté écran

Le socle fournit `error.tsx`, `global-error.tsx` et `not-found.tsx` à la
racine de `src/app/` — **absents de Coparentalité Zen**, ce qui laisse Next
afficher sa page d'erreur brute en cas de plantage de rendu.

Règle d'affichage : l'erreur apparaît **là où l'utilisateur agit**, pas en
haut de page.

### 7.3 Journalisation

Coparentalité Zen s'appuie sur `console.error` (28 occurrences) et les
Runtime Logs de Vercel. C'est suffisant pour une application seule, à trois
conditions inscrites dans le socle :

1. **Ne jamais journaliser de donnée personnelle** — un identifiant, jamais un
   contenu, jamais une adresse.
2. **Toujours journaliser un échec silencieux.** Le cas type : un `upsert`
   Supabase dont on ne lit que `data` ; en cas d'échec de clé étrangère,
   `data` vaut `null`, la fonction passe à la suite et l'écran affiche
   simplement un élément de moins, sans rien indiquer. Lire **systématiquement**
   `error` avant `data`.
3. **Un point de diagnostic** (`/api/diagnostic`) qui dit quelles variables
   sont présentes, jamais leur valeur, réservé aux utilisateurs authentifiés.

À VALIDER pour une application à trafic réel : un service de suivi d'erreurs
externe (Sentry ou équivalent) reste préférable, avec purge des données
personnelles à la source.

## 8. Audit et traçabilité

Le socle fournit `audit_logs` : table **immuable** (aucune policy update ni
delete), alimentée par les fonctions serveur.

À journaliser au minimum : création et suppression de workspace, changement de
rôle, invitation, suppression de compte, événement de facturation.

Les suppressions se font par `deleted_at` sur toute donnée à valeur
probatoire. Un `delete` réel n'est acceptable que pour une donnée sans valeur
de preuve — ou pour honorer un droit à l'effacement.

## 9. Checklist de sécurité avant production

- [ ] RLS active sur **toutes** les tables (vérification programmatique)
- [ ] chaque table a au moins une policy de lecture ; aucune table
      « ouverte par oubli »
- [ ] `service_role` utilisé uniquement dans webhook, tâches planifiées,
      sauvegarde
- [ ] aucun secret préfixé `NEXT_PUBLIC_`
- [ ] aucun secret dans l'historique Git (secret scanning activé)
- [ ] en-têtes de sécurité vérifiés sur le domaine réel
- [ ] tests d'isolation : un utilisateur A ne lit rien de B, même en
      connaissant un identifiant
- [ ] tentative d'écriture directe sur une table verrouillée : refusée
- [ ] `/api/diagnostic` inaccessible sans session
- [ ] mots de passe : politique de longueur minimale configurée dans Supabase
- [ ] limitation de débit sur l'authentification (réglages Supabase)
