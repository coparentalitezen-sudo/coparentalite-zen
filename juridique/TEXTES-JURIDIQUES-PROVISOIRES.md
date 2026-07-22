# Textes juridiques provisoires — Coparentalité Zen

> ⚠️ **CES TEXTES SONT DES BROUILLONS DE TRAVAIL.** Ils doivent être relus et validés
> par un juriste ou un avocat spécialisé en protection des données AVANT toute
> commercialisation. Les champs entre crochets sont à compléter avec l'identité
> légale du propriétaire.

---

## 1. Mentions légales (brouillon)

Le site et l'application Coparentalité Zen sont édités par **[raison sociale / nom]**,
**[forme juridique — ex. micro-entreprise]**, immatriculée sous le numéro **[SIREN]**,
dont le siège est situé **[adresse]**. Directeur de la publication : **[nom]**.
Contact : **[e-mail de contact]**. Hébergement de l'application : Vercel Inc. ;
hébergement des données : Supabase, région **[eu-west / eu-central — choisir une région UE]**.

## 2. Politique de confidentialité (brouillon)

**Responsable de traitement.** [Identité légale ci-dessus].

**Données collectées.** Uniquement les données nécessaires au service : adresse e-mail,
prénom, données du foyer (enfants, planning de garde, dépenses, remboursements,
documents déposés, messages). Les informations médicales des enfants (allergies,
notes médicales) sont facultatives, saisies volontairement par les parents, et
accessibles aux seuls parents du foyer.

**Finalités et bases légales.** Fourniture du service (exécution du contrat),
e-mails transactionnels (exécution du contrat), e-mails d'information facultatifs
(consentement, retirable à tout moment), facturation (obligation légale),
sécurité et journal d'audit (intérêt légitime).

**Durées de conservation.** Compte actif : durée d'utilisation du service.
Après suppression du compte : effacement sous 30 jours, sauf données de facturation
(10 ans, obligation légale) et journaux techniques (12 mois maximum).
**[Durées à confirmer par le juriste.]**

**Destinataires.** Les données ne sont ni vendues ni transmises à des tiers à des
fins commerciales. Sous-traitants techniques : Supabase (base de données et
stockage, région UE), Vercel (hébergement applicatif), **[prestataire e-mail]**,
Stripe (paiement, lorsque activé).

**Vos droits.** Accès, rectification, effacement, portabilité (export de vos
données depuis les paramètres), limitation et opposition. Exercice des droits :
**[e-mail confidentialité]**. Réclamation possible auprès de la CNIL (cnil.fr).

**Mineurs.** Les comptes sont réservés aux adultes. Les données concernant les
enfants sont saisies par leurs parents, sous leur responsabilité, aux seules
fins d'organisation familiale.

## 3. Conditions générales d'utilisation (brouillon)

**Objet.** Coparentalité Zen est un outil d'organisation et de suivi destiné aux
parents séparés : planning de garde, dépenses partagées, remboursements, documents.

**Limite essentielle.** Coparentalité Zen est un outil d'organisation et de suivi.
Il ne remplace ni une décision judiciaire, ni une convention parentale, ni un
conseil juridique professionnel. Les calculs, plannings et rapports sont fournis
à titre informatif ; ils n'ont pas de valeur probante particulière.

**Compte et foyer.** Chaque utilisateur est responsable de la confidentialité de
ses identifiants et de l'exactitude des données saisies. Le propriétaire du foyer
gère les invitations et les rôles.

**Offres et paiement.** Offre gratuite ; offres payantes décrites sur la page
tarifaire, résiliables à tout moment avec effet à la fin de la période en cours.
**[Modalités précises à confirmer avec le juriste et selon la configuration Stripe.]**

**Comportement.** Les contenus déposés (messages, documents) restent la propriété
de leurs auteurs. Tout usage frauduleux, tentative d'accès aux données d'un autre
foyer ou dépôt de contenu illicite entraîne la suspension du compte.

**Responsabilité.** L'éditeur met en œuvre des mesures de sécurité conformes à
l'état de l'art (isolation stricte des foyers, stockage privé des justificatifs,
chiffrement en transit) mais ne peut garantir une disponibilité ininterrompue.

**Droit applicable.** Droit français. **[Clause de médiation de la consommation
à ajouter — obligatoire pour un service payant aux consommateurs.]**

## 4. Registre des consentements

L'application journalise (table `consent_logs`) : acceptation des CGU et de la
politique de confidentialité à l'inscription (avec version du texte), et chaque
consentement facultatif (e-mails d'information), avec horodatage.

## 5. Points à traiter par le juriste avant commercialisation

1. Valider l'ensemble des textes ci-dessus et compléter l'identité légale.
2. Confirmer les durées de conservation et la clause de médiation.
3. Vérifier la qualification des données médicales des enfants (données de santé,
   art. 9 RGPD) et la nécessité éventuelle d'une AIPD (analyse d'impact).
4. Vérifier les DPA (accords de sous-traitance) de Supabase, Vercel, Stripe et du
   prestataire e-mail, et la localisation UE effective des données.
5. Statuer sur la déclaration d'un DPO (probablement non obligatoire à ce stade,
   à confirmer).
