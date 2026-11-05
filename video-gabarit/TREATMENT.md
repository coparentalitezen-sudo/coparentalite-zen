# Gabarit vidéo — traitement (Mid-century Cartoon, 1080×1920, 24 i/s)

Un gabarit, pas un film : chaque vidéo exécute un `scenario.json` produit par
`src/lib/marketing/scenario-video.ts` à partir d'un sujet de la banque et d'une accroche.
Durée 27 à 35 s, calculée depuis la durée réelle de chaque voix (`minutage.mjs`).

## Trois structures envisagées

1. **Fiche d'étapes seule** (titre → trois cartes) : fidèle aux carrousels, mais sans problème posé ni fin de marque.
2. **Problème / solution en écran partagé** (avant / après) : clair, mais la moitié du film est négative.
3. **Les deux maisons qui se rejoignent** (retenue) : l'accroche se pose sur un cadre partagé en deux couleurs,
   l'enfant sur la couture ; un médaillon numéroté ouvre chacune des trois étapes (appel en cercle, main gantée
   qui touche sur le temps, carte de texte) ; « Avec Coparentalité Zen » apporte ce que l'appli fait de plus ;
   les deux moitiés se referment, l'enfant lève les bras, l'iris se pose sur l'anneau du logo officiel ;
   l'adresse du site reste immobile au moins 3 s.

## Plans

| Plan | Durée | Contenu |
|---|---|---|
| Accroche | ≥ 3 s, lecture comprise | deux maisons, deux parents symétriques (mêmes gestes : aucun n'est désigné), bulles, accroche en titre |
| Étapes 1–3 | voix + lecture | en-tête « ÉTAPE n SUR 3 », pictogramme du geste dans un cercle, toucher sur le temps, carte de l'étape |
| Apport | voix + lecture | téléphone de l'appli, pictogramme du sujet, sous-titre |
| Fin | 4,9 s | fusion des maisons → iris → logo officiel → « Gratuit pour commencer » → coparentalitezen.fr |

Transitions : médaillon + iris (accroche → étape 1, étape 3 → apport), volets de couleur entre les étapes.
Son : jazz cool (vibraphone, flûte, contrebasse, balais), un accord par étape, silence avant chaque tampon,
voix compressée ~10 dB au-dessus de la musique, −14 LUFS.

## Règles de contenu (banque.ts, visuel.ts)

Couleurs de la marque ; aucun chiffre ni témoignage ajouté (textes de la banque et étapes courtes seulement) ;
aucun parent désigné fautif ; aucune photo d'enfant ; logo officiel non modifié.
