# Rapport de tests — Moteurs métier (planning & budget)

**Date : 22/07/2026 · Vitest 4.1.10, Node 22, TypeScript 7 mode strict (`tsc --noEmit` : 0 erreur) · 34/34 tests passés.**

| Fonction | Statut | Test effectué | Résultat |
|---|---|---|---|
| Une semaine sur deux | Fonctionnel et testé | Bascule au 7e jour, ancre lundi | Passe |
| Semaines paires / impaires | Fonctionnel et testé | Parité ISO 8601 vérifiée (semaine 2 → paire) | Passe |
| 2-2-3 | Fonctionnel et testé | Séquence exacte `11221112211222`, 7 j/parent/quinzaine, cycle répétable | Passe |
| 2-2-5-5 | Fonctionnel et testé | Séquence exacte `11221111122222`, équilibre 7/7 | Passe |
| Un week-end sur deux | Fonctionnel et testé | Sam+dim rattachés, alternance, semaine chez P1 | Passe |
| Rythme personnalisé | Fonctionnel et testé | Cycle libre 3 jours | Passe |
| Vacances prioritaires | Fonctionnel et testé | Remplacement strict sur la période, règle intacte avant/après ; moitiés (impair → 1re moitié plus longue) ; alternance par année | Passe |
| Exceptions / échanges | Fonctionnel et testé | Écrasent même les vacances ; source `exchange` tracée | Passe |
| Intégrité calendrier | Fonctionnel et testé | 12 mois × 6 rythmes + 2 périodes de vacances : zéro trou, zéro chevauchement ; le validateur détecte bien un trou artificiel | Passe |
| Partages 50/50, 60/40, 70/30, 75/25, 100/0 | Fonctionnel et testé | Cas nominaux + montants impairs | Passe |
| Arrondis | Fonctionnel et testé | **Test de propriété : 3 000 combinaisons** (500 montants × 6 répartitions) — somme des parts toujours exactement égale au total, aucune part négative | Passe |
| Montants fixes & règles mixtes | Fonctionnel et testé | Fixe servi puis prorata ; rejet si fixes > total ou centimes orphelins | Passe |
| Garde-fous | Fonctionnel et testé | Rejet : montant ≤ 0, flottants, répartition ≠ 100 %, points de base hors bornes | Passe |
| Solde net | Fonctionnel et testé | Exemple du cahier des charges (50 € / 30 € → net 20 €), libellés neutres exacts | Passe |
| Remboursements | Fonctionnel et testé | Partiel puis complet → « Les comptes sont équilibrés » ; rejet ≤ 0 | Passe |
| Multi-enfants | Fonctionnel et testé | Agrégation de parts par enfant | Passe |

Anomalies : aucune. Risque résiduel : les moteurs travaillent en dates civiles ; l'heure de passage est portée par la règle et affichée par l'interface (choix documenté dans le code).
