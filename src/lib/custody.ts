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
  | 'even_weeks'
  | 'odd_weeks'
  | 'alternating_weekends'
  | 'p2233'   // 2-2-3
  | 'p2255'   // 2-2-5-5
  | 'custom';

export interface CustodyRule {
  pattern: CustodyPattern;
  startDate: string;          // 'YYYY-MM-DD' — ancre du cycle
  endDate?: string;
  parent1: ParentId;          // parent "de départ" (starting_parent)
  parent2: ParentId;
  /** pour 'custom' : tableau de jours du cycle, ex. ['P1','P1','P2',...] */
  customCycle?: ('P1' | 'P2')[];
}

export interface DayAssignment { date: string; parentId: ParentId; source: Source; }
export type Source = 'rule' | 'holiday' | 'exception' | 'exchange';

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

export interface ExceptionOverride {
  startsOn: string;
  endsOn: string;
  parentId: ParentId;
  source?: Extract<Source, 'exception' | 'exchange'>;
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

const CYCLES: Record<string, ('P1' | 'P2')[]> = {
  // 2-2-3 : cycle de 14 jours — P1 2j, P2 2j, P1 3j, puis inversé
  p2233: ['P1','P1','P2','P2','P1','P1','P1','P2','P2','P1','P1','P2','P2','P2'],
  // 2-2-5-5 : cycle de 14 jours — P1 2j, P2 2j, P1 5j, P2 5j
  p2255: ['P1','P1','P2','P2','P1','P1','P1','P1','P1','P2','P2','P2','P2','P2'],
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
        const weeks = Math.floor(daysBetween(rule.startDate, date) / 7);
        who = weeks % 2 === 0 ? 'P1' : 'P2';
        break;
      }
      case 'even_weeks':
        who = isoWeek(date) % 2 === 0 ? 'P1' : 'P2';
        break;
      case 'odd_weeks':
        who = isoWeek(date) % 2 === 1 ? 'P1' : 'P2';
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
        const idx = ((daysBetween(rule.startDate, date) % c.length) + c.length) % c.length;
        who = c[idx];
        break;
      }
    }
    out.push({ date, parentId: who === 'P1' ? rule.parent1 : rule.parent2, source: 'rule' });
  }
  return out;
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

  // ORDRE DE PRIORITÉ (du plus faible au plus fort) :
  //   1. rythme récurrent  2. changement ponctuel  3. vacances
  // Chaque couche écrase la précédente sur les jours qu'elle couvre. Le rythme
  // récurrent reste calculé sur son calendrier d'origine : une exception ne le
  // décale pas, elle le masque le temps de sa durée.
  for (const a of assignDays(rule, from, to)) byDate.set(a.date, a);

  for (const e of exceptions) {
    for (let t = toUTC(e.startsOn); t <= toUTC(e.endsOn); t += DAY) {
      const date = fromUTC(t);
      if (byDate.has(date)) {
        byDate.set(date, { date, parentId: e.parentId, source: e.source ?? 'exception' });
      }
    }
  }

  for (const h of holidays) {
    for (const a of holidayAssignments(h)) {
      if (byDate.has(a.date)) byDate.set(a.date, a); // les vacances priment sur tout
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
