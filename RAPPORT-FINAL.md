# RAPPORT FINAL — Coparentalité Zen
**22/07/2026 · Statuts autorisés : Fonctionnel et testé · Fonctionnel avec réserve · Partiellement fonctionnel · Non développé · Bloqué par une action externe**

| Fonction | Statut | Test effectué | Résultat | Anomalie | Risque | Action restante |
|---|---|---|---|---|---|---|
| Identité visuelle (10 variantes du logo, tokens, charte) | Fonctionnel et testé | Génération + contrôle visuel des 3 variantes critiques + contrastes WCAG calculés | Fidèle à l'original ; rose/sauge réservés au décoratif avec variantes texte AA | Pas de SVG fidèle possible (script manuscrit) — PNG HD à la place, documenté | Faible | — |
| Schéma BDD (33 tables) | Fonctionnel et testé | Migrations exécutées sur PostgreSQL 16 réel | 0 erreur | Aucune | Faible | Rejouer sur Supabase (Action 2 du guide) |
| Isolation des foyers (RLS) | Fonctionnel et testé | 14 tests en rôle non privilégié : lecture/écriture inter-foyers, ID devinés, rôles, données médicales | Tous passés | Aucune | Faible | Confirmer sur Supabase réel + policies Storage |
| Vacances scolaires 2026-2027 | Fonctionnel et testé | Vérification contre sources officielles | Zones A/C initialement inversées → corrigées | Corrigée | Faible | Confirmer sur education.gouv.fr |
| Moteur de planning (6 rythmes + custom, vacances, exceptions) | Fonctionnel et testé | 15 tests dont 12 mois × 6 rythmes : zéro trou/chevauchement ; validateur auto-testé | 15/15 | Aucune | Faible | — |
| Moteur monétaire (partages, arrondis, soldes, remboursements) | Fonctionnel et testé | 19 tests dont propriété sur 3 000 combinaisons | 19/19, somme toujours exacte | Aucune | Faible | — |
| Application Next.js (12 routes, PWA, design system) | Fonctionnel et testé | Build production + typecheck strict + requêtes HTTP sur serveur réel ; solde et planning SSR vérifiés au calcul | 12 routes en 200, valeurs exactes | Aucune | Faible | — |
| Formulaire d'ajout de dépense | Fonctionnel et testé | Conversion €→centimes sans flottant, aperçu de partage, erreurs FR | Conforme | Enregistrement serveur non branché (mode démo) | Moyen | Brancher l'insert Supabase après déploiement |
| Authentification (inscription, connexion, vérif. e-mail, mdp oublié) | Fonctionnel avec réserve | Code écrit sur l'API Supabase officielle ; compilation OK | Non testable sans projet Supabase | — | Moyen | Tester après Actions 1-5 du guide |
| Invitations, rôles, foyer | Partiellement fonctionnel | Côté BDD : testé (RLS T12-T14) ; côté interface : non développé | — | — | Moyen | Écrans d'invitation à développer |
| Rapport mensuel PDF | Fonctionnel et testé | Génération + vérification du contenu par extraction (solde 31,05 €, mentions, tableaux) | Conforme ; logo 30 mm, information prioritaire | Contrôle visuel du rendu non réalisé dans cet environnement | Faible | Un coup d'œil humain au PDF ; portage Node en production |
| Rapport annuel, CSV, Excel, ICS | Non développé | — | — | — | Moyen | À développer (gabarit mensuel réutilisable) |
| E-mails transactionnels (9 modèles) | Fonctionnel avec réserve | Gabarits HTML+texte écrits, branding conforme | Non envoyés réellement (aucun serveur mail ici) | — | Faible | Brancher dans Supabase Email Templates |
| Justificatifs & documents (upload, URL signées) | Non développé | Schéma + RLS prêts et testés côté BDD | — | — | Élevé pour la promesse produit | Écrans + policies Storage à faire |
| Messagerie, notifications, demandes de modification (interface) | Non développé | Schéma BDD prêt et testé | — | — | Moyen | Écrans à développer |
| Reformulation neutre des messages | Non développé | — | — | — | Faible | Post-MVP |
| Stripe / offres payantes | Bloqué par une action externe | Architecture BDD prête (plans, subscriptions) | — | — | Faible | Actions 7-8 du guide |
| RGPD (textes, export, suppression) | Partiellement fonctionnel | Textes provisoires rédigés ; consent_logs en BDD | Export/suppression non développés | — | Élevé avant commercialisation | Juriste (Action 7) + développer export/suppression |
| Tests E2E Playwright, accessibilité outillée, tests sur appareils réels | Non développé | — | — | — | Moyen | Après déploiement |
| Page commerciale, tarifs, FAQ | Fonctionnel et testé | Rendu SSR vérifié ; mention légale en pied de page ; aucun faux témoignage | Conforme | Aucune | Faible | — |
| Audit de différenciation Kakeibo | Fonctionnel avec réserve | Audit de conception documenté (charte) : palette, typo, navigation, vocabulaire distincts | Différenciation forte par construction | Comparaison écran par écran non refaite sur produit fini | Faible | Refaire l'audit visuel avant lancement public |

## Conclusion honnête : **prêt pour des tests internes.**

Justification par les résultats réels : les fondations critiques sont développées
ET testées (48 tests automatisés passés : 14 RLS + 34 moteurs ; build de production
vérifié ; calculs SSR contrôlés au centime). Mais le produit n'atteint pas encore
les critères de la section 31 pour une vente : l'authentification réelle, les
justificatifs, l'export des données personnelles et la suppression de compte ne
sont pas testés ou pas développés, et les textes juridiques ne sont pas validés.

**Chemin vers « prêt pour une bêta »** : Actions 1-5 du guide (≈ 1 h), test
d'authentification réel, développement des écrans justificatifs + export/suppression
RGPD, puis re-test de la liste section 31 sur l'application en ligne.
