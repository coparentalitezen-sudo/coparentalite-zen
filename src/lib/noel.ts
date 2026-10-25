/**
 * Vacances de Noël : dates officielles et découpage en deux moitiés.
 *
 * Sert la page publique /vacances-noel-garde-alternee. Les dates viennent de
 * la même source officielle que l'import du calendrier scolaire — aucune
 * n'est écrite dans le code. Si la source ne répond pas, la page s'affiche
 * sans dates plutôt qu'avec des dates supposées.
 *
 * La source exprime les bornes en UTC : « 2026-12-18T23:00:00+00:00 » est le
 * samedi 19 décembre à minuit, heure de Paris, premier jour sans classe ; la
 * fin est l'instant de la reprise. Tout se ramène donc à l'heure de Paris
 * avant de compter les jours.
 */

import { addDays, daysBetween } from './custody';

const SOURCE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets'
  + '/fr-en-calendrier-scolaire/records';

export interface DecoupageNoel {
  anneeScolaire: string;
  /** Dernier jour de classe, vacances dès la sortie. */
  finDesCours: string;
  premierJour: string;
  dernierJour: string;
  /** Jour de la reprise des cours. */
  reprise: string;
  nombreDeJours: number;
  premiereMoitie: { debut: string; fin: string };
  secondeMoitie: { debut: string; fin: string };
  /** Le 25 décembre tombe-t-il dans la première moitié ? */
  noelDansLaPremiereMoitie: boolean;
}

/** Jour calendaire à Paris d'un horodatage officiel, au format AAAA-MM-JJ. */
export function jourAParis(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Le format suédois donne directement AAAA-MM-JJ.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d);
}

/**
 * Coupe les vacances en deux moitiés égales au jour près ; un nombre impair
 * de jours donne le jour restant à la seconde moitié. C'est une illustration
 * du découpage le plus courant, pas une règle : un jugement ou un accord peut
 * fixer une autre heure ou un autre jour de passage.
 */
export function decouperNoel(
  anneeScolaire: string,
  debutIso: string,
  finIso: string,
): DecoupageNoel | null {
  const premierJour = jourAParis(debutIso);
  const reprise = jourAParis(finIso);
  if (!premierJour || !reprise || reprise <= premierJour) return null;

  const nombreDeJours = daysBetween(premierJour, reprise);
  const moitie = Math.floor(nombreDeJours / 2);
  const finPremiere = addDays(premierJour, moitie - 1);
  const noel = `${premierJour.slice(0, 4)}-12-25`;

  return {
    anneeScolaire,
    finDesCours: addDays(premierJour, -1),
    premierJour,
    dernierJour: addDays(reprise, -1),
    reprise,
    nombreDeJours,
    premiereMoitie: { debut: premierJour, fin: finPremiere },
    secondeMoitie: { debut: addDays(finPremiere, 1), fin: addDays(reprise, -1) },
    noelDansLaPremiereMoitie: noel <= finPremiere,
  };
}

/**
 * Année scolaire du prochain Noël. Le 25 décembre de l'année civile A
 * appartient toujours à l'année scolaire A-(A+1), qu'on soit en mars ou en
 * novembre : seuls les tout premiers jours de janvier, encore en vacances,
 * renvoient déjà au Noël suivant.
 */
export function anneeScolaireDuProchainNoel(aujourdhui: string): string {
  const annee = Number(aujourdhui.slice(0, 4));
  return `${annee}-${annee + 1}`;
}

/**
 * Lit les vacances de Noël officielles d'une année scolaire.
 * Les trois zones métropolitaines partagent les mêmes dates de Noël ; la
 * fonction le vérifie et renvoie null si ce n'était plus le cas, pour ne
 * jamais afficher une date valable pour une zone seulement.
 */
export async function lireNoelOfficiel(anneeScolaire: string): Promise<DecoupageNoel | null> {
  const params = new URLSearchParams({
    select: 'start_date,end_date,zones,population',
    where: `annee_scolaire="${anneeScolaire}" and description="Vacances de Noël"`,
    limit: '100',
  });
  try {
    const reponse = await fetch(`${SOURCE}?${params}`, {
      headers: { Accept: 'application/json' },
      // Les dates ne changent qu'à la publication d'un nouveau calendrier.
      next: { revalidate: 86400 },
    });
    if (!reponse.ok) return null;
    const { results } = await reponse.json() as {
      results?: { start_date?: string; end_date?: string; zones?: string; population?: string }[];
    };
    const metropole = (results ?? []).filter((r) =>
      /Zone\s+[ABC]/i.test(r.zones ?? '') && !/enseignant/i.test(r.population ?? ''));
    const bornes = new Set(metropole.map((r) => `${r.start_date}|${r.end_date}`));
    if (bornes.size !== 1) return null;
    const [debut, fin] = [...bornes][0].split('|');
    return decouperNoel(anneeScolaire, debut, fin);
  } catch {
    return null;
  }
}

/** « samedi 19 décembre 2026 » */
export function dateLongue(jour: string, avecAnnee = true): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(avecAnnee ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${jour}T12:00:00Z`));
}
