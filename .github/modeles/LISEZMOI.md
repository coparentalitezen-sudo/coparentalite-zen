# Modèles de workflows

Ces deux fichiers sont **prêts à l'emploi mais inactifs** : GitHub n'exécute
que les workflows placés directement dans `.github/workflows/`.

Ils sont rangés ici parce qu'un jeton d'accès personnel dépourvu de la
permission « Workflows » ne peut rien écrire dans `.github/workflows/` — pas
même un fichier Markdown. Les déposer au bon endroit est donc une opération
manuelle, à faire une seule fois.

## Mise en service

Depuis GitHub, se placer **dans** le dossier `.github/workflows/`, puis
« Add file » → « Create new file ». Le chemin est alors prérempli : il suffit
de saisir `ci.yml` (sans aucune barre oblique) et de coller le contenu de
`ci.yml` ci-contre.

Répéter pour `migrations.yml` si l'on souhaite appliquer les migrations
Supabase depuis GitHub — ce second workflow exige au préalable trois secrets
et une réconciliation décrite dans `CONTRIBUER.md`.

Une fois les fichiers en place, ce dossier `modeles/` peut être supprimé.

## Ce que fait `ci.yml`

À chaque `push` et chaque proposition de fusion : vérification des types,
60 tests unitaires, construction de production, 12 parcours navigateur, puis —
sur un PostgreSQL 16 démarré pour l'occasion — les 14 migrations et les
116 assertions SQL. Un seul échec bloque l'ensemble.
