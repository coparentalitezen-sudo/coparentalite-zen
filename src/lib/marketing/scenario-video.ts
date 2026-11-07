/**
 * Scénario d'une vidéo animée (style « Mid-century Cartoon », dossier video-gabarit/).
 *
 * Fonction pure : un sujet de la banque et une accroche donnent toujours le
 * même scénario, à la virgule près. Le rendu (hors Vercel, dans GitHub
 * Actions) ne fait qu'exécuter ce scénario : aucune phrase n'est écrite
 * ailleurs qu'ici, dans la banque ou dans les étapes courtes.
 *
 * Structure : accroche → trois étapes numérotées → ce que l'application
 * apporte → logo officiel et adresse du site. Le plan « problème » des
 * carrousels n'y figure pas : l'accroche le pose déjà, et la vidéo tiendrait
 * sinon 39 à 47 s.
 *
 * Règles reprises de banque.ts et visuel.ts : aucun chiffre ni témoignage
 * ajouté, aucun parent désigné fautif (les deux parents sont dessinés et
 * animés de la même façon), aucun enfant photographié (l'enfant est un
 * dessin géométrique), couleurs de la marque.
 */

import { BANQUE, type Sujet } from '@/lib/marketing/banque';
import { ETAPES_COURTES } from '@/lib/marketing/etapes-courtes';
import { vignetteDe } from '@/lib/marketing/vignettes';
import type { Contenu } from '@/lib/marketing/generateur';

export const VERSION_SCENARIO = 1;

/** Pictogrammes dessinés par le gabarit (video-gabarit/icones.js). */
export type Pictogramme =
  | 'calendrier' | 'soleil' | 'sac' | 'euro' | 'recu' | 'cartable' | 'trousse'
  | 'dossier' | 'bulle' | 'cle' | 'maisons' | 'train' | 'horloge' | 'gateau'
  | 'stylo' | 'photo' | 'coche' | 'liste' | 'oeil' | 'epingle';

/** Le pictogramme de la question posée dans l'accroche, par micro-niche. */
const PICTO_NICHE: Record<string, Pictogramme> = {
  'garde-alternee': 'calendrier',
  'vacances-scolaires': 'soleil',
  'echange-enfants': 'sac',
  'depenses-partagees': 'euro',
  pension: 'recu',
  'ecole-activites': 'cartable',
  'rendez-vous-medicaux': 'trousse',
  'documents-familiaux': 'dossier',
  communication: 'bulle',
  'nouveaux-conjoints': 'cle',
  'familles-recomposees': 'maisons',
  'longue-distance': 'train',
  imprevus: 'horloge',
  anniversaires: 'gateau',
  'conflits-planning': 'stylo',
};

/**
 * Le geste d'une étape, d'après son verbe. Le premier motif reconnu gagne ;
 * à défaut, le pictogramme du sujet.
 */
const PICTO_VERBE: [RegExp, Pictogramme][] = [
  [/^photographiez/i, 'photo'],
  [/^(rangez|ajoutez)/i, 'dossier'],
  [/^(listez|résumez)/i, 'liste'],
  [/^notez les consignes/i, 'liste'],
  [/^(vérifiez|regardez|lisez|repérez)/i, 'oeil'],
  [/^(fixez|gardez la même heure|réservez)/i, 'epingle'],
  [/^(notez|écrivez|datez|indiquez|précisez|dites|tenez-vous)/i, 'stylo'],
  [/(attendez|quelques heures|à l’avance|trimestre)/i, 'horloge'],
  [/(demande par message|parlez)/i, 'bulle'],
];

export interface LigneScenario {
  id: 'accroche' | 'e1' | 'e2' | 'e3' | 'apport';
  role: 'accroche' | 'etape' | 'apport';
  numero?: 1 | 2 | 3;
  /** Texte affiché (sous-titre, carte). */
  texte: string;
  /** Texte prononcé : nombres écrits en lettres. */
  voix: string;
  pictogramme: Pictogramme;
}

export interface ScenarioVideo {
  version: number;
  reference: string;
  niche: string;
  graine: number;
  /** Une des trois grilles d'accords de la musique. */
  ambiance: 0 | 1 | 2;
  lignes: LigneScenario[];
  /** Texte court de la vignette (couverture) et du bandeau tenu pendant les étapes. */
  vignette: string;
  fin: { site: string; puce: string };
}

export const SITE_AFFICHE = 'coparentalitezen.fr';
export const PUCE_PAR_DEFAUT = 'Gratuit pour commencer';

/** Graine stable (FNV-1a 32 bits) : même référence, même vidéo. */
export function graineDe(reference: string): number {
  let h = 0x811c9dc5;
  for (const c of reference) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** Nombre entier (0 à 99) en lettres, orthographe de 1990 (traits d'union). */
export function enLettres(n: number): string {
  if (n < 17) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  if (n < 70) {
    const d = Math.floor(n / 10), u = n % 10;
    if (u === 0) return DIZAINES[d];
    return u === 1 ? `${DIZAINES[d]}-et-un` : `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante-et-onze' : `soixante-${enLettres(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${enLettres(n - 80)}`;
}

/** Texte prononcé : la synthèse vocale lit mieux « deux » que « 2 ». */
export function textePrononce(texte: string): string {
  return texte.replace(/\b\d{1,2}\b/g, (m) => enLettres(Number(m)));
}

function pictoEtape(etape: string, defaut: Pictogramme): Pictogramme {
  for (const [motif, picto] of PICTO_VERBE) if (motif.test(etape)) return picto;
  return defaut;
}

export function sujetDeNiche(niche: string): Sujet | undefined {
  return BANQUE.find((s) => s.niche === niche);
}

/** Scénario à partir d'un sujet et d'une accroche (Short du jour, Reel de la semaine). */
export function scenarioVideo(
  sujet: Sujet,
  accroche: string,
  reference: string,
  options: { puce?: string } = {},
): ScenarioVideo {
  const etapes = ETAPES_COURTES[sujet.niche];
  if (!etapes) throw new Error(`Pas d’étapes courtes pour la niche « ${sujet.niche} ».`);
  const picto = PICTO_NICHE[sujet.niche] ?? 'calendrier';
  const graine = graineDe(reference);
  const ligne = (l: Omit<LigneScenario, 'voix'>): LigneScenario => ({ ...l, voix: textePrononce(l.texte) });

  return {
    version: VERSION_SCENARIO,
    reference,
    niche: sujet.niche,
    graine,
    ambiance: (graine % 3) as 0 | 1 | 2,
    lignes: [
      ligne({ id: 'accroche', role: 'accroche', texte: accroche, pictogramme: picto }),
      ...etapes.map((texte, i) => ligne({
        id: `e${i + 1}` as 'e1' | 'e2' | 'e3', role: 'etape', numero: (i + 1) as 1 | 2 | 3,
        texte, pictogramme: pictoEtape(texte, picto),
      })),
      ligne({ id: 'apport', role: 'apport', texte: sujet.apport, pictogramme: picto }),
    ],
    vignette: vignetteDe(sujet.niche, sujet.accroches, accroche, graine),
    fin: { site: SITE_AFFICHE, puce: options.puce ?? PUCE_PAR_DEFAUT },
  };
}

/** Scénario d'un contenu « reel » du générateur de la semaine. */
export function scenarioDuContenu(contenu: Contenu, options: { puce?: string } = {}): ScenarioVideo {
  if (contenu.format !== 'reel') throw new Error(`« ${contenu.reference} » n’est pas un Reel.`);
  const sujet = sujetDeNiche(contenu.niche);
  if (!sujet) throw new Error(`Niche inconnue : « ${contenu.niche} ».`);
  return scenarioVideo(sujet, contenu.accroche, contenu.reference, options);
}

/** Lignes à donner à la synthèse vocale (format lines.json de Lemo-Opuscar). */
export function lignesVoix(s: ScenarioVideo, voix = 'fr-FR-DeniseNeural') {
  return s.lignes.map((l) => ({ id: l.id, text: l.voix, voice: voix, rate: '-2%' }));
}
