# Rapport des corrections autonomes

## Corrections réalisées

### Identité PWA
- suppression du texte tronqué dans la source `public/symbole.png` ;
- régénération de toutes les icônes, favicons et splash screens ;
- marges de sécurité renforcées pour iOS et Android ;
- références Apple dédiées et cache versionné `v=4`.

### Paiement Stripe
- vérification obligatoire de `confirm_billing_event` avant toute réponse HTTP 200 ;
- journalisation explicite d’un échec de `fail_billing_event` ;
- clés Stripe stables pendant 15 minutes pour absorber doubles clics et répétitions réseau ;
- ajout de tests unitaires de l’idempotence.

### Justificatifs
- session vérifiée avant tout upload ;
- suppression de l’assertion dangereuse `user!.id` ;
- nettoyage garanti des fichiers orphelins, y compris en cas d’exception ;
- même durcissement pour les justificatifs de remboursement ;
- validation du fichier avant la création du remboursement.

### Supabase
- ajout de `00026_security_hardening.sql` ;
- retrait des droits anonymes sur les RPC sensibles ;
- retrait de l’exécution directe de la fonction de trigger ;
- `search_path` figé pour les fonctions signalées par le linter ;
- table de livraison de notifications explicitement réservée au service.

### Contexte du foyer
- filtre explicite sur l’utilisateur connecté ;
- sélection déterministe de l’adhésion active la plus ancienne.

### Dépôt et documentation
- suppression de `.env.production` du paquet final ;
- `.gitignore` renforcé pour toutes les variantes `.env` ;
- README remis en cohérence avec l’état actuel du produit.

## Vérifications réellement exécutées
- génération des icônes : réussie, aucun symbole ne touche les bords ;
- compilation syntaxique Python : réussie ;
- syntaxe du script SQL de test (shell) : réussie ;
- transpilation syntaxique TypeScript des fichiers modifiés : réussie.

## Vérifications non exécutables dans cet environnement
`npm ci` est bloqué par le miroir de paquets de l’environnement, qui ne fournit
pas `why-is-node-running@2.3.0`. En conséquence, Vitest, le build Next.js et
Playwright ne peuvent pas être lancés ici. Le `tsc` global ne dispose pas des
dépendances du projet et remonte donc les modules Next/React manquants plutôt
que des erreurs applicatives exploitables.

Avant mise en production, GitHub Actions/Vercel doivent exécuter :

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:sql
npm run test:e2e
```

## Action de déploiement
1. remplacer le contenu du dépôt GitHub par ce dossier ;
2. vérifier que `.env.production` n’est pas ajouté ;
3. appliquer la migration `00026_security_hardening.sql` ;
4. laisser Vercel déployer le commit ;
5. supprimer puis réinstaller l’icône PWA sur iPhone.

## Correction supplémentaire — rythme personnalisé et jour de bascule

### Défaut
La grille personnalisée est saisie du lundi au dimanche, mais le moteur utilisait
`startDate` comme index 0 du cycle. Si la règle entrait en vigueur un mercredi ou
un vendredi, la colonne « lundi » était appliquée à cette date et toutes les
bascules étaient décalées.

### Correction
- le cycle personnalisé est désormais ancré sur le lundi de la semaine contenant
  la date d'entrée en vigueur ;
- la date choisie reste la date d'activation de la règle, pas le premier jour
  artificiel du tableau ;
- une bascule configurée le vendredi reste le vendredi ;
- l'interface précise maintenant cette règle ;
- deux tests de non-régression couvrent une entrée en vigueur le mercredi et le
  vendredi, ainsi que la journée partagée à 18 h.

### Fichiers
- `src/lib/custody.ts`
- `src/app/app/foyer/page.tsx`
- `tests/rythmes.test.ts`

Aucune migration SQL n'est nécessaire : les cycles déjà enregistrés sont
interprétés correctement dès le déploiement du nouveau moteur.

## Lot rendez-vous et rappels

Ajout de la migration `00027_calendar_events_reminders.sql`, d'un écran complet
`/app/evenements`, des actions TypeScript associées et de l'intégration dans le
planning mensuel.

Fonctionnalités :
- rendez-vous partagé avec type, enfant, date, heure, fin, lieu et note ;
- jusqu'à cinq rappels configurables ;
- message pratique libre (« N'oublie pas son cartable », documents, tenue…) ;
- notification immédiate de l'autre parent à la création/modification/suppression ;
- rappels programmés pour les deux parents ;
- nettoyage des rappels futurs en cas de modification ou suppression ;
- point violet sur la journée du planning et détail du rendez-vous ;
- tests SQL E1 à E6 couvrant création, notifications, reprogrammation,
  suppression et isolation entre foyers.
