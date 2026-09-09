# Pinterest automatique

## Ce qui est automatisé

Le flux public `https://coparentalitezen.fr/pinterest.xml` reprend uniquement
les contenus de la semaine dont le statut est `valide` ou `publie`. Chaque
élément contient :

- une image JPEG 1000 × 1500 ;
- une page-conseil durable et indexable ;
- un lien UTM `source=pinterest` ;
- un titre et une description issus du moteur éditorial existant.

Pinterest relit le flux. Ajouter une validation dans l'administration suffit
donc à rendre le contenu disponible, sans appel à une API tierce et sans jeton
Pinterest à renouveler.

## Connexion initiale

1. Utiliser un compte Pinterest professionnel.
2. Dans **Paramètres → Comptes associés → Sites web**, revendiquer
   `coparentalitezen.fr` avec la méthode **balise HTML**.
3. Copier uniquement la valeur de l'attribut `content` de la balise fournie
   dans `NEXT_PUBLIC_PINTEREST_DOMAIN_VERIFY` sur Vercel.
4. Redéployer puis demander à Pinterest de vérifier le domaine.
5. Dans **Paramètres → Créer des Épingles en masse → Publication automatique**,
   connecter `https://coparentalitezen.fr/pinterest.xml` au tableau choisi.

Les libellés Pinterest peuvent évoluer. En cas de différence, suivre le chemin
visible dans le compte plutôt que forcer un ancien écran.

## Arrêt immédiat

Suspendre la publication marketing depuis `/admin`, puis ne plus valider de
nouveaux contenus. Pour couper également la collecte Pinterest, supprimer le
flux dans les paramètres du compte Pinterest.

## Données et confidentialité

Le flux ne contient aucune donnée de parent, d'enfant ou de foyer. Les visites
sont comptées sous forme agrégée par jour et par contenu, comme les autres liens
UTM de l'application.

## Boucle d'amélioration

Le code vit dans `src/lib/marketing/` : `pinterest-api.ts` (client API v5,
lecture seule), `stats.ts` (logique pure : rapprochement épingle ↔ contenu,
âge d'une épingle), `stats-collecte.ts` (découverte et collecte, appelées
depuis la route `/api/marketing/bilan` — voir plus bas) et `learnings.ts`
(score, classement, bloc de consignes).

**Découverte.** Pinterest ne rend jamais l'id d'une épingle créée par le flux
RSS : `decouvrirEpingles` liste les épingles du tableau connecté et rapproche
chacune d'un contenu via le paramètre `utm_content` de son lien, qui porte
déjà la référence stable du contenu. L'id trouvé est enregistré sur
`marketing_contenus.pin_id`.

**Collecte.** Pour chaque épingle publiée depuis au moins deux jours,
`collecterStats` relève `GET /v5/pins/{id}/analytics` (impressions, saves,
pin_clicks, outbound_clicks) et écrit une ligne dans `pin_stats`.

**Apprentissages (v1, actuelle).** `produireLearnings` calcule un score
pondéré par épingle (save × 1, pin_click × 1,5, outbound_click × 4, normalisé
pour 1000 impressions), classe les piliers (micro-niches) et les familles de
modèle (catégories de contenu) par score médian, et rédige un bloc de texte.
Sous huit épingles mesurées, le bloc recommande de varier plutôt que
d'optimiser. Ce bloc **n'ajuste rien automatiquement** — `genererSemaine` reste
déterministe et ignore ces scores ; le bloc est affiché dans `/admin/mesures`
à l'intention de la personne qui valide les prochains contenus.

**v2 (à faire).** Pondérer la sélection des sujets dans `genererSemaine` à
partir de ces scores, sur le modèle du paramètre `poids` déjà utilisé pour la
boucle Meta (`ajusterPoids`, dans `bilan.ts`) — mais avec son propre espace de
poids, propre à Pinterest, sans jamais toucher à `marketing_niches.poids` ni à
la boucle Meta : les deux boucles mesurent des signaux différents (clics et
inscriptions attribués contre score pondéré d'épingle), à des cadences
différentes, et les faire écrire la même colonne les ferait interférer de
façon imprévisible. Non commencée : la production n'a pas encore dépassé le
plancher de huit épingles mesurées qui rendrait un tel ajustement pertinent.

**Ordonnancement.** Le compte Vercel de ce projet est en offre Hobby, qui
n'autorise qu'une exécution quotidienne par tâche planifiée
(voir AGENTS.md, « Tâches planifiées ») ; `vercel.json` en déclare déjà six.
La boucle Pinterest n'a donc pas de créneau propre : elle s'exécute à la fin
de la route `/api/marketing/bilan` (lundi 5 h 30), via
`stats-collecte.ts::executerBouclePinterest`. Elle tolère l'absence de
configuration (`PINTEREST_ACCESS_TOKEN`/`PINTEREST_BOARD_ID` non renseignées) :
elle s'arrête proprement sans faire échouer le bilan Meta. La route
`/api/marketing/pinterest-stats` reste disponible pour un déclenchement manuel,
avec `?dry_run=1` pour inspecter les réponses brutes de l'API sans rien
écrire en base — à utiliser au premier appel réel, la forme exacte des
réponses Pinterest n'ayant pas été vérifiée contre un compte réel.
