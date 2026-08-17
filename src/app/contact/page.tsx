import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal } from '@/lib/legal';

export default function Contact() {
  return <LegalPage title="Contact et assistance">
    <SectionJuridique title="Avant d’écrire"><p>La page <a className="underline font-bold" href="/aide">Aide</a> propose un diagnostic guidé et les réponses aux questions les plus fréquentes. Elle résout la plupart des difficultés sans attendre, et fournit un code d’incident à joindre si elle n’y parvient pas.</p></SectionJuridique>
    <SectionJuridique title="Assistance"><p>Pour une question, un problème de compte, une demande RGPD ou une difficulté de paiement, écrivez à <a className="underline font-bold" href={`mailto:${legal.email}`}>{legal.email}</a>.</p></SectionJuridique>
    <SectionJuridique title="Informations utiles"><p>Indiquez la page concernée, l’heure approximative du problème et la version affichée dans l’application. Ne joignez jamais de mot de passe ni de donnée bancaire.</p></SectionJuridique>
    <SectionJuridique title="Urgence familiale"><p>Coparentalité Zen n’est pas un service d’urgence. En cas de danger immédiat, contactez les services d’urgence compétents.</p></SectionJuridique>
  </LegalPage>;
}
