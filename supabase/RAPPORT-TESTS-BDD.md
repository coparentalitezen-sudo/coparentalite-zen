# Rapport de tests — Base de données Coparentalité Zen

**Date : 22/07/2026 · Environnement : PostgreSQL 16.14 (identique au moteur Supabase), RLS active, exécution en rôle non privilégié `authenticated` avec simulation de `auth.uid()`.**

| Fonction | Statut | Test effectué | Résultat | Anomalie | Risque | Action restante |
|---|---|---|---|---|---|---|
| Migration 00001 (33 tables, types, index, triggers) | Fonctionnel et testé | Exécution complète sur PG16 | Passe sans erreur | Aucune | Faible | Rejouer sur Supabase réel |
| Migration 00002 (RLS, 50+ policies) | Fonctionnel et testé | Exécution + 14 tests d'isolation | Passe | Aucune | Faible | Rejouer sur Supabase réel |
| Migration 00003 (seed : 17 catégories, 3 plans, vacances 2026-2027) | Fonctionnel et testé | Exécution + comptage | 9 périodes, 17 catégories, 3 plans | Dates initiales zones A/C inversées → **corrigées** après vérification des sources officielles | Faible | Confirmer sur education.gouv.fr avant mise en prod |
| Isolation inter-foyers (lecture) | Fonctionnel et testé | T1–T6 : foyer, enfants, dépenses, justificatifs (y c. par ID direct), documents | Aucune fuite | Aucune | Faible | — |
| Isolation inter-foyers (écriture) | Fonctionnel et testé | T7 update, T9 insert cross-foyer | 0 ligne / rejet RLS | Aucune | Faible | — |
| Utilisateur sans foyer | Fonctionnel et testé | T8 : lecture households/children/expenses | 0 donnée visible | Aucune | Faible | — |
| Rôle médiateur lecture seule | Fonctionnel et testé | T12 lecture OK, T13 écriture refusée | Conforme | Aucune | Faible | — |
| Protection données médicales enfants | Fonctionnel et testé | T11 parent y accède, T14 médiateur non (vue `children_medical`) | Conforme | Aucune | Moyen | L'app ne doit jamais sélectionner `allergies`/`medical_notes` hors de la vue |
| Montants monétaires | Fonctionnel et testé | Contraintes `amount_cents > 0` (bigint), parts en points de base | Types validés à la création | Aucune | Faible | Tests d'arrondis côté app (Vitest, phase suivante) |
| Storage / URL signées | Non développé | — | — | — | — | Dépend du bucket Supabase réel |

**Limites honnêtes de ces tests :** ils valident le schéma et la RLS sur un PostgreSQL local avec `auth.uid()` simulé. Sur Supabase réel, il restera à vérifier : les policies du Storage (buckets privés + URL signées), le comportement avec le rôle `service_role`, et l'intégration Supabase Auth. Ces points sont dans le guide de déploiement.

**Conclusion de phase : schéma prêt pour tests internes.**
