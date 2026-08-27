# 04 — Supabase et PostgreSQL

Étape 3 du mode opératoire, et étape 4 (ajouter le métier sans toucher au
socle). C'est le document le plus dense : la majorité des incidents de
production de Coparentalité Zen viennent de cette couche.

---

## 1. Créer le projet

1. supabase.com → *New project*.
2. **Région : la plus proche des utilisateurs et dans l'UE** si des données
   personnelles européennes sont traitées (Coparentalité Zen : Paris).
3. Mot de passe de base : long, conservé dans un gestionnaire de mots de
   passe. Il n'est plus affiché ensuite.
4. Noter la référence du projet (`<project-ref>`).

Récupérer dans *Settings → API* :

| Valeur | Variable | Nature |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | publique |
| clé publiable / anon | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publique |
| clé secrète / service_role | `SUPABASE_SERVICE_ROLE_KEY` | **secrète** |

⚠ Les deux clés historiques sont des JWT visuellement identiques (préfixe
`eyJhbGci`). Les intervertir donne une configuration en apparence correcte et
des appels refusés sans explication. Le socle inclut la parade constatée dans
`src/app/api/diagnostic/route.ts` : lire le champ `role` de la charge utile du
jeton, ou le préfixe (`sb_secret_` / `sb_publishable_`) pour les clés
récentes — sans jamais afficher la clé.

## 2. Authentification

*Authentication → Providers* : activer Email. Décider de la confirmation
d'adresse (recommandée).

*Authentication → URL Configuration* :

- **Site URL** : le domaine de production.
- **Redirect URLs** : ajouter le domaine, `http://localhost:3000/**` et le
  motif de prévisualisation Vercel si la connexion doit y fonctionner.

⚠ Une URL de redirection absente de cette liste produit un lien de
réinitialisation qui échoue sans message clair. C'est la première chose à
vérifier quand « le lien du mail ne marche pas ».

*Authentication → Email Templates* : personnaliser au nom de l'application.
Le lien pointe vers `/auth/callback`.

## 3. Les trois clients

Le socle en fournit trois, et **seulement** trois :

| Client | Fichier | Rôle | Usage |
|---|---|---|---|
| navigateur | `socle/supabase/client.ts` | `anon` + session | composants clients |
| serveur | `socle/supabase/server.ts` | `anon` + session via cookies | Server Components, Route Handlers |
| service | `socle/supabase/server.ts` (`supabaseService`) | `service_role`, **RLS contournée** | traitements sans utilisateur |

**Le client de service ne s'utilise que là où il n'y a pas d'utilisateur** :
webhook de paiement, tâche planifiée, sauvegarde. Toute autre utilisation est
un défaut de conception.

Contre-exemple positif dans Coparentalité Zen : l'export RGPD est construit
avec **la session du demandeur**, jamais avec la clé de service. Les règles de
sécurité s'appliquent donc telles quelles et nul ne peut obtenir par ce chemin
ce qu'il ne voit pas déjà à l'écran.

Les trois renvoient `null` si les variables manquent → mode démonstration.

## 4. Discipline de migration

Fichiers dans `supabase/migrations/`, numérotés, **jamais modifiés une fois
appliqués**. Une correction est une nouvelle migration.

Toute migration doit être :

- **idempotente** — `create or replace`, `if not exists`,
  `drop policy if exists`, gardes explicites sur les contraintes ;
- **transactionnelle** quand c'est possible — `begin` / `commit` ;
- **testée** — une suite dans `supabase/tests/` couvrant les règles ajoutées ;
- **commentée** — en tête : le besoin, le choix, ce qui a motivé la
  précaution. Les migrations de Coparentalité Zen sont exemplaires sur ce
  point et c'est ce qui les rend relisables un an après.

Séparation des plages (voir `01-ARCHITECTURE.md` § C.2) : `00001`–`00099`
socle, `01001`+ métier.

### Appliquer

**En production**, deux voies :

1. Workflow GitHub *Migrations Supabase* : mode `verification` d'abord (liste
   ce qui est en attente sans rien écrire), puis `appliquer`.
2. À défaut, éditeur SQL du tableau de bord, en collant le fichier brut depuis
   la branche de production.

⚠ Si des migrations ont été appliquées à la main avant l'automatisation, la
table de suivi les ignore et l'outil voudra tout réappliquer. Réconcilier une
seule fois :

```bash
supabase link --project-ref <ref>
supabase migration list                          # « Local » plein, « Remote » vide
supabase migration repair --status applied 00001 00002 …
```

## 5. Modèle de sécurité — l'essentiel

### 5.1 Deux couches, pas une

| Couche | Ce qu'elle fait | Ce qu'elle ne fait pas |
|---|---|---|
| **GRANT de table** | ouvre la porte au rôle | ne filtre aucune ligne |
| **RLS** | filtre ligne par ligne | ne donne aucun droit d'accès à la table |

⚠ Sans GRANT, le rôle `authenticated` reçoit `permission denied for table …`
**avant** que les policies ne s'appliquent. Sur Coparentalité Zen, les
fonctions `SECURITY DEFINER` masquaient l'omission (elles s'exécutent avec les
droits du propriétaire) : seules les lectures directes échouaient — d'où la
migration corrective `00007_grants.sql`.

Accorder ces privilèges est sans risque **à condition** que la RLS soit active
sur toutes les tables : une table sans policy refuse tout.

### 5.2 Squelette du socle

```sql
-- Helpers : SECURITY DEFINER pour éviter la récursion RLS,
-- search_path verrouillé pour éviter le détournement de schéma.
create or replace function public.is_member(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = wid and profile_id = auth.uid() and deleted_at is null
  );
$$;

create or replace function public.member_role_in(wid uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from workspace_members
  where workspace_id = wid and profile_id = auth.uid() and deleted_at is null
  limit 1;
$$;

create or replace function public.can_write(wid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce indispensable : pour un non-membre, member_role_in renvoie NULL
  -- et « NULL in (...) » vaut NULL, pas FALSE — ce qui neutraliserait les
  -- vérifications « if not can_write(...) » en PL/pgSQL.
  select coalesce(public.member_role_in(wid) in ('owner','editor'), false);
$$;

-- Activation en boucle : aucune table oubliée, jamais.
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;
```

⚠ Le `coalesce` n'est pas cosmétique. Sans lui, un non-membre passe les
vérifications `if not can_write(...)`. C'est un trou de sécurité silencieux.

### 5.3 Durcissement des fonctions

Modèle de `00026_security_hardening.sql`, à reprendre :

```sql
-- Fonctions de trigger : aucun appel direct.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Opérations sensibles : jamais anonymes.
revoke all on function public.create_workspace(text) from public, anon;
grant  execute on function public.create_workspace(text) to authenticated;

-- Lectures réellement publiques, accordées explicitement.
revoke all on function public.grille_tarifaire() from public;
grant  execute on function public.grille_tarifaire() to anon, authenticated;
```

### 5.4 Les trois pièges qui ont coûté le plus cher

⚠ **`revoke from public` prive aussi `service_role`.** Les traitements sans
utilisateur (webhook, tâche planifiée) s'exécutent avec ce rôle. Révoquer
« pour tous » lui retire son droit implicite : l'appel échoue sur
`permission denied for function` **sans rien écrire**. Résultat possible : un
paiement encaissé sans contrepartie. Toute fonction destinée au rôle de
service doit recevoir un `grant execute … to service_role` explicite.

⚠ **`drop function` avant `create function` emporte tous les grants.**
PostgreSQL refuse un `create or replace` quand la signature de retour change
(ajouter une colonne à un `returns table`). Il faut supprimer puis recréer —
et la suppression retire tous les `grant`, y compris vers `service_role`, sans
le moindre message. Modèle à appliquer systématiquement :

```sql
drop function if exists public.ma_fonction();
create or replace function public.ma_fonction() returns table (...) ...;
grant execute on function public.ma_fonction() to service_role;   -- reposé !
```

⚠ **`pgcrypto` vit dans le schéma `extensions`, pas dans `public`.** Sur
Supabase, `create extension if not exists pgcrypto` dans `public` est **sans
effet** : l'extension existe déjà ailleurs. `gen_random_bytes` reste alors
introuvable pour toute fonction dont le `search_path` se limite à `public`.
C'est ce qui a mis l'invitation en panne en production **alors que le banc de
test passait au vert** — il installait pgcrypto dans `public`, où tout se
résolvait tout seul. Deux conséquences :

1. Toute fonction utilisant pgcrypto déclare `set search_path = public,
   extensions`.
2. Le banc de test **doit** reproduire l'implantation réelle.

## 6. Storage

Seaux **privés** par défaut. Convention de chemin obligatoire :

```
{workspace_id}/{uuid-fichier}.{extension}
```

Le périmètre se déduit du premier segment :

```sql
create or replace function public.workspace_from_path(object_name text)
returns uuid language sql immutable set search_path = public as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid
$$;

create policy "docs_read" on storage.objects for select
  using (bucket_id = 'documents'
         and public.is_member(public.workspace_from_path(name)));
```

Les seaux se créent dans le tableau de bord (ou par `insert into
storage.buckets`, comme `00039`), et l'accès se fait par **URL signée**
générée côté application.

Cas particulier des sauvegardes : seau **sans aucune policy**. L'absence de
policy vaut interdiction ; seule la clé de service y accède. Un droit de
lecture accordé « juste pour vérifier » livrerait tout.

## 7. Environnements

| Environnement | Recommandation |
|---|---|
| Local | PostgreSQL 16 + `scripts/test-sql.sh` — pas besoin de Supabase |
| Preview | projet Supabase distinct, données factices |
| Production | projet dédié, sauvegardes vérifiées |

Un projet Supabase gratuit se met en pause après inactivité : ne pas s'en
étonner sur un environnement de test.

**Sauvegardes.** Celles de l'hébergeur protègent d'une panne de machine, pas
d'une erreur humaine (migration maladroite, suppression de trop). Le socle
ajoute une tâche planifiée qui dépose un relevé lisible dans un seau privé.
La purge n'est **pas** automatisée : effacer des sauvegardes sans surveillance
est le meilleur moyen de n'en avoir aucune le jour venu.

---

## 8. Ajouter le métier sans toucher au socle (étape 4)

La règle tient en une phrase : **le métier ajoute, il ne modifie pas.**

### 8.1 Ce qu'on a le droit de faire

| Action | Où |
|---|---|
| Nouvelle table | migration `01xxx` dans `migrations/metier/` |
| Policies de la nouvelle table | même migration, en réutilisant `is_member` / `can_write` |
| Fonction serveur métier | même migration, `SECURITY DEFINER` + vérifications explicites |
| Nouvelle action TypeScript | `src/metier/actions/`, renvoyant un `ActionResult` |
| Nouvel écran | `src/app/app/<nom>/page.tsx`, composant depuis `src/socle/ui` |
| Nouveau type de notification | `insert into notification_types` — **aucune migration de structure** |
| Nouvelle catégorie / nouveau paramètre | ligne de données, pas colonne |

### 8.2 Ce qu'on n'a pas le droit de faire

- modifier une migration du socle déjà appliquée ;
- écrire dans `src/socle/` pour un besoin propre à l'application ;
- contourner un helper RLS par une condition écrite à la main ;
- appeler Supabase directement depuis un composant (tout passe par une action) ;
- utiliser le client de service pour une opération qui a un utilisateur.

### 8.3 Gabarit d'une migration métier

```sql
-- ============================================================
-- <APPLICATION> — Migration 01003 : <sujet>
--
-- BESOIN     : ce que l'utilisateur ne peut pas faire aujourd'hui.
-- CHOIX      : la décision retenue et pourquoi.
-- SÉCURITÉ   : qui peut lire, qui peut écrire.
-- Idempotente et transactionnelle.
-- ============================================================
begin;

create table if not exists comptes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  libelle      text not null,
  solde_cents  bigint not null default 0,     -- centimes entiers, jamais de flottant
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table comptes enable row level security;

drop policy if exists comptes_read on comptes;
create policy comptes_read on comptes for select
  using (public.is_member(workspace_id));

drop policy if exists comptes_write on comptes;
create policy comptes_write on comptes for insert
  with check (public.can_write(workspace_id) and created_by = auth.uid());

create trigger comptes_updated_at before update on comptes
  for each row execute function public.set_updated_at();

commit;
```

### 8.4 Quand verrouiller une table en lecture seule

Dès qu'une table porte des **règles d'intégrité que la RLS ne sait pas
exprimer** — un solde, une comptabilité, un quota. La RLS protège
l'appartenance, pas la cohérence.

Modèle éprouvé sur Coparentalité Zen :

1. aucune policy `insert` / `update` / `delete` pour `authenticated` ;
2. toute écriture par une fonction `SECURITY DEFINER` qui vérifie l'identité,
   l'appartenance, le rôle, la cohérence, puis journalise ;
3. `grant execute` explicite à `authenticated` ;
4. une suite de tests SQL qui **tente** l'écriture directe et vérifie qu'elle
   échoue.

C'est plus lourd à écrire. C'est ce qui garantit que deux écrans n'affichent
jamais deux soldes différents.
