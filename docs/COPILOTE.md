# Copilote business — guide

Le copilote fait chaque semaine le tour de tes boutiques (Etsy, Payhip, Gumroad)
et te prépare trois écrans dans l'administration :

| Écran | À quoi il sert |
|---|---|
| `/admin/boutique` | Déposer les exports CSV de tes boutiques |
| `/admin/propositions` | Valider ou rejeter 3 idées de produits et 3 fiches à améliorer |
| `/admin/rapport` | Le rapport de la semaine : chiffres clés, ce qui a marché, 3 actions |

Chaque lundi à 7 h (heure de Paris en hiver, 8 h en été), le calcul se fait seul
et le rapport t'arrive par courriel. **Rien n'est publié ni modifié dans tes
boutiques** : le copilote propose, tu décides, tu fais la modification toi-même
(un copier-coller du titre et des tags proposés).

Ce qu'il ne fait pas, volontairement : promettre des revenus, donner un conseil
juridique, ou inventer ce que contient un produit. Les parties qu'il ne peut
pas connaître sont laissées entre `[crochets]`, à compléter.

---

## Ta routine du lundi (10 minutes)

1. **Exporte tes ventes** (voir plus bas où cliquer dans chaque boutique).
   Une fois par semaine suffit ; un export qui chevauche le précédent ne crée
   aucun doublon.
2. Ouvre **`/admin/boutique`**, choisis le fichier, clique sur **Importer**.
   Laisse « Détecter » : le format est reconnu tout seul. Recommence pour
   chaque boutique.
3. Ouvre **`/admin/rapport`** et clique sur **Recalculer maintenant**.
4. Lis les **3 actions de la semaine**.
5. Ouvre **`/admin/propositions`** : *Valider* ou *Rejeter* chaque carte.
   Quand tu as réellement fait la modification sur ta boutique, clique sur
   *Marquer comme fait*.

Le courriel du lundi matin part avant que tu aies déposé les exports de la
semaine : il porte donc sur les données déjà importées. Après ton import, le
bouton « Recalculer et m'envoyer le courriel » te renvoie une version à jour.

---

## Si tu n'as encore aucune vente

C'est le cas le plus courant au démarrage, et le copilote s'y adapte : sans
vente, il ne peut pas dire « ce qui marche », mais il peut dire **pourquoi ça
ne vend pas encore**, à condition d'avoir deux choses :

1. **Tes fiches** : export Etsy « Fiches actives » (titres, tags, descriptions, prix).
2. **Leurs vues** sur les 30 derniers jours, recopiées depuis les statistiques
   Etsy (format plus bas, cinq minutes par mois).

Il range alors chaque fiche dans l'un de ces cas :

| Cas | Ce que ça veut dire | Ce qu'il propose |
|---|---|---|
| **Peu visible** (moins de 40 vues en 30 jours) | La recherche Etsy ne montre presque pas la fiche | Titre et 13 tags |
| **Vue mais pas achetée** (100 vues ou plus, moins de 1 % d'achat) | Les gens viennent, mais ne sont pas convaincus | Première photo, prix, début de la description |
| **Trop tôt** (entre les deux) | Pas encore assez de vues pour trancher | Rien d'urgent |

Les fiches « vues mais pas achetées » passent en premier : le trafic existe
déjà, il ne reste qu'à convaincre.

Un export de ventes vide n'est pas une erreur : l'écran te le dit et t'oriente
vers les fiches et les vues.

---

## Publications produits (Instagram, Facebook, Pinterest)

Chaque lundi, le copilote prépare **deux publications** (mardi et vendredi),
chacune sur une de tes fiches qui a un lien. Les fiches tournent d'une semaine
à l'autre, l'angle aussi (le problème, pour qui, ce que c'est).

1. **Donne un lien à tes fiches** : `/admin/boutique` → « Tes fiches et leurs
   liens ». Copie l'adresse de la fiche (Payhip, Etsy ou Gumroad) depuis la
   barre d'adresse. Pas d'export ? « Ajouter une fiche à la main » (nom + lien)
   suffit.
2. **Valide** dans `/admin/contenus` (onglet « Posts produits ») : visuel,
   légende Instagram, légende Facebook et épingle Pinterest sont affichés.
   « Préparer les publications de cette semaine » les crée tout de suite,
   sans attendre lundi.
3. Une publication validée entre dans la **réserve** : la tâche quotidienne la
   publie sur Instagram et Facebook à sa date, et elle entre dans le flux
   Pinterest. Tant qu'elle n'est partie nulle part, « Annuler » la retire.

Ce qu'il faut savoir :

- Instagram n'a pas de lien cliquable dans les légendes, et Payhip n'a pas de
  recherche où te trouver : la légende donne l'adresse courte de ta page
  **`coparentalitezen.fr/boutique`**, qui liste toutes les fiches ayant un lien
  (tu peux aussi la mettre dans ta bio). Facebook et Pinterest ont un lien suivi
  (`/e/…`) qui compte les clics puis renvoie vers la fiche — sans aucune
  donnée personnelle. Les clics apparaissent sur chaque carte et dans le rapport.
- Les publications passent **par les mêmes interrupteurs** que le reste : si
  Instagram ou Facebook est en mode validation ou hors service dans `/admin`,
  la réserve ne publie pas sur ce canal.
- Une publication de la réserve **remplace** ce jour-là le visuel quotidien de
  l'application. Deux par semaine, c'est donc deux jours sur sept.
- Pendant la campagne de Noël, ton appel « planning de Noël » est ajouté
  automatiquement à toutes les publications, celles-ci comprises.
- **Auto-validation** : à n'activer qu'après avoir relu les premières. Une fois
  activée, les publications de chaque lundi partent sans passer par toi.
- Les légendes nomment la plateforme de chaque fiche (« sur Payhip »,
  « sur Etsy »). Le nom affiché en haut des visuels (« Boutique
  ParentZenFrance ») se change par la variable Vercel `COPILOTE_BOUTIQUE`.

---

## Où trouver chaque export

| Boutique | Chemin | Contenu |
|---|---|---|
| Etsy | Gestionnaire de boutique → Paramètres → Options → **Télécharger les données** → « Articles commandés » | Ventes (`EtsySoldOrderItems…csv`) |
| Etsy | Même écran → « Fiches actives » | Titres, tags, descriptions, prix — sert aux améliorations de fiches |
| Gumroad | Audience → Ventes → **Exporter** | Ventes |
| Payhip | Tableau de bord → Ventes → **Exporter** | Ventes |

Les libellés exacts peuvent varier selon la langue de ton compte. Si un fichier
n'est pas reconnu, choisis la plateforme à la main dans la liste ; si ça ne
suffit pas, envoie-moi l'en-tête du fichier (la première ligne, sans données
clients) et j'ajouterai le format.

### Les vues (facultatif, mais utile)

Aucune boutique n'exporte les vues par produit en CSV. Si tu veux que le
copilote repère les fiches « qui attirent mais ne convainquent pas », recopie
une fois par mois les vues des 30 derniers jours depuis les statistiques Etsy
dans un petit fichier :

```
produit;vues;plateforme;date
Budget familial mensuel Google Sheets;412;etsy;16/11/2026
Calendrier de garde alternée 2026;980;etsy;16/11/2026
```

### Le format générique (toute autre source)

```
date;plateforme;commande;produit;quantite;montant;devise
13/11/2026;payhip;PH-1042;Tableau de partage des frais;1;6,50;EUR
```

---

## Comment le copilote décide

**Prudence statistique.** Rien n'est conclu sous 3 ventes pour un produit. Les
tendances se comparent sur 28 jours, pas sur 7 : une semaine de produits
numériques tient souvent en quelques ventes, et y lire une tendance revient à
commenter un tirage au sort.

**Statut de chaque produit :**

- *Moteur* : parmi les 3 meilleures ventes des 28 derniers jours (3 ventes minimum).
- *En hausse* : au moins 1,5 fois plus de ventes que sur les 28 jours précédents.
- *Stagne* : ventes divisées par deux ou plus, ou aucune vente depuis 45 jours.
- *Faible conversion* : au moins 100 vues et moins de 1 % de conversion (si tu importes les vues).
- *Trop tôt* : moins de 3 ventes au total.

**Les idées de produits** viennent de quatre règles, chacune citée dans la carte :

- *Diffusion* : un produit qui se vend sur une boutique et pas sur une autre que tu utilises.
- *Pack* : deux produits souvent achetés ensemble (ou tes deux meilleures ventes d'un même thème), environ 20 % moins cher que les deux séparés.
- *Déclinaison* : une variante d'un produit moteur, pour le même public.
- *Saison* : l'édition de l'année suivante d'un produit daté qui se vend ; sinon une idée de calendrier, marquée « Hypothèse, à confirmer ».

**Les montants** ne sont jamais additionnés entre devises : le chiffre
d'affaires est donné dans ta devise principale, les autres sont signalées à
part.

**Les garde-fous** (`src/lib/copilote/garde-fous.ts`) retirent toute
proposition qui contiendrait une promesse de revenus, une affirmation
juridique, ou un propos hostile envers l'autre parent.

---

## Réglages (variables d'environnement Vercel)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `ADMIN_EMAILS` | déjà en place | Accès aux écrans ; le premier reçoit le rapport |
| `CRON_SECRET` | déjà en place | Protège la tâche du lundi |
| `RESEND_API_KEY` | déjà en place | Envoi du courriel |
| `COPILOTE_EMAIL` | non | Envoyer le rapport à une autre adresse que le premier administrateur |
| `COPILOTE_BOUTIQUE` | non | Nom affiché en haut des visuels produits (défaut : ParentZenFrance) |

Aucune clé d'API payante n'est nécessaire pour cette version.

---

## Côté technique

- Logique pure et testée : `src/lib/copilote/` (`csv`, `import`, `analyse`,
  `propositions`, `garde-fous`, `rapport`, `dates`) — tests `tests/copilote-*.test.ts`.
- Accès base : `src/lib/copilote/depot.ts` (clé de service uniquement).
- Boucle : `src/lib/copilote/hebdo.ts`, appelée par `/api/copilote/hebdo`
  (tâche du lundi) et par le bouton « Recalculer ».
- Tables : migration `00065_copilote_boutique.sql`, testée par
  `supabase/tests/copilote_boutique_test.sql`.
- Chaque passage laisse une trace dans `marketing_journal` (tâche `copilote-hebdo`).
