/**
 * Contenu d'un YouTube Short : sujet du jour, planches, titre, description.
 *
 * Fonctions pures, sans réseau ni base : le même jour produit toujours le
 * même Short, ce qui rend la tâche rejouable sans risque de publier deux
 * variantes, et permet de tout vérifier par des tests.
 *
 * Le fond vient de la banque éditoriale existante (banque.ts) : quinze
 * difficultés réelles, chacune avec plusieurs accroches, trois conseils
 * applicables sans l'application et ce que l'application apporte de plus.
 * Aucune affirmation juridique n'y figure, et ce module n'en ajoute pas.
 */

import { BANQUE, type Sujet } from '@/lib/marketing/banque';
import { pageDeLaNiche } from '@/lib/marketing/pages-thematiques';
import { construireLien } from '@/lib/marketing/utm';
import { dureeVideo } from '@/lib/marketing/video';
import type { Planche } from '@/lib/marketing/visuel';

/** Premier jour de la rotation. Le changer décalerait tous les sujets. */
const ORIGINE = Date.UTC(2026, 9, 1);
const JOUR_MS = 86_400_000;

export const SITE = 'www.coparentalitezen.fr';

export interface ShortDuJour {
  jour: string;
  sujet: Sujet;
  accroche: string;
  /** Rang dans la rotation, utile au journal. */
  rang: number;
}

/** Date du jour à Paris, au format AAAA-MM-JJ : le Short « du lundi » est celui du lundi français. */
export function jourAParis(maintenant = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(maintenant);
}

/**
 * Sujet et accroche d'un jour donné.
 *
 * Les sujets défilent un par jour ; l'accroche change à chaque tour complet.
 * Avec quinze sujets et trois accroches chacun, aucun Short ne reprend la
 * même accroche avant quarante-cinq jours, et deux jours consécutifs ne
 * traitent jamais le même sujet.
 */
export function shortDuJour(jour: string): ShortDuJour {
  const rang = Math.floor((Date.parse(`${jour}T00:00:00Z`) - ORIGINE) / JOUR_MS);
  const n = ((rang % BANQUE.length) + BANQUE.length) % BANQUE.length;
  const tour = Math.floor(rang / BANQUE.length);
  const sujet = BANQUE[n];
  const accroche = sujet.accroches[((tour % sujet.accroches.length) + sujet.accroches.length)
    % sujet.accroches.length];
  return { jour, sujet, accroche, rang };
}

/**
 * Les planches de la vidéo, dans l'ordre de lecture.
 *
 * Sept planches de trois secondes et demie, fondus compris : environ vingt-quatre
 * secondes. L'accroche occupe les premières secondes, puis viennent le
 * problème, les trois conseils, ce que l'application apporte, et l'appel.
 * La mention « 3 mois gratuits » n'apparaît que si l'offre est confirmée par
 * la grille tarifaire au moment de la fabrication.
 */
export function planchesDuShort(s: ShortDuJour, offreGratuite: boolean): Planche[] {
  const { sujet } = s;
  return [
    { texte: s.accroche, couverture: true },
    { surtitre: 'Le problème', texte: sujet.probleme },
    { surtitre: 'Ce qui aide · 1/3', texte: sujet.etapes[0] },
    { surtitre: 'Ce qui aide · 2/3', texte: sujet.etapes[1] },
    { surtitre: 'Ce qui aide · 3/3', texte: sujet.etapes[2] },
    { surtitre: 'Avec Coparentalité Zen', texte: sujet.apport },
    {
      surtitre: 'À découvrir',
      // Pas une couverture, et plus de 90 caractères à dessein : le texte passe au corps moyen, et
      // l'adresse, qui ne peut pas passer à la ligne, reste la plus grande.
      texte: offreGratuite
        ? 'Planning de garde, vacances scolaires et dépenses des enfants, au même endroit. 3 mois gratuits.'
        : 'Planning de garde, vacances scolaires et dépenses des enfants, partagés entre parents séparés.',
      appel: SITE,
    },
  ];
}

export function dureeDuShort(s: ShortDuJour): number {
  return dureeVideo(planchesDuShort(s, false).length);
}

/** YouTube refuse les chevrons dans les titres et descriptions. */
function nettoyer(texte: string): string {
  return texte.replace(/[<>]/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Titre : la recherche réelle des parents d'abord quand elle tient, puis
 * l'accroche. « Calendrier semaine sur deux : Vous recomptez les semaines sur
 * vos doigts ? » se trouve par la recherche ; l'accroche seule, non.
 * 100 caractères au plus, limite de YouTube.
 */
export function titreDuShort(s: ShortDuJour): string {
  const recherche = s.sujet.recherches[0];
  const complet = recherche ? `${majuscule(recherche)} : ${s.accroche}` : s.accroche;
  const base = complet.length <= 90 ? complet : s.accroche;
  const avecTag = `${base} #Shorts`;
  return nettoyer(avecTag.length <= 100 ? avecTag : base.slice(0, 100));
}

export function lienDuShort(s: ShortDuJour, base: string): string {
  const chemin = pageDeLaNiche(s.sujet.niche)?.chemin ?? '/';
  return construireLien(base, {
    source: 'youtube', campagne: 'shorts', contenu: `yt-${s.jour}`,
  }, chemin);
}

export function descriptionDuShort(s: ShortDuJour, base: string, offreGratuite: boolean): string {
  const { sujet } = s;
  const lignes = [
    sujet.probleme,
    '',
    'Ce qui aide :',
    ...sujet.etapes.map((e) => `• ${e}`),
    '',
    `Avec Coparentalité Zen : ${sujet.apport}`,
    '',
    'Planning de garde alternée, vacances scolaires et dépenses des enfants, partagés '
      + 'entre parents séparés — et utilisable même si l’autre parent ne s’inscrit pas.'
      + (offreGratuite ? ' 3 mois gratuits, sans carte bancaire.' : ''),
    `👉 ${lienDuShort(s, base)}`,
    '',
    'Conseils d’organisation, pas un avis juridique : si une décision de justice fixe '
      + 'votre organisation, c’est elle qui s’applique.',
    '',
    '#Shorts #coparentalité #gardealternée #parentsséparés',
  ];
  return nettoyer(lignes.join('\n')).slice(0, 4900);
}

/** Mots-clés : les recherches réelles du sujet, puis les termes génériques. 500 caractères au plus. */
export function motsClesDuShort(s: ShortDuJour): string[] {
  const tous = [...s.sujet.recherches, 'coparentalité', 'garde alternée', 'parents séparés',
    'Coparentalité Zen'];
  const retenus: string[] = [];
  let longueur = 0;
  for (const m of tous) {
    const propre = nettoyer(m);
    if (!propre || retenus.includes(propre)) continue;
    if (longueur + propre.length + 1 > 480) break;
    retenus.push(propre);
    longueur += propre.length + 1;
  }
  return retenus;
}
