# AI Workflow

## Rôles
- Claude = développeur principal : implémente les changements, corrige le code, crée la branche.
- ChatGPT = auditeur et contrôleur qualité : relit la demande, vérifie la portée, suggère des améliorations et des risques.
- GitHub Actions = contrôles automatiques : exécution des scripts, détection des conflits et validation du build.
- Vercel = prévisualisation : affiche le rendu de la branche pour validation visuelle, mobile et fonctionnelle.
- n8n = orchestration : pilote les notifications, les flux de tâches et les vérifications externes sans modifier le code.
- Utilisateur = validation finale : confirme que la fonctionnalité répond au besoin et que tout est sain.

## Cycle de travail
1. Une demande est formulée, soit par un ticket, soit par l’agent AI.
2. Claude travaille sur une branche dédiée (`ai-agent` ou une branche de fonctionnalité), jamais directement sur `main`.
3. Claude réalise les modifications, puis pousse la branche vers le dépôt.
4. Claude ouvre une Pull Request vers `main` en décrivant l’objectif, le comportement attendu et les tests réalisés.
5. ChatGPT audite la Pull Request et le code : lisibilité, conformité, risques, cohérence métier.
6. GitHub Actions exécute le workflow `ai-quality-gate.yml` pour :
   - installer les dépendances ;
   - rechercher les marqueurs de conflit Git ;
   - exécuter les scripts de vérification présents dans `package.json` ;
   - lancer `npm run build`.
7. Vercel génère une preview de la branche afin de vérifier l’interface, le rendu et l’expérience mobile.
8. n8n orchestre les étapes de suivi : notifications, relances, vérification que les checks sont passés.
9. L’utilisateur vérifie la preview, la conformité Supabase, et donne sa validation finale.
10. La fusion est réalisée manuellement seulement si toutes les vérifications sont vertes.

## Principes importants
- Aucune modification directe sur `main`.
- Aucun secret ne doit être ajouté dans le code, dans les fichiers de configuration ou dans les PR.
- Les conflits Git doivent être détectés et résolus avant fusion.
- Le workflow doit rester un contrôle, pas un déploiement automatique.
- Vercel est réservé à la prévisualisation, pas à la production.
