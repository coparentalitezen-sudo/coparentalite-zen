# Sauvegarde et restauration

## Ce qui protège de quoi

Trois protections se superposent, et aucune ne remplace les deux autres.

| Danger | Protection |
|---|---|
| Panne machine, perte de disque | Sauvegardes automatiques Supabase |
| Erreur humaine : migration maladroite, suppression de trop | Relevé quotidien dans le seau `sauvegardes` |
| Perte du compte Supabase lui-même | Copie que vous téléchargez et conservez ailleurs |

La troisième est la seule qui survive à la disparition du prestataire. Elle
demande un geste manuel, et c'est pourquoi elle figure dans ce document plutôt
que dans du code.

## Le relevé quotidien

Il est constitué à 3 h du matin, dans la foulée des rappels, et déposé dans le
seau privé `sauvegardes` sous la forme `AAAA-MM-JJ/sauvegarde-03h00.json`.

Il couvre les données métier : foyers, membres, enfants, rythmes, périodes,
exceptions, dépenses, parts, remboursements, documents, abonnements,
consentements. Il ne couvre **pas** les justificatifs joints aux dépenses —
ce sont des fichiers, déjà conservés par le stockage — ni les journaux
d'audit, qui ne se reconstituent pas.

Le seau n'est accessible qu'à la clé de service. Aucun compte connecté ne peut
le lire : il contient l'intégralité des foyers.

### Vérifier qu'il tourne

Dans le tableau de bord Supabase, Storage, seau `sauvegardes`. Un dossier par
jour doit apparaître. **Une sauvegarde jamais vérifiée n'est pas une
sauvegarde** : regardez-y une fois par mois.

### En télécharger une copie

Depuis le tableau de bord Supabase, ouvrez le fichier du jour et
téléchargez-le. Conservez-le hors du compte Supabase — un disque, un service
de fichiers personnel. Une fois par mois suffit.

## Restaurer

### Cas 1 — une table abîmée par une migration

1. Télécharger le relevé de la veille depuis le seau.
2. Ouvrir l'éditeur SQL de Supabase.
3. Réinsérer les lignes manquantes de la table concernée, en repartant du
   tableau JSON correspondant. Les identifiants sont conservés, donc les
   liens entre tables se rétablissent d'eux-mêmes.
4. Vérifier avec les requêtes de contrôle habituelles.

Ne jamais vider une table avant d'avoir constaté que le relevé la contient
bien. Le réflexe inverse a détruit plus de données que les pannes.

### Cas 2 — la base entière est perdue

1. Créer un projet Supabase neuf.
2. Appliquer les migrations dans l'ordre, de 00001 à la dernière.
3. Réinjecter les tables du relevé dans l'ordre du fichier : il suit les
   dépendances, `profiles` et `households` d'abord, les tables filles ensuite.
4. Reporter les variables d'environnement dans Vercel : nouvelle URL, nouvelles
   clés.
5. Reconfigurer le webhook Stripe vers la même adresse — les abonnements
   existants continuent, leurs événements doivent retrouver un destinataire.

### Cas 3 — un parent a supprimé son compte par erreur

L'effacement est irréversible côté application : le profil est anonymisé et le
compte d'authentification supprimé. Le relevé de la veille contient encore ses
données. Il faut alors recréer un compte, puis réinjecter ses lignes en
changeant l'identifiant de profil — opération délicate, à ne tenter qu'avec
la trace d'audit sous les yeux pour savoir ce qui a été touché.

## Ce qui n'est pas fait

- **La purge des vieux relevés n'est pas automatisée.** Effacer des sauvegardes
  sans surveillance est le meilleur moyen de n'en avoir aucune le jour venu.
  Supprimez à la main les dossiers de plus de trois mois, en gardant le premier
  de chaque mois.
- **La restauration n'a jamais été éprouvée en conditions réelles.** Une
  procédure jamais essayée est une hypothèse. Avant toute commercialisation,
  faites l'exercice sur un projet Supabase jetable : c'est le seul moyen de
  savoir combien de temps il vous faudrait, et ce qui manque.
