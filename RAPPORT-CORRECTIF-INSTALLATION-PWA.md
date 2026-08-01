# Correctif vérifié — installation de la PWA

## Fonctionnalité intégrée

- encart visible sur `/app/accueil` lorsque l’application n’est pas installée ;
- bouton d’installation natif sur Android lorsque Chrome le propose ;
- guide détaillé iPhone : Safari → Partager → Sur l’écran d’accueil → Ajouter ;
- instructions de secours si le navigateur ne fournit pas le bouton natif ;
- masquage automatique de l’encart d’accueil après installation ;
- accès permanent depuis les paramètres du foyer, avec confirmation « application installée » ;
- détection du mode standalone sur iOS, Android et navigateurs compatibles.

## Fichiers contrôlés

- `src/components/install-app-card.tsx`
- `src/app/app/accueil/page.tsx`
- `src/app/app/foyer/page.tsx`
