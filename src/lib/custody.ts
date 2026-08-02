/**
 * COPARENTALITÉ ZEN — Moteur de planning de garde
 * Génère les périodes de garde jour par jour puis les fusionne en périodes
 * continues. Ordre de priorité (du plus faible au plus fort) :
 *   règle régulière < vacances scolaires < exception < échange accepté.
 * Toutes les dates sont des chaînes 'YYYY-MM-DD' interprétées en local ;
 * l'heure de passage (handover) est portée par la règle, pas par le moteur.
 */

export type ParentId = string;

export type CustodyPattern =
  | 'alternating_weeks'
  | 'p3443'
  | 'even_weeks'
  | 'odd_weeks'
  | 'alternating_weekends'
  | 'p2233'   // 2-2-3
  | 'p2255'   // 2-2-5-5
  | 'custom';

export interface CustodyRule {
  /**
   * Heure du passage d'un parent à l'autre, au format HH:MM.
   * Sans elle, le changement est réputé avoir lieu au lever : la journée
   * entière appartient au parent qui accueille.
   */
  handoverTime?: string | null;
  pattern: CustodyPattern;
  startDate: string;          // 'YYYY-MM-DD' — ancre du cycle
  /**
   * Jour de la semaine où les enfants changent de parent, 0 = dimanche …
   * 6 = samedi. Ne concerne que les rythmes qui raisonnent en semaines
   * entières : les autres nomment déjà chaque jour dans leur motif.
   * Absent : le lundi, comportement historique.
   */
  changeoverDay?: number | null;
  endDate?: string;
  parent1: ParentId;          // parent "de départ" (starting_parent)
  parent2: ParentId;
  /** pour 'custom' : tableau de jours du cycle, ex. ['P1','P1','P2',...] */
  customCycle?: ('P1' | 'P2')[];
}

export interface DayAssignment { date: string; parentId: ParentId; source: Source; }
/**
 * Origine d'une journée : le rythme récurrent, ou le code d'un type
 * d'exception défini en base. On ne fige aucun type ici — « voyage » ou
 * « hospitalisation » s'ajouteront sans toucher au moteur.
 */
export type Source = 'rule' | (string & {});

export interface Period { start: string; end: string; parentId: ParentId; source: Source; }

export interface HolidayOverride {
  startsOn: string;
  endsOn: string;
  /** parent qui a la première moitié */
  firstHalf: ParentId;
  secondHalf: ParentId;
  /** si true, inverse les moitiés les années paires/impaires */
  alternateByYear?: boolean;
}

/**
 * Une exception de planning : une période pendant laquelle un parent
 * déterminé a les enfants, en dérogation au rythme.
 *
 * La PRIORITÉ vient de la base (table exception_types) : le moteur n'a pas à
 * connaître les types. Ajouter « voyage » ou « hospitalisation » ne demande
 * donc aucune modification ici.
 */
export interface ExceptionOverride {
  /** Rang de priorité ; le plus élevé l'emporte. Défaut : 10. */
  priorite?: number;
  startsOn: string;
  endsOn: string;
  parentId: ParentId;
  /** Code du type, tel que défini en base. Défaut : 'exception'. */
  source?: string;
}

// ---------- utilitaires de dates (UTC pour éviter les pièges DST) ----------
const DAY = 86400000;
export function toUTC(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}
export function fromUTC(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function addDays(d: string, n: number): string { return fromUTC(toUTC(d) + n * DAY); }
export function daysBetween(a: string, b: string): number { return Math.round((toUTC(b) - toUTC(a)) / DAY); }
/** Numéro de semaine ISO 8601 */
export function isoWeek(d: string): number {
  const t = new Date(toUTC(d));
  const day = (t.getUTCDay() + 6) % 7; // lundi = 0
  t.setUTCDate(t.getUTCDate() - day + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * DAY));
}

/** Jour de la semaine d'une date : 0 = dimanche … 6 = samedi. */
export function jourSemaine(d: string): number { return new Date(toUTC(d)).getUTCDay(); }

/** Recule une date jusqu'au jour de bascule le plus proche, celui-ci inclus. */
export function reculerAuJour(d: string, jour: number): string {
  return addDays(d, -(((jourSemaine(d) - jour) + 7) % 7));
}

/**
 * Numéro de semaine servant à trancher entre semaines paires et impaires,
 * quand le changement n'a pas lieu le lundi.
 *
 * La garde court du jour de bascule au même jour la semaine suivante. Cette
 * tranche de sept jours contient exactement un lundi : c'est le numéro de
 * semaine de ce lundi qui la désigne. Un changement le vendredi rattache donc
 * vendredi, samedi et dimanche à la semaine civile qui commence le surlendemain
 * — ce que fait déjà tout parent qui « part en week-end pour sa semaine ».
 *
 * Sans jour de bascule, le résultat est celui du calendrier : les deux
 * définitions coïncident, le lundi ouvrant la semaine ISO.
 */
export function semaineDeReference(date: string, jourBascule?: number | null): number {
  if (jourBascule === null || jourBascule === undefined) return isoWeek(date);
  const debutTranche = reculerAuJour(date, jourBascule);
  const lundi = addDays(debutTranche, ((1 - jourSemaine(debutTranche)) + 7) % 7);
  return isoWeek(lundi);
}

/**
 * Ancre d'un cycle hebdomadaire : la date de début, ramenée au jour de
 * bascule qui la précède. Sans jour de bascule, la date de début fait foi —
 * c'est elle qui portait jusqu'ici le jour du changement.
 */
export function ancreHebdomadaire(rule: CustodyRule): string {
  return rule.changeoverDay === null || rule.changeoverDay === undefined
    ? rule.startDate
    : reculerAuJour(rule.startDate, rule.changeoverDay);
}

export const CYCLES: Record<string, ('P1' | 'P2')[]> = {
  // 2-2-3 : cycle de 14 jours — P1 2j, P2 2j, P1 3j, puis inversé
  p2233: ['P1','P1','P2','P2','P1','P1','P1','P2','P2','P1','P1','P2','P2','P2'],
  // 2-2-5-5 : cycle de 14 jours — P1 2j, P2 2j, P1 5j, P2 5j
  p2255: ['P1','P1','P2','P2','P1','P1','P1','P1','P1','P2','P2','P2','P2','P2'],
  // 3-4-4-3 : cycle de 14 jours — P1 3j, P2 4j, puis P2 3j, P1 4j.
  // Les week-ends alternent : une première version plaçait le vendredi au
  // dimanche toujours chez le même parent, ce qui donnait à l'un tous les
  // week-ends de l'année.
  p3443: ['P1','P1','P1','P2','P2','P2','P2','P2','P2','P2','P1','P1','P1','P1'],
};

/** Attribution jour par jour selon la règle régulière. */
export function assignDays(rule: CustodyRule, from: string, to: string): DayAssignment[] {
  if (toUTC(from) > toUTC(to)) throw new Error('Plage de dates invalide');
  const out: DayAssignment[] = [];
  const effectiveEnd = rule.endDate && toUTC(rule.endDate) < toUTC(to) ? rule.endDate : to;

  for (let t = toUTC(from); t <= toUTC(effectiveEnd); t += DAY) {
    const date = fromUTC(t);
    if (toUTC(date) < toUTC(rule.startDate)) continue;
    let who: 'P1' | 'P2';

    switch (rule.pattern) {
      case 'alternating_weeks': {
        const weeks = Math.floor(daysBetween(ancreHebdomadaire(rule), date) / 7);
        who = weeks % 2 === 0 ? 'P1' : 'P2';
        break;
      }
      case 'even_weeks':
        who = semaineDeReference(date, rule.changeoverDay) % 2 === 0 ? 'P1' : 'P2';
        break;
      case 'odd_weeks':
        who = semaineDeReference(date, rule.changeoverDay) % 2 === 1 ? 'P1' : 'P2';
        break;
      case 'alternating_weekends': {
        // Résidence principale chez P1 ; P2 un week-end (sam+dim) sur deux
        const dow = new Date(t).getUTCDay(); // 0 = dimanche, 6 = samedi
        if (dow === 6 || dow === 0) {
          // rattacher le dimanche au samedi qui précède
          const anchorSat = dow === 6 ? date : addDays(date, -1);
          const weekends = Math.floor(daysBetween(rule.startDate, anchorSat) / 7);
          who = weekends % 2 === 0 ? 'P2' : 'P1';
        } else {
          who = 'P1';
        }
        break;
      }
      case 'p3443':
      case 'p2233':
      case 'p2255': {
        const cycle = CYCLES[rule.pattern];
        const idx = ((daysBetween(rule.startDate, date) % cycle.length) + cycle.length) % cycle.length;
        who = cycle[idx];
        break;
      }
      case 'custom': {
        if (!rule.customCycle || rule.customCycle.length === 0) {
          throw new Error('Rythme personnalisé sans cycle défini');
        }
        const c = rule.customCycle;

        // La grille de configuration est toujours présentée de lundi à
        // dimanche. Le cycle personnalisé doit donc rester attaché aux jours
        // de la semaine, même si sa date d'entrée en vigueur est un mercredi,
        // un vendredi ou n'importe quel autre jour.
        //
        // Ancien comportement : l'index 0 du tableau était appliqué à
        // startDate. Une date de début choisie un vendredi faisait ainsi
        // correspondre la colonne « lundi » au vendredi et décalait toutes les
        // bascules. On ancre désormais le tableau sur le lundi de la semaine
        // contenant startDate. startDate demeure seulement la date à partir de
        // laquelle la règle devient active.
        const start = new Date(toUTC(rule.startDate));
        const joursDepuisLundi = (start.getUTCDay() + 6) % 7;
        const lundiAncre = addDays(rule.startDate, -joursDepuisLundi);
        const idx = ((daysBetween(lundiAncre, date) % c.length) + c.length) % c.length;
        who = c[idx];
        break;
      }
    }
    out.push({ date, parentId: who === 'P1' ? rule.parent1 : rule.parent2, source: 'rule' });
  }
  return out;
}

/**
 * Dernier jour qu'une période tient réellement.
 *
 * Une période qui s'achève le 23 août à 14 h ne tient pas la nuit du 23 : à
 * partir de 14 h, les enfants sont chez qui prend le relais. Ce jour-là
 * revient donc au suivant, et la matinée se lit dans la case coupée en deux.
 *
 * Sans cette règle, une période prioritaire — des vacances, par exemple —
 * s'appropriait sa dernière journée entière et masquait la période qui
 * démarrait le même jour. Le changement paraissait alors se produire le
 * lendemain, à une date que personne n'avait saisie nulle part.
 *
 * Minuit et 23:59 signifient « aucune heure précisée » : la journée entière
 * appartient alors à la période, comme auparavant.
 */
export function dernierJourTenu(
  jourDebut: string, jourFin: string, heureFin?: string | null,
): string {
  if (!heureFin || heureFin === '23:59' || heureFin === '00:00') return jourFin;
  const veille = addDays(jourFin, -1);
  // Une période contenue dans une seule journée garde la sienne : la relâcher
  // la ferait disparaître du planning.
  return toUTC(veille) < toUTC(jourDebut) ? jourFin : veille;
}

/** Applique une période de vacances (prioritaire sur la règle régulière). */
export function holidayAssignments(h: HolidayOverride): DayAssignment[] {
  const total = daysBetween(h.startsOn, h.endsOn) + 1;
  const firstLen = Math.ceil(total / 2);
  const year = Number(h.startsOn.slice(0, 4));
  const swap = h.alternateByYear === true && year % 2 === 1;
  const first = swap ? h.secondHalf : h.firstHalf;
  const second = swap ? h.firstHalf : h.secondHalf;
  const out: DayAssignment[] = [];
  for (let i = 0; i < total; i++) {
    out.push({
      date: addDays(h.startsOn, i),
      parentId: i < firstLen ? first : second,
      source: 'holiday',
    });
  }
  return out;
}

/**
 * Compose le calendrier final : règle < vacances < exceptions/échanges.
 * Retourne des périodes continues fusionnées, sans trou ni chevauchement.
 */
export function buildSchedule(
  rule: CustodyRule,
  from: string,
  to: string,
  holidays: HolidayOverride[] = [],
  exceptions: ExceptionOverride[] = []
): Period[] {
  const byDate = new Map<string, DayAssignment>();

  // 1. Le rythme récurrent pose le socle. Il est calculé sur son calendrier
  //    d'origine et ne sera jamais décalé : une exception le masque, un point.
  for (const a of assignDays(rule, from, to)) byDate.set(a.date, a);

  // 2. Les exceptions s'appliquent ensuite, de la moins prioritaire à la plus
  //    prioritaire. La dernière écrite l'emporte, ce qui donne exactement
  //    l'ordre voulu sans qu'aucun type ne soit connu du moteur.
  const parPriorite = [...exceptions].sort(
    (a, b) => (a.priorite ?? 10) - (b.priorite ?? 10),
  );

  for (const e of parPriorite) {
    for (let t = toUTC(e.startsOn); t <= toUTC(e.endsOn); t += DAY) {
      const date = fromUTC(t);
      if (byDate.has(date)) {
        byDate.set(date, { date, parentId: e.parentId, source: e.source ?? 'exception' });
      }
    }
  }

  // 3. Les périodes de vacances transmises séparément restent prises en
  //    charge, pour ne pas rompre les appels existants. Elles se comportent
  //    comme une exception de priorité élevée.
  for (const h of holidays) {
    for (const a of holidayAssignments(h)) {
      if (byDate.has(a.date)) byDate.set(a.date, a);
    }
  }

  // fusion en périodes continues
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const periods: Period[] = [];
  for (const d of days) {
    const last = periods[periods.length - 1];
    if (last && last.parentId === d.parentId && last.source === d.source && addDays(last.end, 1) === d.date) {
      last.end = d.date;
    } else {
      periods.push({ start: d.date, end: d.date, parentId: d.parentId, source: d.source });
    }
  }
  return periods;
}

/**
 * Attribution jour par jour, avec la source retenue.
 * Utile à l'affichage : la grille a besoin du type d'exception, pas seulement
 * du parent gardien.
 */
/**
 * Journées de transition : celles où les enfants changent de parent en cours
 * de journée. Utile pour couper la case du calendrier en deux.
 *
 * Une journée est partagée si le parent de la veille diffère de celui du jour
 * ET qu'une heure de passage est définie. Sans heure, le changement est réputé
 * avoir lieu au lever et la journée n'est pas coupée.
 */
export interface JourneePartagee {
  date: string;
  /** Parent qui a les enfants jusqu'à l'heure de passage. */
  matin: ParentId;
  /** Parent qui les accueille à partir de l'heure de passage. */
  apresMidi: ParentId;
  /** Heure du passage, au format HH:MM. */
  heure: string;
}

export function journeesPartagees(
  carte: Map<string, DayAssignment>,
  heurePassage: string | null | undefined,
  /**
   * Heures propres à certaines journées, prioritaires sur celle du rythme.
   *
   * Une période de vacances peut commencer à 16 h alors que le rythme change
   * habituellement à 18 h : c'est l'heure de la période qui vaut ce jour-là.
   */
  heuresParticulieres?: Map<string, string>,
): Map<string, JourneePartagee> {
  const partagees = new Map<string, JourneePartagee>();
  // Une heure particulière suffit à couper une journée, même si le rythme
  // n'en déclare aucune.
  if (!heurePassage && !heuresParticulieres?.size) return partagees;

  const dates = [...carte.keys()].sort();
  for (let i = 1; i < dates.length; i += 1) {
    const veille = carte.get(dates[i - 1])!;
    const jour = carte.get(dates[i])!;
    if (veille.parentId !== jour.parentId) {
      const heure = heuresParticulieres?.get(dates[i]) ?? heurePassage;
      if (!heure) continue;      // aucune heure connue : journée non coupée
      partagees.set(dates[i], {
        date: dates[i],
        matin: veille.parentId,
        apresMidi: jour.parentId,
        heure,
      });
    }
  }
  return partagees;
}

export function buildDayMap(
  rule: CustodyRule,
  from: string,
  to: string,
  holidays: HolidayOverride[] = [],
  exceptions: ExceptionOverride[] = []
): Map<string, DayAssignment> {
  const map = new Map<string, DayAssignment>();
  for (const p of buildSchedule(rule, from, to, holidays, exceptions)) {
    for (let t = toUTC(p.start); t <= toUTC(p.end); t += DAY) {
      const date = fromUTC(t);
      map.set(date, { date, parentId: p.parentId, source: p.source });
    }
  }
  return map;
}

/** Vérifie l'intégrité d'un calendrier : couverture complète, aucun chevauchement. */
export function validateSchedule(periods: Period[], from: string, to: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (periods.length === 0) return { ok: false, issues: ['Aucune période générée'] };
  if (periods[0].start !== from) issues.push(`Trou au début : commence à ${periods[0].start} au lieu de ${from}`);
  if (periods[periods.length - 1].end !== to) issues.push(`Trou à la fin : termine à ${periods[periods.length - 1].end} au lieu de ${to}`);
  for (let i = 1; i < periods.length; i++) {
    const expected = addDays(periods[i - 1].end, 1);
    if (periods[i].start !== expected) {
      issues.push(`Discontinuité entre ${periods[i - 1].end} et ${periods[i].start}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** « Où se trouve l'enfant aujourd'hui ? » + prochain changement. */
export function whereToday(periods: Period[], today: string): { parentId: ParentId; nextChange: string | null; nextParent: ParentId | null } | null {
  const p = periods.find((x) => x.start <= today && today <= x.end);
  if (!p) return null;
  const idx = periods.indexOf(p);
  const next = periods[idx + 1] ?? null;
  return { parentId: p.parentId, nextChange: next ? next.start : null, nextParent: next ? next.parentId : null };
}
