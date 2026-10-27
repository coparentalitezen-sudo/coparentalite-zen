import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal, LEGAL_VERSION } from '@/lib/legal';

export const metadata = {
  title: 'Politique de confidentialité | Coparentalité Zen',
  description: 'Politique de confidentialité de Coparentalité Zen, incluant les usages liés à YouTube, Etsy et Pinterest.',
};

export default function ConfidentialiteCoparentaliteZen() {
  return (
    <LegalPage title="Politique de confidentialité — Coparentalité Zen">
      <p><strong>Version :</strong> {LEGAL_VERSION}</p>

      <SectionJuridique title="Responsable du traitement">
        <p>
          {legal.nom}, {legal.forme}, SIREN {legal.siren}, {legal.adresse}. Contact :{' '}
          <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Données traitées">
        <p>
          Coparentalité Zen traite uniquement les informations nécessaires au fonctionnement du service :
          adresse e-mail, prénom, informations du foyer, données d’organisation familiale, planning,
          rendez-vous, dépenses, remboursements, justificatifs, notifications et journaux de sécurité.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Finalités et bases légales">
        <p>
          Les données sont utilisées pour fournir le service, gérer le compte, assurer la sécurité,
          prévenir les abus, traiter la facturation, répondre aux obligations légales et, lorsque cela
          est applicable, permettre des communications ou fonctionnalités facultatives avec le
          consentement de l’utilisateur.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Etsy et Pinterest">
        <p>
          Coparentalité Zen peut utiliser Etsy pour commercialiser ses produits numériques et Pinterest
          pour promouvoir ces produits au moyen de contenus organiques, notamment des Épingles et des
          tableaux. L’automatisation peut transmettre à Pinterest uniquement les éléments nécessaires à
          la publication, tels que le titre du produit, sa description, son image et le lien public vers
          la fiche Etsy. Coparentalité Zen ne vend, ne loue ni ne cède les données personnelles à des tiers.
        </p>
      </SectionJuridique>

      <SectionJuridique title="YouTube (services d’API YouTube)">
        <p>
          Coparentalité Zen publie de courtes vidéos d’information sur sa propre chaîne YouTube au moyen
          des services d’API YouTube. Cet usage concerne uniquement la chaîne de l’éditeur : l’application
          ne demande pas l’accès au compte YouTube ou Google de ses utilisateurs et ne collecte aucune
          donnée sur les spectateurs des vidéos.
        </p>
        <p>
          Les données obtenues de YouTube se limitent à l’identifiant et au nom de la chaîne, aux jetons
          d’autorisation (conservés chiffrés côté serveur) et aux informations publiques des vidéos
          publiées, dont leur nombre de vues. Elles servent seulement à publier les vidéos et à vérifier
          leur bonne mise en ligne. Lorsque la chaîne est déconnectée, l’autorisation est révoquée auprès
          de Google et les jetons sont effacés.
        </p>
        <p>
          En utilisant ces fonctionnalités, vous acceptez les{' '}
          <a className="underline" href="https://www.youtube.com/t/terms">conditions d’utilisation de YouTube</a>.
          Les données sont traitées conformément aux{' '}
          <a className="underline" href="https://policies.google.com/privacy">règles de confidentialité de Google</a>.
          L’accès accordé peut être retiré à tout moment depuis la page{' '}
          <a className="underline" href="https://security.google.com/settings/security/permissions">autorisations de sécurité de Google</a>.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Sous-traitants et services tiers">
        <p>
          Supabase peut être utilisé pour la base de données et le stockage, Vercel pour l’hébergement
          applicatif et la mesure d’audience, Stripe pour les paiements, Resend pour l’envoi des e-mails,
          ainsi que YouTube, Etsy et Pinterest pour les usages décrits ci-dessus. Les données bancaires ne sont
          jamais stockées par Coparentalité Zen.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Mesure d’audience">
        <p>
          Coparentalité Zen utilise Vercel Web Analytics pour mesurer la fréquentation du service. Cette
          mesure ne dépose aucun cookie, ne suit pas les visiteurs d’un site à l’autre et ne permet pas
          de vous identifier : les visites sont comptabilisées de façon agrégée à partir d’un identifiant
          technique non réversible, renouvelé chaque jour. Sont également comptabilisés, sous la même
          forme anonyme, les événements liés à l’installation de l’application sur l’écran d’accueil,
          afin d’améliorer le parcours d’installation.
        </p>
        <p>
          Ce traitement repose sur l’intérêt légitime de l’éditeur à mesurer l’audience de son service.
          Conformément aux recommandations de la CNIL relatives aux solutions de mesure d’audience
          exemptées de consentement, aucune information n’est lue ni écrite sur votre appareil à des fins
          publicitaires.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Durées de conservation">
        <p>
          Les données du compte sont conservées pendant l’utilisation du service puis supprimées ou
          anonymisées selon la demande, sous réserve des durées légales applicables aux données de
          facturation et aux journaux de sécurité.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Vos droits">
        <p>
          Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité
          de vos données depuis les paramètres ou par e-mail. Vous pouvez également saisir la CNIL.
        </p>
      </SectionJuridique>

      <SectionJuridique title="Données concernant les enfants">
        <p>
          Les comptes sont réservés aux adultes. Les parents saisissent les informations relatives aux
          enfants sous leur responsabilité et uniquement pour les besoins d’organisation familiale.
        </p>
      </SectionJuridique>
    </LegalPage>
  );
}
