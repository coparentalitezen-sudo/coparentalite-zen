import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal, LEGAL_VERSION } from '@/lib/legal';

export default function Confidentialite() {
  return <LegalPage title="Politique de confidentialité">
    <p><strong>Version :</strong> {LEGAL_VERSION}</p>
    <SectionJuridique title="Responsable du traitement"><p>{legal.nom}, {legal.forme}, SIREN {legal.siren}, {legal.adresse}. Contact : <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>.</p></SectionJuridique>
    <SectionJuridique title="Données traitées"><p>Adresse e-mail, prénom, informations du foyer, enfants, planning, rendez-vous, dépenses, remboursements, justificatifs, notifications et journaux de sécurité strictement nécessaires au service.</p></SectionJuridique>
    <SectionJuridique title="Finalités et bases légales"><p>Fourniture du service et gestion du compte (contrat), sécurité et prévention des abus (intérêt légitime), facturation et conservation comptable (obligation légale), communications facultatives (consentement).</p></SectionJuridique>
    <SectionJuridique title="Sous-traitants"><p>Supabase pour la base de données et le stockage, Vercel pour l’hébergement applicatif et Stripe pour les paiements. Les données bancaires ne sont jamais stockées par Coparentalité Zen.</p></SectionJuridique>
    <SectionJuridique title="Durées de conservation"><p>Les données du compte sont conservées pendant l’utilisation du service puis supprimées ou anonymisées selon la demande, sous réserve des durées légales applicables aux données de facturation et aux journaux de sécurité.</p></SectionJuridique>
    <SectionJuridique title="Vos droits"><p>Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données depuis les paramètres ou par e-mail. Vous pouvez également saisir la CNIL.</p></SectionJuridique>
    <SectionJuridique title="Données concernant les enfants"><p>Les comptes sont réservés aux adultes. Les parents saisissent les données relatives aux enfants sous leur responsabilité et uniquement pour l’organisation familiale.</p></SectionJuridique>
  </LegalPage>;
}
