/**
 * Jours fériés de France métropolitaine — calcul pur, aucun appel externe.
 * Utilisé pour masquer les créneaux scolaires du planning ces jours-là
 * (voir ÉTAPE 5 : « aucun créneau ne doit s'afficher pendant les vacances ou
 * un jour férié »). Les collèges/lycées de métropole partagent ce calendrier ;
 * l'Alsace-Moselle et l'outre-mer ont des jours supplémentaires, hors scope v1.
 */

function paques(annee: number): { mois: number; jour: number } {
  // Algorithme de Meeus/Jones/Butcher (calendrier grégorien).
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { mois, jour };
}

function addJours(annee: number, mois: number, jour: number, delta: number): string {
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Toutes les dates fériées (AAAA-MM-JJ) d'une année donnée. */
export function joursFeriesAnnee(annee: number): Set<string> {
  const p = paques(annee);
  const fixes = [
    `${annee}-01-01`, `${annee}-05-01`, `${annee}-05-08`, `${annee}-07-14`,
    `${annee}-08-15`, `${annee}-11-01`, `${annee}-11-11`, `${annee}-12-25`,
  ];
  const mobiles = [
    addJours(annee, p.mois, p.jour, 1),   // lundi de Pâques
    addJours(annee, p.mois, p.jour, 39),  // Ascension
    addJours(annee, p.mois, p.jour, 50),  // lundi de Pentecôte
  ];
  return new Set([...fixes, ...mobiles]);
}

const cache = new Map<number, Set<string>>();

export function estJourFerie(dateIso: string): boolean {
  const annee = Number(dateIso.slice(0, 4));
  let jours = cache.get(annee);
  if (!jours) { jours = joursFeriesAnnee(annee); cache.set(annee, jours); }
  return jours.has(dateIso);
}
