/**
 * Planning des vacances de Noël d'un foyer, calculé dans le navigateur.
 *
 * Sert la page publique /planning-noel : le parent choisit une façon de
 * partager Noël et qui a le jour de Noël cette année ; il obtient les
 * périodes de chacun, à enregistrer en image ou à envoyer à l'autre parent.
 *
 * Fonction pure, sans donnée personnelle : les prénoms éventuels ne quittent
 * jamais le navigateur, ils ne passent pas par ici.
 *
 * Les dates viennent du découpage officiel (lib/noel.ts) ; rien n'est écrit
 * en dur. C'est une proposition à convenir entre parents : une décision de
 * justice ou une convention homologuée prime toujours.
 */

import type { DecoupageNoel } from './noel';

export type FormuleNoel = 'moitie' | 'reveillon' | 'fetes';
export type Parent = 'moi' | 'autre';

export interface PeriodeNoel {
  debut: string;
  fin: string;
  parent: Parent | null;
  /** Ce que la période contient, en clair. */
  libelle: string;
}

export const FORMULES: { id: FormuleNoel; nom: string; detail: string; question: string }[] = [
  {
    id: 'moitie',
    nom: 'Moitié-moitié',
    detail: 'Les vacances coupées en deux : le plus courant.',
    question: 'Qui a la moitié avec Noël cette année ?',
  },
  {
    id: 'reveillon',
    nom: 'Le 24 chez l’un, le 25 chez l’autre',
    detail: 'Les enfants voient les deux familles le jour même.',
    question: 'Qui a le réveillon du 24 cette année ?',
  },
  {
    id: 'fetes',
    nom: 'Noël chez l’un, Nouvel An chez l’autre',
    detail: 'Une fête chacun, le reste selon votre rythme habituel.',
    question: 'Qui a Noël cette année ?',
  },
];

const autre = (p: Parent): Parent => (p === 'moi' ? 'autre' : 'moi');

/**
 * Périodes de chacun, dans l'ordre du calendrier.
 * `parent: null` = jours non concernés par la formule (rythme habituel).
 */
export function planningNoel(noel: DecoupageNoel, formule: FormuleNoel, choisi: Parent): PeriodeNoel[] {
  const an = noel.premierJour.slice(0, 4);
  const suivant = String(Number(an) + 1);
  const j = (mmjj: string, annee = an) => `${annee}-${mmjj}`;

  if (formule === 'moitie') {
    // « choisi » a la moitié qui contient le 25 décembre.
    const premiere = noel.noelDansLaPremiereMoitie ? choisi : autre(choisi);
    return [
      {
        ...noel.premiereMoitie, parent: premiere,
        libelle: noel.noelDansLaPremiereMoitie ? 'Première moitié, avec Noël' : 'Première moitié',
      },
      {
        ...noel.secondeMoitie, parent: autre(premiere),
        libelle: noel.noelDansLaPremiereMoitie ? 'Seconde moitié, avec le Nouvel An' : 'Seconde moitié, avec Noël',
      },
    ];
  }

  const avant = { debut: noel.premierJour, fin: j('12-23'), parent: null, libelle: 'Rythme habituel' };
  if (formule === 'reveillon') {
    return [
      avant,
      { debut: j('12-24'), fin: j('12-24'), parent: choisi, libelle: 'Réveillon du 24' },
      { debut: j('12-25'), fin: j('12-25'), parent: autre(choisi), libelle: 'Jour de Noël' },
      { debut: j('12-26'), fin: noel.dernierJour, parent: null, libelle: 'Rythme habituel' },
    ].filter((p) => p.debut <= p.fin);
  }

  return [
    avant,
    { debut: j('12-24'), fin: j('12-25'), parent: choisi, libelle: 'Réveillon et jour de Noël' },
    { debut: j('12-26'), fin: j('12-30'), parent: null, libelle: 'Rythme habituel' },
    { debut: j('12-31'), fin: j('01-01', suivant), parent: autre(choisi), libelle: 'Saint-Sylvestre et jour de l’An' },
    { debut: j('01-02', suivant), fin: noel.dernierJour, parent: null, libelle: 'Rythme habituel' },
  ].filter((p) => p.debut <= p.fin);
}

/** Bornes affichées : « du 19 au 26 déc. » ou « le 24 déc. ». */
export function bornes(p: PeriodeNoel): string {
  const f = (d: string) => new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${d}T12:00:00Z`));
  // « 1 janv. » → « 1er janv. »
  const r = p.debut === p.fin ? `le ${f(p.debut)}` : `du ${f(p.debut)} au ${f(p.fin)}`;
  return r.replace(/(^|\s)1 (?=[a-zéû]+\.?)/g, '$11er ');
}
