# Coparentalité Zen — Marketing IA v1

## Livrable

Workflow importable : `n8n/01_Marketing_AI_v1.json`

Il génère et valide automatiquement :

- une fiche Etsy complète ;
- exactement 13 tags Etsy ;
- plusieurs idées Pinterest ;
- une légende et un carrousel Instagram ;
- un script TikTok de 30 secondes ;
- un e-mail marketing ;
- les textes des visuels ;
- une liste des informations manquantes à vérifier.

## Installation dans n8n Cloud

1. Ouvrez n8n.
2. Créez un workflow vide.
3. Menu `...` → **Import from File**.
4. Importez `01_Marketing_AI_v1.json`.
5. Ouvrez le nœud **OpenAI gpt-5-mini**.
6. Sélectionnez votre credential déjà créé : `n8n free OpenAI API credits`.
7. Enregistrez.

## Utilisation

1. Ouvrez **Produit à commercialiser**.
2. Remplacez les valeurs d'exemple par votre produit réel.
3. Cliquez sur **Execute workflow**.
4. Ouvrez **Livrable prêt à valider**.

Le statut attendu est :

`READY_FOR_HUMAN_REVIEW`

Si le JSON ne respecte pas les contraintes Etsy, le workflow dirige la sortie vers **Rapport de correction** et indique les erreurs.

## Sécurité

- Aucune publication automatique n'est effectuée.
- Aucun identifiant ou secret n'est inclus dans le fichier.
- Le credential OpenAI doit être sélectionné manuellement après import.
- Une validation humaine reste obligatoire avant Etsy ou les réseaux sociaux.

## État

Ce module est autonome et exploitable. Le module suivant pourra consommer directement son objet `marketing_package` pour créer un brouillon Etsy.
