/**
 * Boucle d'amélioration Pinterest — apprentissages.
 *
 * Séparée de l'accès aux données pour être vérifiable sans base, sur le même
 * principe que mesures.ts et bilan.ts, dont elle réutilise la médiane : un
 * score s'y compare à la médiane des piliers et familles mesurables, pas à un
 * seuil absolu décidé d'avance.
 *
 * DEUX AXES DE CLASSEMENT
 *
 *  * Le pilier — la micro-niche du contenu (marketing_niches.id) : de quoi
 *    parle l'épingle.
 *  * La famille de modèle — sa catégorie (conseil, quotidien, démonstration,
 *    modèle, marque) : comment elle est construite.
 *
 * Un contenu qui plaît peut le devoir à son sujet, à sa forme, ou aux deux ;
 * les distinguer évite de retenir la mauvaise explication.
 *
 * POURQUOI CE POIDS SUR outbound_click
 * Une impression coûte une occasion, une sauvegarde exprime un intérêt
 * différé, un clic sur l'épingle reste dans Pinterest — seul le clic sortant
 * amène quelqu'un jusqu'au site. La pondération (1 / 1,5 / 4) le reflète sans
 * ignorer les deux autres signaux, disponibles bien plus tôt qu'un clic
 * sortant sur une épingle qui vient d'être créée.
 *
 * POURQUOI UN PLANCHER À HUIT ÉPINGLES MESURÉES
 * Sous ce seuil, classer des piliers reviendrait à désigner un gagnant par
 * tirage au sort — exactement la réserve que bilan.ts pose à trois contenus
 * pour la boucle Meta, ici plus haute parce qu'une épingle met plusieurs jours
 * à produire un signal stable.
 *
 * POURQUOI 20 % D'EXPLORATION, TOUJOURS
 * Optimiser sans jamais rien essayer de nouveau fait converger la production
 * vers un optimum local et l'y enferme : les quinze piliers cesseraient d'être
 * comparés entre eux. La consigne figure donc dans le bloc quel que soit le
 * volume de données, pas seulement en dessous du plancher.
 */

import { mediane } from './bilan';

export const MINIMUM_PINS = 8;
export const PART_EXPLORATION = 0.2;

export const POIDS_SAVE = 1;
export const POIDS_PIN_CLICK = 1.5;
export const POIDS_OUTBOUND_CLICK = 4;

export interface MesurePin {
  pinId: string;
  pilier: string;
  famille: string;
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
}

/**
 * Score pondéré, normalisé pour 1000 impressions.
 *
 * Sans impression, un score serait une division par zéro déguisée en zéro :
 * une épingle non encore vue n'a pas « mal marché », elle n'a pas de score.
 */
export function scorePin(m: MesurePin): number | null {
  if (m.impressions <= 0) return null;
  const pondere = m.saves * POIDS_SAVE
    + m.pinClicks * POIDS_PIN_CLICK
    + m.outboundClicks * POIDS_OUTBOUND_CLICK;
  return Math.round((pondere / m.impressions) * 1000 * 100) / 100;
}

export interface ClassementGroupe {
  cle: string;
  nbPins: number;
  scoreMedian: number;
}

/** Regroupe les épingles mesurables (score défini) selon un axe, triées du meilleur au moins bon. */
export function classer(mesures: MesurePin[], axe: 'pilier' | 'famille'): ClassementGroupe[] {
  const scores = new Map<string, number[]>();
  for (const m of mesures) {
    const score = scorePin(m);
    if (score === null) continue;
    const cle = m[axe];
    const liste = scores.get(cle) ?? [];
    liste.push(score);
    scores.set(cle, liste);
  }

  return [...scores.entries()]
    .map(([cle, valeurs]) => ({ cle, nbPins: valeurs.length, scoreMedian: mediane(valeurs) }))
    .sort((a, b) => b.scoreMedian - a.scoreMedian);
}

export interface DonneesLearnings {
  /** Une mesure par épingle : au relevé le plus récent, jamais un historique complet. */
  mesures: MesurePin[];
}

export interface ResultatLearnings {
  nbPins: number;
  bloc: string;
}

/**
 * Produit le bloc de consignes.
 *
 * Un texte, pas une structure : ce dispositif n'a pas de prompt à nourrir
 * (la génération dans generateur.ts est déterministe, sans appel à un modèle
 * de langage) ; le bloc est donc écrit pour la personne qui valide les
 * contenus avant publication, affiché à côté du tableau de bord — exactement
 * comme marketing_bilans pour la boucle Meta.
 */
export function produireLearnings(d: DonneesLearnings): ResultatLearnings {
  const mesurables = d.mesures.filter((m) => scorePin(m) !== null);
  const nbPins = mesurables.length;

  const lignes: string[] = [];
  lignes.push(`Apprentissages Pinterest — ${nbPins} épingle${nbPins > 1 ? 's' : ''} mesurée${nbPins > 1 ? 's' : ''}.`);
  lignes.push('');

  if (nbPins < MINIMUM_PINS) {
    lignes.push(
      `Moins de ${MINIMUM_PINS} épingles mesurées : rien n'est classé, un écart entre deux `
      + 'piliers relèverait autant du hasard que de leur intérêt réel. Continuer à varier les '
      + 'sujets et les familles de modèle plutôt que d\'optimiser sur un signal encore trop '
      + 'faible.');
  } else {
    const piliers = classer(mesurables, 'pilier');
    const familles = classer(mesurables, 'famille');

    lignes.push('Piliers en tête (score médian pour 1000 impressions) :');
    for (const p of piliers.slice(0, 3)) {
      lignes.push(`  • ${p.cle} — ${p.scoreMedian} (${p.nbPins} épingle${p.nbPins > 1 ? 's' : ''}).`);
    }
    const piliersFaibles = piliers.slice(-3).filter((p) => !piliers.slice(0, 3).includes(p));
    if (piliersFaibles.length > 0) {
      lignes.push('En retrait :');
      for (const p of piliersFaibles) {
        lignes.push(`  • ${p.cle} — ${p.scoreMedian} (${p.nbPins} épingle${p.nbPins > 1 ? 's' : ''}).`);
      }
    }
    lignes.push('');

    lignes.push('Familles de modèle en tête :');
    for (const f of familles.slice(0, 3)) {
      lignes.push(`  • ${f.cle} — ${f.scoreMedian} (${f.nbPins} épingle${f.nbPins > 1 ? 's' : ''}).`);
    }
  }

  lignes.push('');
  lignes.push(
    `Quel que soit ce classement : au moins ${Math.round(PART_EXPLORATION * 100)} % des `
    + 'prochains contenus doivent rester exploratoires — un pilier ou une famille peu mesurés, '
    + 'délibérément — pour continuer à comparer l\'ensemble plutôt que de converger sur ce qui a '
    + 'fonctionné une fois.');

  return { nbPins, bloc: lignes.join('\n') };
}
