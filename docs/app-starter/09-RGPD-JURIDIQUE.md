# 09 — RGPD et obligations juridiques

Étape 9 du mode opératoire.

> **Ce document n'est pas un avis juridique.** Il décrit ce qui a été mis en
> œuvre sur Coparentalité Zen et ce que le socle automatise. Les textes de
> Coparentalité Zen sont explicitement marqués « non validés par un
> professionnel » (`juridique/TEXTES-JURIDIQUES-PROVISOIRES.md`). Faire relire
> les textes avant commercialisation reste **À VALIDER** par un juriste.

---

## 1. Traiter le juridique tôt, pas à la fin

Trois éléments doivent exister **avant** la première ligne de métier :

1. le tableau des données de l'étape 0 (donnée / sensible / conservation /
   qui voit) ;
2. la route d'export, écrite **en même temps** que les tables — ajoutée après,
   elle en oublie ;
3. le journal de consentement, créé à l'inscription.

Repousser ces trois points produit une application qu'on ne peut pas mettre en
vente sans travaux.

## 2. Consentement

Table `consent_logs`, **immuable** (aucune policy update ni delete) :

```sql
consent_logs (id, profile_id, consent_kind, version, granted, ip_hash, created_at)
```

- `consent_kind` : `terms`, `privacy`, `marketing_email`, …
- `version` : la version des textes acceptée (`LEGAL_VERSION`, ex.
  `'2026-08-02'`). Sans elle, impossible de savoir **ce qui** a été accepté.
- `ip_hash` : haché, jamais l'adresse en clair.

Règles :

- l'acceptation des CGU est une **case à cocher explicite**, jamais
  pré-cochée, jamais déduite de l'usage ;
- le consentement marketing est **séparé** de l'acceptation des CGU ;
- changer les textes = nouvelle version = nouveau consentement à recueillir
  pour les changements substantiels.

## 3. Droit d'accès et de portabilité (art. 15 et 20)

`GET /api/mes-donnees` → JSON complet, immédiat, sans intervention humaine.

Deux points de conception qui comptent :

**1. L'export est construit avec la session du demandeur, jamais avec la clé
de service.** Les règles de sécurité s'appliquent donc telles quelles : nul ne
peut obtenir par ce chemin ce qu'il ne voit pas déjà à l'écran.

**2. Une table refusée ne fait pas échouer l'export entier.** Le demandeur
reçoit le reste **et sait ce qui manque** :

```ts
contenu[table] = error ? { non_communique: error.message } : (data ?? []);
```

Le socle fournit le mécanisme ; l'application déclare seulement la liste de
ses tables. ⚠ **Cette liste doit être mise à jour à chaque nouvelle table** —
c'est le point de dérive le plus probable. Le test correspondant compare la
liste exportée aux tables du schéma et échoue si l'une manque.

Format : JSON, lisible par machine, comme l'exige l'article 20.

## 4. Droit à l'effacement (art. 17)

`POST /api/supprimer-compte`, dans un ordre non négociable :

1. **résilier l'abonnement Stripe** — un échec interrompt tout ;
2. appeler `delete_my_account()` (anonymisation / suppression) ;
3. clore la session.

Motif : une fois le profil anonymisé, plus rien ne relie le compte au client
Stripe et le prélèvement continuerait au profit d'un compte inexistant. Mieux
vaut un effacement refusé qu'un effacement suivi d'un débit.

### Effacer quoi, exactement

| Donnée | Traitement | Motif |
|---|---|---|
| Profil, e-mail, nom | anonymisé | droit à l'effacement |
| Données personnelles propres | supprimées | idem |
| Données partagées avec d'autres membres | conservées, auteur anonymisé | les droits des autres personnes |
| Écritures comptables / factures | **conservées** | obligation légale (10 ans) |
| Journal d'audit | conservé, acteur anonymisé | intégrité de la preuve |

⚠ Le droit à l'effacement n'est pas absolu : une obligation légale de
conservation prime. Il faut alors **le dire** dans la politique de
confidentialité, pas effacer en silence ni refuser sans explication.

Confirmation : demander de saisir un mot (« SUPPRIMER »), pas une simple
validation. L'action est irréversible.

## 5. Minimisation et conservation

Ne collecter que ce qui sert. Chaque champ doit répondre à « à quoi sert-il ? ».

Durées déclarées dans `app.config.ts` (`legal.conservation`) **et** publiées
dans la politique de confidentialité :

| Donnée | Durée type | Base |
|---|---|---|
| Compte actif | tant que le compte existe | exécution du contrat |
| Compte inactif | 3 ans après le dernier accès | pratique courante |
| Journaux techniques | 12 mois | sécurité |
| Facturation | 10 ans | obligation comptable |
| Sauvegardes | selon la rotation, à documenter | sécurité |

Une durée annoncée doit être **appliquée** : prévoir la purge, ou ne pas
l'annoncer.

## 6. Sous-traitants

Chaque prestataire traitant des données pour le compte de l'éditeur exige un
contrat de sous-traitance (DPA) et doit figurer dans la politique de
confidentialité.

| Prestataire | Rôle | Localisation | DPA |
|---|---|---|---|
| Supabase | base, auth, stockage | région choisie (UE possible) | À VALIDER |
| Vercel | hébergement, logs | à documenter | À VALIDER |
| Resend | envoi d'e-mails | région configurable (`eu-west-1`) | À VALIDER |
| Stripe | paiement | responsable de traitement pour sa part | À VALIDER |
| Apple / Google / Mozilla | relais Push | message chiffré, illisible par eux | à mentionner |

⚠ Sur Coparentalité Zen, ces quatre DPA sont **non signés à ce jour**. C'est un
point bloquant avant commercialisation, pas un détail administratif.

Choisir des régions européennes autant que possible : cela évite d'avoir à
justifier un transfert hors UE.

## 7. Identité de l'éditeur

Obligatoire dès qu'un site est accessible au public en France.

| Élément | Variable |
|---|---|
| Dénomination | `LEGAL_PUBLISHER_NAME` |
| Forme juridique | `LEGAL_PUBLISHER_FORM` |
| **SIREN** | `LEGAL_PUBLISHER_SIREN` |
| Adresse | `LEGAL_PUBLISHER_ADDRESS` |
| Responsable de publication | `LEGAL_PUBLISHER_DIRECTOR` |
| Contact | `LEGAL_CONTACT_EMAIL` |
| Hébergeur | nom et adresse |
| **Médiateur de la consommation** | `LEGAL_MEDIATOR` |

Le socle reprend deux protections éprouvées de `src/lib/legal.ts` :

1. **Plusieurs noms de variable acceptés par valeur.** Renommer une variable de
   production est risqué quand on ne peut pas refaire l'opération à
   l'identique ; mieux vaut que le code s'adapte.
2. **Validation de format.** Une valeur d'attente recopiée à la place d'une
   vraie (le cas s'est produit : une consigne de rédaction s'est retrouvée
   dans la variable de contact) doit afficher « À compléter » plutôt qu'une
   phrase qui trahit l'inachèvement. Le SIREN est vérifié : neuf chiffres.

Et surtout, une fonction `identiteComplete()` que la **checklist de production
interroge programmatiquement**. On ne se fie pas à une relecture.

⚠ **Renseigner le SIREN ne suffit pas à rendre l'identité complète.**
`identiteComplete()` exige **trois** conditions réunies :

1. un SIREN plausible — neuf chiffres, espaces tolérés ;
2. une dénomination **différente du nom de l'application** — tant que
   `LEGAL_PUBLISHER_NAME` n'est pas renseignée, la valeur de repli est le nom
   du produit et la fonction renvoie `false` ;
3. une adresse renseignée et de plus de dix caractères.

Après avoir posé une variable d'identité, deux vérifications :
appeler `/api/diagnostic` (qui expose `etatIdentite()` : chaque champ y est
`renseigné`, `manquant` ou `valeur invalide`), puis **redéployer** — une
variable modifiée sur l'hébergeur n'existe qu'au déploiement suivant.

**État Coparentalité Zen au 2026-08-28 :** SIREN obtenu et renseigné.
Dénomination, adresse et responsable de publication restent à confirmer sur
le déploiement de production par ce même point de diagnostic.

## 8. Le médiateur de la consommation

⚠ **Obligation méconnue et bloquante.** L'article L612-1 du code de la
consommation impose à tout professionnel vendant à des particuliers en France
d'adhérer à un dispositif de médiation et d'en communiquer les coordonnées.

Sur Coparentalité Zen, `LEGAL_MEDIATOR` vaut encore « À compléter avant
commercialisation publique ». Le SIREN étant désormais obtenu, c'est le
**dernier verrou juridique de cette nature**, et il reste bloquant.

L'adhésion se fait auprès d'un médiateur agréé (payante, quelques dizaines à
centaines d'euros par an). S'y prendre plusieurs semaines à l'avance.

## 9. Documents à publier

| Document | Route | Contenu minimal |
|---|---|---|
| Mentions légales | `/mentions-legales` | éditeur, hébergeur, contact, médiateur |
| CGU | `/cgu` | objet, compte, obligations, responsabilité, résiliation |
| CGV | `/cgv` ou dans les CGU | prix TTC, paiement, rétractation, résiliation |
| Confidentialité | `/confidentialite` | données, finalités, bases légales, durées, sous-traitants, droits, contact |
| Contact | `/contact` | un moyen réellement joignable |
| Cookies | dans la confidentialité | voir § 10 |

Le socle fournit `LegalPage` et `SectionJuridique` : structure homogène,
version affichée, mise à jour d'un seul endroit.

⚠ **Rédiger, mais faire relire.** Le socle livre des **gabarits** avec des
emplacements marqués `[À COMPLÉTER]` et un avertissement en tête. Ils ne sont
pas des textes prêts à publier.

## 10. Cookies et mesure d'audience

Le socle n'utilise que des cookies **strictement nécessaires** (session
Supabase) : pas de bandeau de consentement requis pour ceux-là.

Dès qu'un outil de mesure ou de publicité est ajouté, un bandeau conforme
devient nécessaire — refus aussi simple que l'acceptation, aucun dépôt avant
choix.

À VALIDER : le statut exact de Vercel Analytics au regard du consentement
dépend de sa configuration. Vérifier avant de compter dessus.

## 11. Sécurité et violation de données

- Chiffrement en transit (HTTPS forcé par HSTS) et au repos (fourni par
  Supabase).
- Journal d'audit immuable.
- **Procédure de violation** : en cas de fuite, notification à la CNIL sous
  **72 heures**, et information des personnes si le risque est élevé. Écrire
  la procédure **avant** d'en avoir besoin ; le socle fournit un canevas dans
  `docs/PROCEDURE-VIOLATION.md`.

## 12. Checklist juridique avant commercialisation

Bloquant = interdit d'encaisser tant que ce n'est pas fait.

| Élément | Bloquant |
|---|---|
| SIREN obtenu et affiché | **OUI** |
| Médiateur de la consommation désigné | **OUI** |
| Mentions légales complètes | **OUI** |
| CGU / CGV publiées et acceptées à l'inscription | **OUI** |
| Politique de confidentialité à jour | **OUI** |
| Export fonctionnel et testé | **OUI** |
| Suppression fonctionnelle et testée | **OUI** |
| Consentement journalisé avec version | **OUI** |
| DPA avec chaque sous-traitant | **OUI** |
| Durées de conservation publiées et appliquées | OUI |
| Procédure de violation écrite | OUI |
| Textes relus par un professionnel | recommandé |
| Bandeau cookies si outil non essentiel | selon le cas |
| AIPD si données sensibles | selon le cas |
