# Lacunes connues

## Le questionnaire (catégorie `quiz`) est invisible à la boucle d'amélioration Pinterest

**Statut : non corrigé, sciemment.** Cette lacune est actée jusqu'au déblocage
de l'accès Pinterest ; elle est documentée ici pour être traitée à ce moment-là.

### Constat

`genererSemaine` produit une catégorie `quiz` où **un seul contenu génère
plusieurs épingles** — une par planche de couverture et de question
(`elementsDuContenu`, dans `pinterest.ts`). Chaque épingle porte son propre
lien, avec un `utm_content` de la forme `<reference>-p<rang>`
(`lienQuizPinterest`), distinct de la référence du contenu lui-même.

La boucle d'amélioration Pinterest (`stats.ts`, `stats-collecte.ts`,
`depot.ts`) a été conçue avant l'introduction du questionnaire, sur
l'hypothèse **un contenu = une épingle** :

- `marketing_contenus` porte `pin_id`/`pin_cree_le` en colonnes scalaires — au
  plus une épingle par ligne.
- `contenusSansPinId()` (`depot.ts`) liste des références de contenus, pas
  d'épingles.
- `associerEpingles()` (`stats.ts`) rapproche chaque épingle retrouvée d'une
  référence par **égalité stricte** entre l'`utm_content` de son lien et
  `contenu.reference`.

Pour un contenu `quiz` de référence `2026s34-carrousel-1`, les épingles
produites portent `utm_content=2026s34-carrousel-1-p0`,
`...-p1`, etc. — aucune n'égale `2026s34-carrousel-1`. `associerEpingles` les
traite comme des « références inconnues de nous » et les ignore silencieusement
(c'est le comportement documenté et voulu de cette fonction pour une épingle
ajoutée à la main ou un mauvais tableau — mais il s'applique ici à tort).

### Conséquence

Pour tout contenu de catégorie `quiz` :

- Aucune de ses épingles n'est jamais rattachée à `marketing_contenus.pin_id`.
- Aucune n'entre jamais dans `contenusPourCollecte()`, donc aucune ligne
  `pin_stats` n'est jamais écrite pour elles.
- Elles n'alimentent donc jamais `produireLearnings` : le bloc d'apprentissages
  ne dit jamais rien sur les catégories/piliers portés par le questionnaire.
- Dans `/admin/mesures` → « Contenus de la semaine », un contenu `quiz` reste
  bloqué au statut « publié » (visible dans le flux RSS) et ne progresse
  jamais vers « épingle trouvée » ni « mesuré », même des semaines après sa
  publication réelle sur Pinterest.

Rien ne casse : la découverte et la collecte tournent normalement pour les
contenus non-`quiz`, et l'absence de correspondance pour le `quiz` échoue de
façon silencieuse plutôt que par une erreur — c'est un manque de couverture,
pas un bug qui interrompt la boucle.

### Ce qu'il faudrait faire

Le questionnaire étant multi-épingles, la relation contenu ↔ épingle doit
devenir 1-N avant que la mesure soit possible. Grandes lignes :

1. **Schéma.** Remplacer `marketing_contenus.pin_id`/`pin_cree_le` par une
   table de correspondance séparée, une ligne par épingle :
   `pin_epingles(id, contenu_id, rang, pin_id, pin_cree_le)`, `rang` étant
   `null` pour un contenu non-`quiz` (une ligne) et le rang de planche pour un
   `quiz` (plusieurs lignes). `pin_stats.contenu_id` devrait alors probablement
   référencer `pin_epingles.id` plutôt que `marketing_contenus.id`, pour que
   deux planches du même contenu ne partagent pas leurs relevés.

2. **Découverte.** `contenusSansPinId()` doit énumérer les *épingles
   attendues* (référence + rang), pas les contenus : un contenu `quiz` attend
   `elementsDuContenu(contenu, base).length` épingles, un contenu ordinaire en
   attend une. `associerEpingles()` doit matcher sur `<reference>` **ou**
   `<reference>-p<rang>` (le format exact du guid/utm_content déjà produit par
   `elementsDuContenu`, à réutiliser plutôt qu'à redériver).

3. **Collecte.** `contenusPourCollecte()` et `collecterStats()` n'ont pas
   besoin de changer de logique, seulement de source (la nouvelle table plutôt
   que les colonnes de `marketing_contenus`).

4. **Statut affiché.** La déduction de statut dans `/admin/mesures` (« Contenus
   de la semaine ») doit décider ce que signifie « épingle trouvée » / « mesuré »
   pour un contenu à plusieurs épingles — vraisemblablement : toutes trouvées /
   au moins une mesurée, à trancher au moment de l'implémentation plutôt
   qu'anticipé ici sans données réelles pour arbitrer.

5. **Apprentissages.** `lireMesuresPinterest()` rapproche aujourd'hui chaque
   relevé à `marketing_contenus(categorie, marketing_opportunites(niche_id))`
   par jointure directe ; avec une table de correspondance intermédiaire, la
   jointure passe par `pin_epingles.contenu_id` en plus.

Non chiffré en volume de travail : la portée exacte dépendra de ce que
`docs/PINTEREST.md` § Ordonnancement appelle le premier appel réel à l'API
(le format exact des réponses Pinterest, aujourd'hui supposé d'après la
documentation publique, n'a pas encore été vérifié contre un compte réel —
`?dry_run=1` sur `/api/marketing/pinterest-stats` sert précisément à ça).
Traiter cette lacune après ce premier appel réel plutôt qu'avant évite de
concevoir la table de correspondance sur une forme de réponse non confirmée.

## Ids de profil dupliqués entre rls_fixtures.sql et scolarite_fixtures.sql

**Statut : préexistant sur develop, non corrigé ici.** Repéré en relançant
`npm run test:sql` après le rebase de `feature/agent-redacteur` ; confirmé
sans lien avec ce travail (aucun diff sur les deux fichiers en cause par
rapport à `origin/develop`) — c'est un bug de la suite SQL déjà présent sur
develop, à traiter comme une tâche à part.

### Constat

`scripts/test-sql.sh` charge les jeux d'essai dans l'ordre `rls_fixtures,
invitation_fixtures, flows_fixtures, scolarite_fixtures`, cumulativement sur
la même base gabarit (contrairement aux suites `*_test.sql`, elles isolées
par clone). `rls_fixtures.sql` insère déjà deux profils
`00000000-0000-0000-0000-0000000000e1` (« premier@test.fr ») et `...e2`
(« second@test.fr »). `scolarite_fixtures.sql` réutilise les deux mêmes ids
pour ses propres profils (« diane@test.fr », « erik@test.fr »), en
comptant sans doute sur une base propre par suite plutôt que cumulative.
Résultat : `insert into profiles` échoue dans `scolarite_fixtures.sql` avec
`ERROR: duplicate key value violates unique constraint "profiles_pkey"`, et
`npm run test:sql` s'arrête là — les suites `*_test.sql` qui dépendent du
gabarit (dont `scolarite_test.sql`) ne sont jamais atteintes.

### Ce qu'il faudrait faire

Donner à `scolarite_fixtures.sql` ses propres ids de profil, distincts de
ceux de `rls_fixtures.sql` (et des deux autres jeux d'essai, à vérifier par
la même occasion) — par exemple un préfixe `...e3`/`...e4` plutôt que de
réutiliser `e1`/`e2`. Vérifier ensuite que `scolarite_test.sql`, qui
référence ces mêmes ids (`set_config('request.jwt.claim.sub', ...)`), est
mis à jour en conséquence.
