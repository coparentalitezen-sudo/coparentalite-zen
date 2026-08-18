/**
 * Boucle d'amélioration hebdomadaire.
 *
 * Déplace progressivement la production vers les sujets qui obtiennent des
 * inscriptions, et rédige un bilan lisible en une page.
 *
 * TROIS GARDE-FOUS, TOUS DÉLIBÉRÉS
 *
 *  1. Rien n'est conclu sous trois contenus mesurés. Une niche essayée une
 *     fois n'a pas « échoué » : elle n'a pas encore été mesurée. Confondre les
 *     deux revient à abandonner des sujets sur un tirage au sort.
 *
 *  2. Le poids ne bouge que de 25 % par semaine au plus. Une correction brutale
 *     sur un signal faible se paie deux mois plus tard, quand la production
 *     s'est concentrée sur un accident statistique.
 *
 *  3. Le poids reste borné entre 0,25 et 3. Un sujet affaibli continue d'être
 *     tiré de temps en temps — donc de produire de la mesure. Sans plancher,
 *     une niche mal partie ne serait plus jamais essayée, et son abandon
 *     deviendrait une prophétie autoréalisatrice.
 */

import type { Agregat } from './mesures';

export const MINIMUM_MESURABLE = 3;
export const VARIATION_MAX = 0.25;
export const POIDS_MIN = 0.25;
export const POIDS_MAX = 3;

export interface AjustementPoids {
  niche: string;
  ancien: number;
  nouveau: number;
  motif: string;
}

/** Médiane : moins sensible qu'une moyenne à une niche exceptionnelle. */
export function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const t = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(t.length / 2);
  return t.length % 2 === 0 ? (t[milieu - 1] + t[milieu]) / 2 : t[milieu];
}

/**
 * Ajuste les poids au vu des résultats.
 *
 * La comparaison se fait à la médiane des niches mesurables, et non à un seuil
 * absolu : ce qui compte est de faire mieux que le reste de la production, pas
 * d'atteindre un chiffre décidé d'avance qui vieillirait mal.
 */
export function ajusterPoids(
  agregats: Agregat[], poidsActuels: Record<string, number>,
): AjustementPoids[] {
  const mesurables = agregats.filter((a) => a.contenus >= MINIMUM_MESURABLE);
  if (mesurables.length < 2) {
    // Comparer une seule niche à elle-même n'apprend rien. On ne touche à
    // rien plutôt que de bouger au hasard.
    return [];
  }

  const reference = mediane(mesurables.map((a) => a.rendement));

  return mesurables.map((a) => {
    const ancien = poidsActuels[a.cle] ?? 1;
    let facteur = 1;
    let motif = 'Dans la moyenne de la production';

    if (reference === 0) {
      // Aucune niche n'obtient d'inscription : les clics départagent, faute
      // de mieux, et l'ajustement reste léger.
      const clicsMedians = mediane(mesurables.map((x) => x.clics));
      if (a.clics > clicsMedians) { facteur = 1.1; motif = 'Plus de clics que la médiane'; }
      else if (a.clics < clicsMedians) { facteur = 0.95; motif = 'Moins de clics que la médiane'; }
    } else if (a.rendement > reference) {
      facteur = 1 + VARIATION_MAX; motif = 'Rendement supérieur à la médiane';
    } else if (a.rendement < reference) {
      facteur = 1 - VARIATION_MAX; motif = 'Rendement inférieur à la médiane';
    }

    const nouveau = Math.min(POIDS_MAX, Math.max(POIDS_MIN,
      Math.round(ancien * facteur * 100) / 100));

    return { niche: a.cle, ancien, nouveau, motif };
  }).filter((a) => a.nouveau !== a.ancien);
}

export interface DonneesBilan {
  semaine: string;
  contenusPublies: number;
  clics: number;
  inscriptions: number;
  parNiche: Agregat[];
  ajustements: AjustementPoids[];
  sourcesIndisponibles: string[];
}

/**
 * Rédige le bilan.
 *
 * Une page au plus, en phrases suivies. Un tableau de chiffres sans
 * interprétation se survole et ne se lit pas ; le but est qu'une lecture d'une
 * minute suffise à savoir quoi faire.
 */
export function redigerBilan(d: DonneesBilan): string {
  const lignes: string[] = [];
  lignes.push(`Bilan de la semaine ${d.semaine}`);
  lignes.push('');

  if (d.contenusPublies === 0) {
    lignes.push(
      'Aucun contenu publié cette semaine. Rien à analyser : les chiffres qui suivent '
      + 'seraient ceux des semaines précédentes, et les présenter comme un bilan '
      + 'hebdomadaire serait trompeur.');
    return lignes.join('\n');
  }

  lignes.push(
    `${d.contenusPublies} contenu${d.contenusPublies > 1 ? 's' : ''} publié${d.contenusPublies > 1 ? 's' : ''}, `
    + `${d.clics} clic${d.clics > 1 ? 's' : ''} vers l'application, `
    + `${d.inscriptions} inscription${d.inscriptions > 1 ? 's' : ''} attribuée${d.inscriptions > 1 ? 's' : ''}.`);
  lignes.push('');

  const mesurables = d.parNiche.filter((n) => n.contenus >= MINIMUM_MESURABLE);
  if (mesurables.length === 0) {
    lignes.push(
      'Aucune micro-niche n\'atteint encore trois contenus mesurés. Rien n\'est donc '
      + 'conclu : à ce stade, un écart entre deux sujets relève du hasard autant que '
      + 'de leur intérêt réel. La production continue sur l\'ensemble des sujets.');
  } else {
    const tete = mesurables.slice(0, 3);
    lignes.push('Sujets en tête :');
    for (const n of tete) {
      lignes.push(
        `  • ${n.cle} — ${n.inscriptions} inscription${n.inscriptions > 1 ? 's' : ''} `
        + `pour ${n.contenus} contenus (${n.clics} clic${n.clics > 1 ? 's' : ''}).`);
    }
    lignes.push('');

    const faibles = mesurables.filter((n) => n.inscriptions === 0 && n.clics === 0);
    if (faibles.length > 0) {
      lignes.push(
        `Sans effet mesurable : ${faibles.map((f) => f.cle).join(', ')}. `
        + 'Ces sujets restent produits, mais moins souvent — les retirer entièrement '
        + 'reviendrait à ne plus jamais savoir s\'ils fonctionnent.');
      lignes.push('');
    }
  }

  if (d.ajustements.length === 0) {
    lignes.push('Aucun ajustement cette semaine : les données ne le justifiaient pas.');
  } else {
    lignes.push('Ajustements appliqués :');
    for (const a of d.ajustements) {
      lignes.push(`  • ${a.niche} : ${a.ancien} → ${a.nouveau} (${a.motif.toLowerCase()}).`);
    }
    lignes.push('');
    lignes.push(
      'Chaque poids varie de 25 % au plus par semaine et reste compris entre 0,25 et 3. '
      + 'Une correction brutale sur un signal faible se paierait deux mois plus tard.');
  }

  if (d.sourcesIndisponibles.length > 0) {
    lignes.push('');
    lignes.push(
      `Réserve : ${d.sourcesIndisponibles.length} source`
      + `${d.sourcesIndisponibles.length > 1 ? 's' : ''} de détection `
      + `indisponible${d.sourcesIndisponibles.length > 1 ? 's' : ''} cette semaine. `
      + 'Le classement des sujets en est d\'autant moins sûr.');
  }

  return lignes.join('\n');
}
