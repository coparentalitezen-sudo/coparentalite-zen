import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal } from '@/lib/legal';

export default function MentionsLegales() {
  return <LegalPage title="Mentions légales">
    <SectionJuridique title="Éditeur"><p>{legal.nom}, {legal.forme}, SIREN {legal.siren}, siège : {legal.adresse}.</p></SectionJuridique>
    <SectionJuridique title="Directeur de la publication"><p>{legal.responsable}</p></SectionJuridique>
    <SectionJuridique title="Contact"><p><a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a></p></SectionJuridique>
    <SectionJuridique title="Hébergement"><p>Application : Vercel Inc. Base de données et stockage : Supabase. Paiements : Stripe Payments Europe, lorsque l’offre payante est utilisée.</p></SectionJuridique>
    <SectionJuridique title="Propriété intellectuelle"><p>La marque, les textes, l’interface et les éléments graphiques de Coparentalité Zen sont protégés. Toute reproduction non autorisée est interdite.</p></SectionJuridique>
  </LegalPage>;
}
