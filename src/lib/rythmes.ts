/**
 * Catalogue des rythmes de garde.
 *
 * Chaque rythme porte son explication, sa durée de cycle et le schéma de sa
 * répartition. Un parent qui découvre l'application doit comprendre en une
 * phrase ce qu'il choisit — les libellés techniques (« 2-2-5-5 ») ne parlent
 * qu'à ceux qui les connaissent déjà.
 *
 * Fonctions pures, sans dépendance : testables et réutilisables partout.
 */
import { CYCLES, type CustodyPattern } from './custody';

export interface ModeleRythme {
  pattern: CustodyPattern;
  /** Nom courant, tel qu'employé par les familles et les médiateurs. */
  nom: string;
  /** Ce que cela change concrètement, en une phrase. */
  explication: string;
  /** À qui ce rythme convient le mieux. */
  convientA: string;
  /** Longueur du cycle en jours ; 0 si le rythme suit les semaines civiles. */
  cycleJours: number;
  /** Répartition sur deux semaines, pour le schéma visuel. */
  schema: ('P1' | 'P2')[];
  /** true si l'utilisateur définit lui-même la répartition. */
  personnalisable: boolean;
  ordre: number;
}

/** Jours de la semaine, du lundi au dimanche, pour l'affichage des schémas. */
export const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** Répartition d'un rythme sur quatorze jours, à partir d'un lundi. */
export function schemaDeuxSemaines(pattern: CustodyPattern): ('P1' | 'P2')[] {
  const cycle = CYCLES[pattern];
  if (cycle && cycle.length > 0) {
    return Array.from({ length: 14 }, (_, i) => cycle[i % cycle.length]);
  }
  switch (pattern) {
    case 'alternating_weeks':
    case 'even_weeks':
    case 'odd_weeks':
      // Une semaine entière chez l'un, la suivante chez l'autre
      return Array.from({ length: 14 }, (_, i) => (i < 7 ? 'P1' : 'P2'));
    case 'alternating_weekends':
      // Résidence principale chez P1 ; P2 un week-end sur deux (samedi, dimanche)
      return Array.from({ length: 14 }, (_, i) =>
        (i === 5 || i === 6) ? 'P2' : 'P1');
    default:
      return Array.from({ length: 14 }, () => 'P1');
  }
}

export const MODELES: ModeleRythme[] = [
  {
    pattern: 'alternating_weeks',
    nom: 'Une semaine sur deux',
    explication:
      'Les enfants passent une semaine complète chez un parent, puis la semaine suivante chez l’autre.',
    convientA: 'Le rythme le plus répandu. Peu de trajets, repères simples pour les enfants.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('alternating_weeks'),
    personnalisable: false,
    ordre: 10,
  },
  {
    pattern: 'even_weeks',
    nom: 'Semaines paires et impaires',
    explication:
      'Un parent a les enfants les semaines paires, l\u2019autre les semaines impaires — selon le numéro de semaine du calendrier.',
    convientA:
      'Ceux qui raisonnent en numéros de semaine : le planning se lit sur n\u2019importe quel agenda, sans avoir à compter.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('even_weeks'),
    personnalisable: false,
    ordre: 15,
  },
  {
    pattern: 'p2233',
    nom: '2-2-3',
    explication:
      'Deux jours chez un parent, deux chez l’autre, puis trois jours — et l’inverse la semaine suivante.',
    convientA: 'Les enfants jeunes, qui supportent mal de longues séparations.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('p2233'),
    personnalisable: false,
    ordre: 20,
  },
  {
    pattern: 'p3443',
    nom: '3-4-4-3',
    explication:
      'Trois jours chez un parent, quatre chez l’autre, puis l’inverse la semaine suivante.',
    convientA:
      'Des séjours plus courts qu’une semaine complète, avec des week-ends qui alternent régulièrement.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('p3443'),
    personnalisable: false,
    ordre: 30,
  },
  {
    pattern: 'p2255',
    nom: '2-2-5-5',
    explication:
      'Chaque parent a toujours les deux mêmes jours de semaine, puis un long week-end en alternance.',
    convientA:
      'Les emplois du temps réguliers : les jours de garde ne changent jamais d’une semaine à l’autre.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('p2255'),
    personnalisable: false,
    ordre: 40,
  },
  {
    pattern: 'alternating_weekends',
    nom: 'Week-end alterné',
    explication:
      'Les enfants vivent principalement chez un parent et rejoignent l’autre un week-end sur deux.',
    convientA:
      'Une distance importante entre les domiciles, ou une scolarité qu’on ne souhaite pas déplacer.',
    cycleJours: 14,
    schema: schemaDeuxSemaines('alternating_weekends'),
    personnalisable: false,
    ordre: 50,
  },
  {
    pattern: 'custom',
    nom: 'Personnalisé',
    explication:
      'Vous choisissez la longueur du cycle, d’une à quatre semaines, puis chaque jour librement.',
    convientA:
      'Les horaires atypiques — gardes, astreintes, roulements — que les modèles classiques ne couvrent pas.',
    cycleJours: 0,
    schema: schemaDeuxSemaines('custom'),
    personnalisable: true,
    ordre: 60,
  },
];

export function modele(pattern: CustodyPattern): ModeleRythme | undefined {
  return MODELES.find((m) => m.pattern === pattern);
}

/**
 * Résumé chiffré d'une répartition : combien de jours et de nuits chez chacun.
 * Utile pour vérifier qu'un cycle personnalisé correspond bien à l'intention.
 */
export function repartition(cycle: ('P1' | 'P2')[]): {
  joursP1: number; joursP2: number; pourcentP1: number; equilibre: boolean;
} {
  const joursP1 = cycle.filter((j) => j === 'P1').length;
  const joursP2 = cycle.length - joursP1;
  const pourcentP1 = cycle.length === 0 ? 0 : Math.round((joursP1 / cycle.length) * 100);
  return { joursP1, joursP2, pourcentP1, equilibre: joursP1 === joursP2 };
}

/**
 * Cycle personnalisé par défaut : une alternance hebdomadaire, point de départ
 * lisible que l'utilisateur ajuste ensuite jour par jour.
 */
export function cycleParDefaut(semaines: 1 | 2 | 3 | 4): ('P1' | 'P2')[] {
  // Sur une seule semaine, une alternance hebdomadaire n'aurait aucun sens :
  // un parent n'aurait jamais les enfants. On répartit alors la semaine.
  if (semaines === 1) {
    return ['P1', 'P1', 'P1', 'P1', 'P2', 'P2', 'P2'];
  }
  return Array.from({ length: semaines * 7 }, (_, i) =>
    (Math.floor(i / 7) % 2 === 0 ? 'P1' : 'P2'));
}

/** Un cycle personnalisé doit couvrir des semaines entières et nommer les deux parents. */
export function validerCyclePersonnalise(cycle: ('P1' | 'P2')[]): string | null {
  if (cycle.length === 0) return 'Définissez au moins une semaine.';
  if (cycle.length % 7 !== 0) return 'Le cycle doit couvrir des semaines entières.';
  if (cycle.length > 28) return 'Le cycle ne peut pas dépasser quatre semaines.';
  if (!cycle.includes('P1') || !cycle.includes('P2')) {
    return 'Chaque parent doit avoir au moins un jour de garde.';
  }
  return null;
}
