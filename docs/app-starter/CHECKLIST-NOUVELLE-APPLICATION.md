# Checklist universelle — nouvelle application

Étape 8 de la mission.

`IDÉE → CONCEPTION → ARCHITECTURE → DÉVELOPPEMENT → SÉCURITÉ → TESTS → BÊTA →
PRODUCTION → COMMERCIALISATION`

Chaque ligne : **tâche · critère de validation · bloquant production
OUI/NON**.

« Bloquant : OUI » signifie : interdiction de mettre en production tant que ce
n'est pas fait. Aucune exception, aucun « on le fera juste après ».

---

## 1. IDÉE

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Formuler le problème utilisateur | Une phrase, au présent, du point de vue de la personne, sans mentionner de solution | NON |
| [ ] | Définir la cible | Qui, dans quelle situation, sur quel appareil | NON |
| [ ] | Vérifier que le problème existe | Au moins 3 personnes de la cible le confirment sans être orientées | NON |
| [ ] | Identifier l'existant | Ce qui existe déjà et pourquoi ça ne suffit pas | NON |
| [ ] | Écrire le critère d'arrêt du MVP | Une phrase mesurable | NON |

## 2. CONCEPTION

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Lister les fonctionnalités MVP | ≤ 5 lignes en colonne « indispensable » | NON |
| [ ] | Déclarer le hors-périmètre | Écrit noir sur blanc | NON |
| [ ] | Tableau des données | Chaque donnée : sensible ? conservation ? qui la voit ? | **OUI** |
| [ ] | Décider du périmètre partagé | `features.workspacePartage` tranché | NON |
| [ ] | Modèle économique | Gratuit/payant et **où passe la limite** | NON |
| [ ] | Vérifier la viabilité des frais | Marge nette calculée après frais Stripe | NON |
| [ ] | Contraintes légales identifiées | SIREN, médiateur, données sensibles, AIPD | **OUI** |
| [ ] | `docs/00-PROJET.md` rempli | Les neuf questions ont une réponse écrite | NON |

## 3. ARCHITECTURE

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Partir du starter | Dépôt créé depuis le template | NON |
| [ ] | Renseigner `app.config.ts` | Aucune valeur d'exemple restante | **OUI** |
| [ ] | Renseigner `features.config.ts` | Chaque interrupteur décidé consciemment | NON |
| [ ] | `npm run verifier:config` | Passe sans avertissement | **OUI** |
| [ ] | Générer thème et icônes | 21 icônes produites, aucune rognée | **OUI** |
| [ ] | Modèle de données métier | Tables, relations, verrous d'intégrité identifiés | NON |
| [ ] | Décider des tables verrouillées | Toute table portant une règle que la RLS n'exprime pas | **OUI** |
| [ ] | Nettoyer le starter d'exemple | Aucun reste dans `src/metier/` | NON |

## 4. DÉVELOPPEMENT

### 4.1 Dépôt et déploiement

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Dépôt GitHub privé | `.gitignore` complet, aucun secret commité | **OUI** |
| [ ] | Secret scanning + push protection | Activés dans les paramètres | **OUI** |
| [ ] | Branches `main` / `develop` | Branche de production déclarée dans `AGENTS.md` | **OUI** |
| [ ] | Protection de branche | PR obligatoire, statut `verdict` requis | **OUI** |
| [ ] | Auteur Git configuré | `git config user.email` avec l'adresse GitHub | NON |
| [ ] | Projet Vercel lié | Production Branch **vérifiée** dans les réglages | **OUI** |
| [ ] | CI déclenchée sur la branche qui déploie | Vérifié dans `ci.yml` | **OUI** |

### 4.2 Supabase

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Projet créé, région choisie | UE si données personnelles européennes | **OUI** |
| [ ] | Auth activée, URL de redirection | Lien de réinitialisation testé de bout en bout | **OUI** |
| [ ] | Migrations du socle appliquées | `verification` renvoie une liste vide | **OUI** |
| [ ] | Migrations métier écrites | Idempotentes, transactionnelles, commentées | **OUI** |
| [ ] | RLS sur toutes les tables | Vérification programmatique, pas visuelle | **OUI** |
| [ ] | Chaque table a ≥ 1 policy | Aucune table ouverte par oubli | **OUI** |
| [ ] | Grants et durcissement | `service_role` : droits exacts, ni plus ni moins | **OUI** |
| [ ] | Seaux Storage privés | Chemin `{workspace_id}/…`, policies posées | **OUI** |

### 4.3 Interface

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Layout et navigation | ≤ 5 entrées, lues en configuration | NON |
| [ ] | États sur chaque écran | Chargement, erreur, vide, sans accès | **OUI** |
| [ ] | Pages d'erreur | `error.tsx`, `global-error.tsx`, `not-found.tsx` | **OUI** |
| [ ] | Mobile d'abord | Testé sur écran réel, cibles ≥ 44 px | **OUI** |
| [ ] | Accessibilité | Contraste AA, jamais la couleur seule, rôles ARIA | **OUI** |
| [ ] | Aucun élément factice | Pas de bouton mort, pas de donnée décorative | **OUI** |

### 4.4 PWA

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Manifeste complet | `id`, `short_name` ≤ 12 car., icônes 192 et 512 | **OUI** |
| [ ] | Service worker versionné | La version change entre deux builds | **OUI** |
| [ ] | Page hors ligne | Répond en mode avion | NON |
| [ ] | Installation iPhone réelle | Icône non rognée, pas de flash blanc | **OUI** |
| [ ] | Installation Android réelle | Maskable correcte dans le lanceur | **OUI** |
| [ ] | Mise à jour proposée | Nouveau déploiement → invite affichée | NON |

### 4.5 Notifications et e-mails

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Types déclarés | Insertion de données, aucune migration de structure | NON |
| [ ] | Déclencheurs métier | Auteur lu dans la ligne, jamais `auth.uid()` | **OUI** |
| [ ] | Personne notifié de sa propre action | Test le vérifie | **OUI** |
| [ ] | Idempotence des rappels | Tâche exécutée 2× → 1 notification | **OUI** |
| [ ] | Clés VAPID générées une fois | Identiques sur tous les environnements | **OUI** |
| [ ] | Push reçu sur iPhone installé | Testé sur appareil réel, iOS ≥ 16.4 | NON |
| [ ] | Domaine e-mail vérifié | SPF, DKIM, DMARC publiés | **OUI** |
| [ ] | Version texte de chaque e-mail | Présente pour tous les gabarits | NON |
| [ ] | Motif et désinscription | Sur chaque message | **OUI** |

### 4.6 Paiement (si `features.paiement`)

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Aucun montant dans le code | `verifier:config` ne trouve aucun littéral | **OUI** |
| [ ] | Table `plans` renseignée | Montants et `price_id` cohérents avec Stripe | **OUI** |
| [ ] | Checkout fonctionnel en Test | Session ouverte, retour correct | **OUI** |
| [ ] | Signature du webhook vérifiée | Requête non signée rejetée en 400 | **OUI** |
| [ ] | Webhook idempotent | Événement rejoué → un seul crédit | **OUI** |
| [ ] | Droits à trois états | Actif, grâce, expiré — grâce **testée** | **OUI** |
| [ ] | Portail client accessible | Résiliation possible sans écrire au support | **OUI** |
| [ ] | Résiliation avant suppression | Testé sur un compte avec abonnement actif | **OUI** |
| [ ] | Fonctions non validées désactivées | Drapeau absent de la production | **OUI** |

### 4.7 RGPD

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Consentement CGU journalisé | Ligne dans `consent_logs` avec version | **OUI** |
| [ ] | Export complet | Toutes les tables métier déclarées, contenu vérifié | **OUI** |
| [ ] | Suppression de compte | Testée : reconnexion impossible ensuite | **OUI** |
| [ ] | Durées de conservation | Publiées **et** appliquées | **OUI** |
| [ ] | Procédure de violation écrite | Document existant avant d'en avoir besoin | OUI |

## 5. SÉCURITÉ

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Aucun secret en `NEXT_PUBLIC_` | Vérifié dans `.env` et sur Vercel | **OUI** |
| [ ] | Aucun secret dans l'historique Git | Secret scanning silencieux | **OUI** |
| [ ] | Modules serveur protégés | `server-only` en tête | **OUI** |
| [ ] | En-têtes de sécurité | Vérifiés sur le domaine réel | **OUI** |
| [ ] | CSP à jour | Chaque service tiers déclaré | **OUI** |
| [ ] | Isolation entre workspaces | Test : A ne lit rien de B, même avec l'identifiant | **OUI** |
| [ ] | Tables verrouillées | Test : écriture directe refusée | **OUI** |
| [ ] | `service_role` limité | Webhook, tâches planifiées, sauvegarde uniquement | **OUI** |
| [ ] | Routes planifiées protégées | Appel sans `CRON_SECRET` refusé | **OUI** |
| [ ] | Diagnostic non public | Session requise, aucune valeur affichée | **OUI** |
| [ ] | Politique de mot de passe | Longueur minimale configurée dans Supabase | OUI |
| [ ] | Limitation de débit | Réglages Supabase Auth vérifiés | OUI |

## 6. TESTS

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Unitaires sur toute logique pure | Chaque moteur métier couvert | **OUI** |
| [ ] | Banc SQL fidèle | `extensions`, `service_role`, aucun privilège complaisant | **OUI** |
| [ ] | Isolation testée par table | Membre / non-membre / lecture seule | **OUI** |
| [ ] | Aucune suite orpheline | Tout fichier de `tests/` est exécuté | **OUI** |
| [ ] | E2E : pages et redirections | Vert en CI, sauts explicités | **OUI** |
| [ ] | Tests PWA automatiques | Manifeste, worker, icônes sans 404 | OUI |
| [ ] | Tests manuels sur appareil réel | iPhone **et** Android | **OUI** |
| [ ] | Tests de paiement | Les 11 cas de `08-STRIPE.md` § 8 | **OUI** |
| [ ] | Parcours complet | Inscription → usage → paiement → export → suppression | **OUI** |
| [ ] | CI verte sur la branche de production | Job `verdict` au vert | **OUI** |

## 7. BÊTA

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Zéro P0, zéro P1 | Liste des anomalies à jour | **OUI** |
| [ ] | Sauvegarde **restaurée** | Restauration réellement effectuée une fois | **OUI** |
| [ ] | 5 à 15 testeurs de la cible réelle | Pas des proches complaisants | NON |
| [ ] | Bandeau bêta + signalement | Accessible en un clic depuis l'app | NON |
| [ ] | Hash de version visible | Reporté dans chaque signalement | NON |
| [ ] | Boucle hebdomadaire tenue | Trier, corriger, livrer, **prévenir** | NON |
| [ ] | Un test par défaut corrigé | Aucune correction sans test | **OUI** |
| [ ] | ≥ 5 parcours complets aboutis | Par des testeurs, pas par l'auteur | **OUI** |
| [ ] | Critères GO tous vrais | Voir `11-BETA-PRODUCTION.md` § A.6 | **OUI** |

## 8. PRODUCTION

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | Migrations appliquées | Mode `verification` → liste vide | **OUI** |
| [ ] | Variables en portée Production | Aucune manquante, aucune de test | **OUI** |
| [ ] | Domaine définitif + HTTPS | HSTS actif, anciens hôtes redirigés en 307 | **OUI** |
| [ ] | Tâches planifiées | ≤ 1/jour si Hobby ; première exécution constatée | **OUI** |
| [ ] | Sauvegarde automatique active | Fichier présent le lendemain | **OUI** |
| [ ] | Bandeau bêta retiré | Drapeau abaissé | NON |
| [ ] | Déploiement **constaté** | Hash affiché = commit attendu | **OUI** |
| [ ] | Parcours de fumée en production | Inscription, connexion, écran principal | **OUI** |
| [ ] | Logs surveillés 1 h | Aucune erreur récurrente | **OUI** |
| [ ] | Retour arrière connu | Déploiement sain identifié, procédure écrite | **OUI** |

## 9. COMMERCIALISATION

| | Tâche | Critère de validation | Bloquant |
|---|---|---|---|
| [ ] | SIREN obtenu | Affiché dans les mentions légales | **OUI** |
| [ ] | Médiateur de la consommation | Adhésion effective, coordonnées publiées | **OUI** |
| [ ] | Mentions légales complètes | `identiteComplete()` renvoie vrai | **OUI** |
| [ ] | CGU / CGV publiées | Acceptation journalisée avec version | **OUI** |
| [ ] | Politique de confidentialité | Sous-traitants, durées, droits, contact | **OUI** |
| [ ] | DPA signés | Un par sous-traitant | **OUI** |
| [ ] | Stripe en mode Live | Compte activé, coordonnées bancaires vérifiées | **OUI** |
| [ ] | Produits et prix recréés en Live | Table `plans` mise à jour avec les `price_id` Live | **OUI** |
| [ ] | Webhook Live | Endpoint créé, secret distinct posé | **OUI** |
| [ ] | **Un vrai paiement effectué** | Droit crédité, puis remboursé | **OUI** |
| [ ] | Tarif affiché = tarif facturé | Même source, vérifié sur les trois écrans | **OUI** |
| [ ] | Contact réellement joignable | Message de test reçu et répondu | **OUI** |
| [ ] | Page d'aide en ligne | Questions fréquentes couvertes | NON |
| [ ] | Suivi J / J+1 / J+7 / J+30 | Vérifications planifiées | NON |

---

## Résumé — les dix verrous absolus

Si le temps manque pour tout vérifier, ces dix points ne se négocient jamais :

1. Aucun secret dans Git ni en `NEXT_PUBLIC_`.
2. RLS active sur toutes les tables, isolation **testée**.
3. Signature du webhook de paiement vérifiée.
4. Tarif affiché = tarif facturé, source unique.
5. Export et suppression fonctionnels et testés.
6. SIREN et médiateur de la consommation avant tout encaissement.
7. Sauvegarde **restaurée** au moins une fois.
8. CI verte sur la branche qui déploie.
9. Zéro P0 / P1 ouvert.
10. Déploiement constaté, pas supposé.
