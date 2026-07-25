#!/usr/bin/env bash
#
# Banc de test SQL de Coparentalité Zen.
#
# Applique toutes les migrations sur une base PostgreSQL vierge, puis exécute
# chaque suite de tests sur un clone frais du même gabarit. L'isolation est
# indispensable : les suites créent des remboursements et des exceptions qui,
# partagés, déclencheraient les verrous métier d'une suite à l'autre — un échec
# qui ne dirait rien du produit.
#
# Usage :
#   scripts/test-sql.sh                      # local (postgres via sudo)
#   PGHOST=... PGUSER=... scripts/test-sql.sh   # CI (service PostgreSQL)
#
# Variables :
#   PGHOST      hôte PostgreSQL           (défaut : socket local, via su postgres)
#   PGPORT      port                      (défaut : 5432)
#   PGUSER      rôle administrateur       (défaut : postgres)
#   PGPASSWORD  mot de passe éventuel
#   APP_ROLE    rôle applicatif testé     (défaut : authenticated)
#   APP_PASSWORD mot de passe de ce rôle  (défaut : test)

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$RACINE/supabase/migrations"
TESTS="$RACINE/supabase/tests"

GABARIT="czen_gabarit"
APP_ROLE="${APP_ROLE:-authenticated}"
APP_PASSWORD="${APP_PASSWORD:-test}"

# Deux modes d'exécution : socket local en tant que postgres, ou connexion TCP.
if [ -n "${PGHOST:-}" ]; then
  admin() { psql -v ON_ERROR_STOP=1 -q "$@"; }
  MODE="TCP $PGHOST:${PGPORT:-5432}"
else
  admin() { su postgres -c "psql -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"; }
  MODE="socket local"
fi

# Le rôle applicatif se connecte toujours en TCP : c'est ainsi qu'on obtient
# les droits réels, sans hériter de ceux du superutilisateur.
app() {
  PGPASSWORD="$APP_PASSWORD" psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" \
    -U "$APP_ROLE" -d "$1" -f "$2" 2>&1
}

echo "Banc de test SQL — $MODE"

# ---------- Rôles applicatifs ----------
admin -d postgres -c "
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = '$APP_ROLE') then
    execute format('create role %I login password %L', '$APP_ROLE', '$APP_PASSWORD');
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end \$\$;" > /dev/null

# ---------- Gabarit : schéma auth simulé + migrations + jeux d'essai ----------
admin -d postgres -c "drop database if exists $GABARIT;" > /dev/null
admin -d postgres -c "create database $GABARIT;" > /dev/null

# Supabase fournit nativement le schéma auth et la fonction auth.uid().
# En dehors de Supabase, on les reproduit à l'identique — sans jamais accorder
# au rôle applicatif de droits qu'il n'aurait pas en production.
admin -d "$GABARIT" -c "
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
grant usage on schema auth to $APP_ROLE;
grant execute on function auth.uid() to $APP_ROLE;
-- Fournie par la migration Storage (00005), qui exige le schéma storage de Supabase
create or replace function public.household_from_path(o text) returns uuid
  language sql immutable as \$\$ select nullif(split_part(o, '/', 1), '')::uuid \$\$;
" > /dev/null

echo ""
echo "Migrations"
for fichier in "$MIGRATIONS"/*.sql; do
  nom="$(basename "$fichier" .sql)"
  # 00005 crée des policies sur storage.objects : schéma absent hors Supabase
  case "$nom" in *_storage_policies) echo "  – $nom (ignorée : propre à Supabase)"; continue;; esac
  if admin -d "$GABARIT" -f "$fichier" > /dev/null 2>&1; then
    echo "  ✓ $nom"
  else
    echo "  ✗ $nom"
    admin -d "$GABARIT" -f "$fichier" 2>&1 | grep -E "ERROR|DÉTAIL|DETAIL" | head -5
    exit 1
  fi
done

admin -d "$GABARIT" -c "grant execute on function public.household_from_path(text) to $APP_ROLE;" > /dev/null

echo ""
echo "Jeux d'essai"
# Ordre imposé : rls_fixtures crée les foyers, les profils et les helpers dont
# les deux autres dépendent. L'ordre alphabétique ne convient pas.
for nom in rls_fixtures invitation_fixtures flows_fixtures; do
  fichier="$TESTS/$nom.sql"
  [ -f "$fichier" ] || continue
  if admin -d "$GABARIT" -f "$fichier" > /dev/null 2>&1; then
    echo "  ✓ $nom"
  else
    echo "  ✗ $nom"
    admin -d "$GABARIT" -f "$fichier" 2>&1 | grep -E "ERROR" | head -3 | sed 's/^/      /'
    exit 1
  fi
done

# ---------- Exécution : un clone du gabarit par suite ----------
echo ""
echo "Suites de tests"
total=0
echecs=0
suites_en_echec=""

for suite in "$TESTS"/*_test.sql; do
  nom="$(basename "$suite" .sql)"
  admin -d postgres -c "drop database if exists czen_run;" > /dev/null
  admin -d postgres -c "create database czen_run template $GABARIT;" > /dev/null

  sortie="$(app czen_run "$suite" || true)"
  reussis="$(printf '%s' "$sortie" | grep -cE 'OK —' || true)"
  rates="$(printf '%s' "$sortie" | grep -cE 'ÉCHEC|ERROR' || true)"
  total=$((total + reussis))

  if [ "$rates" -gt 0 ]; then
    echecs=$((echecs + rates))
    suites_en_echec="$suites_en_echec $nom"
    printf '  ✗ %-30s %3d réussies · %d échec(s)\n' "$nom" "$reussis" "$rates"
    printf '%s' "$sortie" | grep -E 'ÉCHEC|ERROR' | head -3 | sed 's/^/        /'
  else
    printf '  ✓ %-30s %3d assertions\n' "$nom" "$reussis"
  fi
done

admin -d postgres -c "drop database if exists czen_run;" > /dev/null
admin -d postgres -c "drop database if exists $GABARIT;" > /dev/null

echo ""
if [ "$echecs" -gt 0 ]; then
  echo "ÉCHEC — $total assertions réussies, $echecs échec(s) :$suites_en_echec"
  exit 1
fi
echo "SUCCÈS — $total assertions, aucun échec"
