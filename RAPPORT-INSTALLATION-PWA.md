# Ajout du guide d’installation PWA

## Comportement

- affichage sur la page d’accueil tant que l’application n’est pas installée ;
- bouton d’installation native sur Android/Chrome lorsque le navigateur la propose ;
- guide iPhone/iPad détaillant Safari → Partager → Sur l’écran d’accueil ;
- guide générique pour les autres navigateurs ;
- disparition automatique après installation ;
- aucune donnée utilisateur collectée ;
- aucune migration Supabase nécessaire.

## Fichiers

- `src/components/install-app-card.tsx`
- `src/app/app/accueil/page.tsx`
