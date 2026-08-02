import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal, LEGAL_VERSION } from '@/lib/legal';

export default function Cgu() {
  return <LegalPage title="Conditions générales d’utilisation et de vente">
    <p><strong>Version :</strong> {LEGAL_VERSION}</p>
    <SectionJuridique title="Objet"><p>Coparentalité Zen est un service d’organisation destiné aux parents séparés : planning de garde, rendez-vous, dépenses, remboursements, documents et notifications.</p></SectionJuridique>
    <SectionJuridique title="Limite du service"><p>L’application ne remplace ni une décision judiciaire, ni une convention parentale, ni un conseil juridique. Les informations affichées sont des outils d’organisation.</p></SectionJuridique>
    <SectionJuridique title="Compte et sécurité"><p>Chaque utilisateur protège ses identifiants, maintient ses informations à jour et s’interdit tout accès aux données d’un autre foyer.</p></SectionJuridique>
    <SectionJuridique title="Offres payantes"><p>Les prix applicables sont ceux affichés avant validation du paiement. Les abonnements sont encaissés par Stripe et renouvelés selon la périodicité choisie. Ils peuvent être résiliés depuis le portail de facturation, avec effet à la fin de la période en cours.</p></SectionJuridique>
    <SectionJuridique title="Droit de rétractation et remboursement"><p>Les règles légales de rétractation applicables aux services numériques s’appliquent. Toute demande est adressée à <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>. Les remboursements éventuels sont traités selon la situation et les obligations légales.</p></SectionJuridique>
    <SectionJuridique title="Disponibilité et responsabilité"><p>L’éditeur met en œuvre des mesures raisonnables de disponibilité, de sauvegarde et de sécurité, sans garantir une absence totale d’interruption.</p></SectionJuridique>
    <SectionJuridique title="Médiation"><p>{legal.mediation}</p></SectionJuridique>
    <SectionJuridique title="Droit applicable"><p>Droit français. Tout litige fait d’abord l’objet d’une tentative de résolution amiable.</p></SectionJuridique>
  </LegalPage>;
}
