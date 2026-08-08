import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal, LEGAL_VERSION } from '@/lib/legal';

export const metadata = {
  title: 'Politique de confidentialité | Coparentalité Zen',
  description: 'Politique de confidentialité de Coparentalité Zen, incluant les usages liés à Etsy et Pinterest.',
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

      <SectionJuridique title="Sous-traitants et services tiers">
        <p>
          Supabase peut être utilisé pour la base de données et le stockage, Vercel pour l’hébergement
          applicatif, Stripe pour les paiements, ainsi qu’Etsy et Pinterest pour les usages décrits
          ci-dessus. Les données bancaires ne sont jamais stockées par Coparentalité Zen.
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
