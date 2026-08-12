import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal, LEGAL_VERSION } from '@/lib/legal';

/**
 * Conditions générales.
 *
 * Le texte dépend de la phase d'exploitation. En bêta, le service est gratuit
 * et sa disponibilité n'est pas garantie : le dire est une protection, pas une
 * précaution de style. En phase commerciale, ce sont les clauses de vente qui
 * s'appliquent — prix, rétractation, résiliation.
 *
 * La bascule se fait par la variable LEGAL_PHASE côté hébergeur : « beta »
 * (valeur par défaut) ou « public ». Aucune modification de code n'est requise
 * le jour de la mise en vente.
 */
const enBeta = (process.env.LEGAL_PHASE ?? 'beta').toLowerCase() !== 'public';

export default function Cgu() {
  return <LegalPage title="Conditions générales d’utilisation et de vente">
    <p>
      <strong>Version :</strong> {LEGAL_VERSION}
      {enBeta && <> — <strong>phase bêta</strong></>}
    </p>

    <SectionJuridique title="Objet">
      <p>Coparentalité Zen est un service d’organisation destiné aux parents séparés : planning de garde, rendez-vous, dépenses, remboursements, documents et notifications. Le service est édité par {legal.nom}, {legal.forme}, dont les coordonnées figurent dans les mentions légales.</p>
    </SectionJuridique>

    <SectionJuridique title="Acceptation">
      <p>La création d’un compte vaut acceptation des présentes conditions. L’utilisateur qui ne les accepte pas renonce à utiliser le service.</p>
    </SectionJuridique>

    {enBeta && (
      <SectionJuridique title="Phase bêta">
        <p>Le service est diffusé en version bêta, à des fins de test et d’amélioration. L’utilisateur en accepte expressément les conséquences suivantes :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Gratuité</strong> : l’accès est gratuit pendant toute la durée de la phase bêta. Aucun paiement n’est demandé.</li>
          <li><strong>Disponibilité non garantie</strong> : le service peut être interrompu à tout moment et sans préavis, pour maintenance, correction ou évolution.</li>
          <li><strong>Fonctionnalités évolutives</strong> : des fonctionnalités peuvent être ajoutées, modifiées ou retirées sans préavis.</li>
          <li><strong>Risque de perte de données</strong> : malgré les mesures mises en œuvre, une perte de données ne peut être exclue. Il est recommandé de conserver une copie de tout élément important, au moyen de la fonction d’export disponible à tout moment.</li>
        </ul>
        <p>L’éditeur informera les utilisateurs, avec un préavis raisonnable, de la fin de la phase bêta et des conditions applicables ensuite. Aucun basculement vers une offre payante ne sera opéré sans accord exprès de l’utilisateur.</p>
      </SectionJuridique>
    )}

    <SectionJuridique title="Accès et compte">
      <p>Le service est réservé aux personnes physiques majeures et juridiquement capables. Chaque utilisateur protège ses identifiants, maintient ses informations à jour et s’interdit tout accès aux données d’un autre foyer. Il informe l’éditeur sans délai de toute utilisation non autorisée de son compte.</p>
      <p>Un utilisateur ne peut appartenir qu’à un seul foyer actif. Les membres d’un même foyer accèdent aux données partagées de ce foyer : planning, dépenses, remboursements et justificatifs. L’utilisateur en tient compte avant toute saisie.</p>
    </SectionJuridique>

    <SectionJuridique title="Limite du service">
      <p>L’application est un outil d’organisation. Elle ne constitue ni un conseil juridique, ni un conseil comptable ou fiscal, ni un service de médiation familiale. Elle ne remplace ni une décision judiciaire, ni une convention parentale.</p>
      <p>Les données saisies et les documents déposés sont déclaratifs. Ils ne constituent pas un moyen de preuve à valeur légale automatique : leur recevabilité et leur valeur probante relèvent de l’appréciation des juridictions. Les calculs proposés ne font qu’appliquer les paramètres renseignés par les utilisateurs eux-mêmes.</p>
      <p>L’éditeur ne prend aucune part aux différends entre parents et n’arbitre aucun désaccord relatif au contenu saisi.</p>
    </SectionJuridique>

    <SectionJuridique title="Obligations de l’utilisateur">
      <p>L’utilisateur s’engage à fournir des informations exactes, à n’utiliser le service qu’à des fins personnelles et licites, et à respecter l’autre parent dans les contenus qu’il saisit : aucun propos injurieux, diffamatoire, menaçant ou harcelant n’est toléré.</p>
      <p>Il ne dépose que des documents dont il détient les droits ou l’autorisation. Il s’interdit de détourner le service de sa finalité, notamment pour exercer une pression, une surveillance abusive ou un contrôle sur l’autre parent.</p>
    </SectionJuridique>

    <SectionJuridique title="Contenus de l’utilisateur">
      <p>L’utilisateur demeure propriétaire des contenus qu’il dépose. Il concède à l’éditeur une licence limitée à l’hébergement, au stockage et à l’affichage de ces contenus aux membres autorisés de son foyer, pour la seule durée nécessaire à la fourniture du service. L’éditeur n’exerce aucune surveillance générale des contenus, mais peut retirer tout contenu manifestement illicite qui lui serait signalé.</p>
    </SectionJuridique>

    {!enBeta && (
      <SectionJuridique title="Offres payantes">
        <p>Les prix applicables sont ceux affichés avant validation du paiement. Les abonnements sont encaissés par Stripe et renouvelés selon la périodicité choisie. Ils peuvent être résiliés depuis le portail de facturation, avec effet à la fin de la période en cours.</p>
      </SectionJuridique>
    )}

    {!enBeta && (
      <SectionJuridique title="Droit de rétractation et remboursement">
        <p>Les règles légales de rétractation applicables aux services numériques s’appliquent. Toute demande est adressée à <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>. Les remboursements éventuels sont traités selon la situation et les obligations légales.</p>
      </SectionJuridique>
    )}

    <SectionJuridique title="Données personnelles">
      <p>Le traitement des données personnelles est décrit dans la politique de confidentialité, qui fait partie intégrante des présentes conditions. L’utilisateur dispose d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité, exerçable depuis l’application ou à l’adresse <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
      <p>L’utilisateur ne renseigne que les données strictement nécessaires à l’organisation de la garde. Il lui est déconseillé d’y faire figurer des informations sensibles concernant les enfants, notamment relatives à la santé, sauf nécessité avérée.</p>
    </SectionJuridique>

    <SectionJuridique title="Disponibilité et responsabilité">
      <p>L’éditeur est tenu à une obligation de moyens et met en œuvre des mesures raisonnables de disponibilité, de sauvegarde et de sécurité, sans garantir une absence totale d’interruption.</p>
      <p>Sa responsabilité ne saurait être engagée au titre des contenus saisis par les utilisateurs, de leur exactitude ou de leur usage, ni des conséquences d’une décision prise sur la base des informations affichées, ni d’un dommage indirect tel qu’un préjudice moral, une perte de chance ou la conséquence d’un litige familial. Ces limitations ne s’appliquent ni en cas de faute lourde ou dolosive, ni dans les cas où la loi les interdit.</p>
      <p>L’utilisateur répond des conséquences de ses manquements aux présentes conditions et garantit l’éditeur contre toute réclamation d’un tiers, notamment de l’autre parent, résultant des contenus qu’il a déposés.</p>
    </SectionJuridique>

    <SectionJuridique title="Suspension et résiliation">
      <p>L’utilisateur peut supprimer son compte à tout moment depuis l’application ; il lui est recommandé d’exporter ses données au préalable. L’éditeur peut suspendre ou supprimer un compte, après notification lorsque les circonstances le permettent, en cas de manquement grave aux présentes conditions.</p>
    </SectionJuridique>

    <SectionJuridique title="Modification des conditions">
      <p>L’éditeur peut modifier les présentes conditions. Les utilisateurs en sont informés par voie électronique ou lors de leur connexion. La poursuite de l’utilisation après information vaut acceptation de la version modifiée.</p>
    </SectionJuridique>

    <SectionJuridique title="Médiation">
      <p>{legal.mediation}</p>
      <p>L’utilisateur consommateur peut également saisir la plateforme européenne de règlement en ligne des litiges : <a className="underline" href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
    </SectionJuridique>

    <SectionJuridique title="Droit applicable">
      <p>Droit français. Tout litige fait d’abord l’objet d’une tentative de résolution amiable auprès de <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
    </SectionJuridique>
  </LegalPage>;
}
