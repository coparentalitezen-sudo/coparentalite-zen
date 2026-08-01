# Pastille de notifications sur l’icône

- synchronisation avec le nombre de notifications non lues ;
- effacement immédiat quand tout est lu ;
- écran d’activation dans les réglages ;
- détection du mode PWA installé ;
- service worker prêt pour une future réception Web Push ;
- tests unitaires ajoutés.

Limite : quand l’application est totalement fermée, une nouvelle notification
ne peut actualiser la pastille en arrière-plan qu’avec le futur canal Web Push.
