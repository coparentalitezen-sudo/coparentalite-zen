import { Questionnaire } from './questionnaire';

/**
 * Questionnaire public d'orientation vers un rythme de garde.
 *
 * Page d'entrée destinée aux liens partagés depuis les réseaux : quatre
 * questions, un planning affiché, l'inscription seulement ensuite. Aucun
 * compte n'est demandé pour arriver au résultat — c'est ce qui distingue
 * cette page d'un formulaire d'inscription déguisé.
 *
 * L'origine de la visite est enregistrée par SuiviOrigine, monté dans la mise
 * en page racine : rien à ajouter ici pour mesurer ce que le lien rapporte.
 */
export const metadata = {
  title: 'Quel rythme de garde pour votre famille ? — Coparentalité Zen',
  description:
    'Cinq questions pour découvrir le rythme de garde adapté à votre '
    + 'situation, avec le planning affiché sur deux semaines. Sans inscription.',
};

export default function Quiz() {
  return <Questionnaire />;
}
