# 11 — Bêta et mise en production

Étapes 12 et 13 du mode opératoire.

---

# Partie A — Bêta

## A.1 Stabilisation

Avant d'ouvrir à qui que ce soit :

- [ ] `npm run verify` et `npm run test:sql` passent
- [ ] CI verte **sur la branche de production**
- [ ] aucun `TODO` bloquant dans le code livré
- [ ] aucun bouton factice, aucune donnée décorative, aucune simulation
      présentée comme fonctionnelle
- [ ] hash de version visible dans l'application
- [ ] `/api/diagnostic` cohérent avec les fonctionnalités actives
- [ ] sauvegarde exécutée **et restauration testée** — une sauvegarde jamais
      restaurée n'est pas une sauvegarde

## A.2 Classement des anomalies

| Rang | Définition | Traitement |
|---|---|---|
| **P0** | perte de données, faille, encaissement sans contrepartie, application inutilisable | correction immédiate, bêta suspendue |
| **P1** | fonctionnalité principale cassée sans contournement | correction avant élargissement |
| **P2** | gêne avec contournement | planifié |
| **P3** | confort, cosmétique | après le lancement |

**Aucun P0 ni P1 ouvert** n'est la condition d'ouverture de la bêta, et la
condition de passage en production.

## A.3 Bêta privée

**Qui.** 5 à 15 personnes de la cible réelle, pas des proches complaisants.
Une personne qui ne rencontre pas le problème que l'application résout ne
teste rien d'utile.

**Cadre à leur donner :**

- ce que l'application fait et ne fait pas encore ;
- que les données sont réelles (ou qu'elles ne le sont pas — le dire) ;
- comment signaler un problème, en un clic depuis l'application ;
- une durée annoncée et tenue.

**Bandeau bêta** dans l'application : rappelle le statut et ouvre le
signalement. Il disparaît avec un simple drapeau de configuration.

**Pendant la bêta**, les détails techniques des erreurs sont visibles dans un
dépliant — c'est ce qui permet à un testeur de rapporter autre chose que
« ça ne marche pas ».

## A.4 Collecte

| Information | Pourquoi |
|---|---|
| Ce que la personne essayait de faire | l'intention, pas le clic |
| Ce qui s'est passé | l'écart |
| Appareil, système, navigateur | iOS ≠ Android ≠ bureau |
| **Hash de version** | sinon on corrige un bug déjà corrigé |
| Capture d'écran | inestimable |

À suivre côté produit, sans outil compliqué : taux d'inscriptions abouties,
taux d'installations sur l'écran d'accueil, écran de premier abandon, retour
à J+7.

## A.5 Boucle de correction

Cycle hebdomadaire, sans exception :

1. trier (P0…P3) ;
2. corriger P0 et P1 ;
3. livrer ;
4. **prévenir les testeurs de ce qui a changé** — sinon ils cessent de
   signaler ;
5. ajouter un test pour chaque défaut corrigé.

Cette dernière règle est ce qui fait qu'un projet ne régresse pas.

## A.6 Critères GO / NO-GO

**GO — tout doit être vrai :**

- [ ] zéro P0, zéro P1 ouvert
- [ ] parcours complet (`10-TESTS.md` § 8) réussi sur iPhone **et** Android
- [ ] au moins 5 testeurs ont mené le parcours principal jusqu'au bout
- [ ] aucun signalement de perte ou d'incohérence de données
- [ ] paiement testé de bout en bout en mode Test
- [ ] export et suppression vérifiés sur un compte réel
- [ ] notifications reçues sur appareil réel
- [ ] textes légaux publiés et complets
- [ ] sauvegarde restaurée avec succès au moins une fois

**NO-GO — un seul suffit :**

- un P0 ouvert ;
- une incohérence de données non expliquée ;
- l'installation qui échoue sur une plateforme cible ;
- un droit payant crédité de travers ;
- une identité légale incomplète alors que l'encaissement est prévu ;
- un doute non levé sur la sécurité.

⚠ Un NO-GO se respecte. Le coût d'un lancement raté sur un produit de
confiance est bien supérieur à celui d'un report.

---

# Partie B — Production

## B.1 Checklist finale

### Technique

- [ ] CI verte sur la branche de production
- [ ] toutes les migrations appliquées (mode `verification` → liste vide)
- [ ] variables d'environnement complètes en portée **Production**
- [ ] domaine définitif branché, HTTPS actif, HSTS vérifié
- [ ] anciens hôtes redirigés (307)
- [ ] tâches planifiées déclarées, ≤ 1/jour si offre Hobby
- [ ] `CRON_SECRET` posé, routes planifiées inaccessibles sans lui
- [ ] sauvegarde automatique active **et restauration testée**
- [ ] en-têtes de sécurité vérifiés sur le domaine réel
- [ ] `/api/diagnostic` réservé aux utilisateurs authentifiés
- [ ] bandeau bêta retiré

### Base

- [ ] RLS active sur toutes les tables (vérification programmatique)
- [ ] aucune table sans policy de lecture
- [ ] tables verrouillées : écriture directe refusée (test)
- [ ] `service_role` : droits exacts, ni plus ni moins
- [ ] fonctions publiques : `grant` explicite à `anon` uniquement là où c'est
      voulu

### Paiement (si actif)

- [ ] Stripe en mode Live, compte activé
- [ ] produits et prix recréés en Live, table `plans` mise à jour
- [ ] webhook Live créé, secret distinct posé
- [ ] **un vrai paiement effectué, droit crédité, puis remboursé**
- [ ] portail client accessible
- [ ] résiliation testée
- [ ] période de grâce testée (échec de renouvellement)
- [ ] fonctionnalités de paiement non validées : drapeau **absent** de la
      production

### Juridique — bloquant

- [ ] SIREN obtenu et affiché
- [ ] **médiateur de la consommation désigné**
- [ ] mentions légales, CGU/CGV, confidentialité publiées et à jour
- [ ] consentement journalisé avec version
- [ ] export et suppression testés sur un compte réel
- [ ] DPA signés avec chaque sous-traitant
- [ ] durées de conservation publiées **et appliquées**

### Produit

- [ ] parcours d'entrée compréhensible sans explication orale
- [ ] écrans vides expliqués et actionnables
- [ ] messages d'erreur lisibles, détails techniques masqués en production
- [ ] page d'aide et contact réellement joignable
- [ ] tarifs affichés = tarifs facturés (même source)

## B.2 Le jour du lancement

1. Appliquer les migrations en attente (`verification` puis `appliquer`).
2. Fusionner vers la branche de production.
3. **Constater** le déploiement : hash affiché dans l'application.
4. Parcours de fumée en production : page publique, inscription, connexion,
   écran principal, un paiement réel, un remboursement.
5. Vérifier les Runtime Logs pendant une heure.
6. Vérifier l'exécution de la première tâche planifiée.

## B.3 Les premiers jours

| Jour | Vérification |
|---|---|
| J | logs d'erreur, premières inscriptions abouties |
| J+1 | première exécution de chaque tâche planifiée |
| J+2 | notifications réellement reçues |
| J+7 | sauvegardes présentes, premier paiement récurrent |
| J+30 | premier renouvellement, premier échec éventuel |

## B.4 En cas de problème

**Incident de code** → *Promote to Production* d'un déploiement sain.
Instantané, sans reconstruction.

**Incident de données** → arrêter les écritures concernées, évaluer l'étendue,
restaurer depuis la sauvegarde indépendante, **puis seulement** rouvrir.

⚠ Un retour de code ne défait pas une migration. D'où la règle : toute
migration doit rester compatible avec la version précédente du code (ajouter
avant d'utiliser, supprimer un déploiement plus tard).

**Fuite de données** → procédure de violation : notification CNIL sous 72 h,
information des personnes si le risque est élevé. La procédure doit être
écrite **avant** d'en avoir besoin.

## B.5 Après le lancement

Ce qui reste vrai indéfiniment :

- une seule personne écrit sur la branche de production à la fois ;
- aucun commit ne reste local en fin de session ;
- chaque défaut corrigé reçoit un test ;
- ce qui a été appris remonte dans le starter, pas seulement dans cette
  application.
