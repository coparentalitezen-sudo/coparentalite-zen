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
