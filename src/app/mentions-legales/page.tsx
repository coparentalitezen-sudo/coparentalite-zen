import { LegalPage, SectionJuridique } from '@/components/legal-page';
import { legal } from '@/lib/legal';

/**
 * Mentions légales.
 *
 * Même bascule que les conditions générales : LEGAL_PHASE vaut « beta » par
 * défaut, « public » une fois le service commercialisé. Le passage en vente
 * fait disparaître la mention de phase de test et suppose que le SIREN soit
 * alors une vraie valeur — l'affichage ne le vérifie pas, identiteComplete()
 * s'en charge dans le point de diagnostic.
 */
const enBeta = (process.env.LEGAL_PHASE ?? 'beta').toLowerCase() !== 'public';

export default function MentionsLegales() {
  return <LegalPage title="Mentions légales">
    <SectionJuridique title="Éditeur">
      <p>{legal.nom}, {legal.forme}, SIREN {legal.siren}, siège : {legal.adresse}.</p>
      <p>TVA non applicable, article 293 B du Code général des impôts.</p>
    </SectionJuridique>

    <SectionJuridique title="Directeur de la publication">
      <p>{legal.responsable}</p>
    </SectionJuridique>

    <SectionJuridique title="Contact">
      <p><a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a></p>
    </SectionJuridique>

    <SectionJuridique title="Hébergement">
      <p>Application : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis. Base de données et stockage : Supabase, Inc. Paiements : Stripe Payments Europe, lorsque l’offre payante est utilisée.</p>
      <p>Les transferts de données hors de l’Union européenne éventuellement opérés par ces prestataires sont encadrés par les clauses contractuelles types de la Commission européenne. Le détail figure dans la politique de confidentialité.</p>
    </SectionJuridique>

    {enBeta && (
      <SectionJuridique title="Phase bêta">
        <p>Le service est actuellement diffusé en version bêta, à des fins de test et d’amélioration. Certaines fonctionnalités peuvent être incomplètes, indisponibles ou modifiées sans préavis. Les conditions de cette phase sont détaillées dans les conditions générales d’utilisation.</p>
      </SectionJuridique>
    )}

    <SectionJuridique title="Propriété intellectuelle">
      <p>La marque, les textes, l’interface, le code source et les éléments graphiques de Coparentalité Zen sont protégés. Toute reproduction non autorisée est interdite. Les données saisies par les utilisateurs demeurent leur propriété ; l’éditeur les traite aux seules fins de fourniture du service.</p>
    </SectionJuridique>

    <SectionJuridique title="Données personnelles">
      <p>Le traitement des données personnelles est décrit dans la politique de confidentialité, conformément au règlement (UE) 2016/679 et à la loi n° 78-17 du 6 janvier 1978 modifiée. Toute demande peut être adressée à <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>. En cas de réponse insatisfaisante, une réclamation peut être introduite auprès de la CNIL (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07).</p>
    </SectionJuridique>

    <SectionJuridique title="Cookies et traceurs">
      <p>Le service n’utilise ni cookie publicitaire, ni traceur de mesure d’audience tierce. Seuls sont déposés les éléments strictement nécessaires à son fonctionnement, notamment ceux qui maintiennent la session de connexion. Ces éléments ne requièrent pas de consentement préalable.</p>
    </SectionJuridique>

    <SectionJuridique title="Signalement d’un contenu illicite">
      <p>Tout contenu manifestement illicite peut être signalé à <a className="underline" href={`mailto:${legal.email}`}>{legal.email}</a>, avec une description précise du contenu concerné et de sa localisation.</p>
    </SectionJuridique>
  </LegalPage>;
}
