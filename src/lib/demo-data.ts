/**
 * Données de démonstration — clairement fictives.
 * Utilisées quand NEXT_PUBLIC_SUPABASE_URL est absent (mode démo) afin que
 * l'application soit navigable sans backend. La couche Supabase remplace ce
 * module dès que le projet est connecté (voir GUIDE-DEPLOIEMENT.md).
 */
import { buildSchedule, whereToday, type CustodyRule, type HolidayOverride } from './custody';
import { splitAmount, computePairBalance, type ExpenseForBalance } from './money';

export const DEMO = {
  household: { id: 'demo', name: 'Famille Démo' },
  parents: [
    { id: 'p1', name: 'Camille', initial: 'C', colorKey: 'navy' as const },
    { id: 'p2', name: 'Julien', initial: 'J', colorKey: 'coral' as const },
  ],
  children: [
    { id: 'c1', name: 'Léa', color: '#9AA791', birth: '2018-04-12' },
    { id: 'c2', name: 'Noah', color: '#4E6381', birth: '2021-09-03' },
  ],
};

export const demoRule: CustodyRule = {
  pattern: 'alternating_weeks',
  startDate: '2026-01-05',
  parent1: 'p1',
  parent2: 'p2',
};

export const demoHolidays: HolidayOverride[] = [
  { startsOn: '2026-07-04', endsOn: '2026-08-31', firstHalf: 'p1', secondHalf: 'p2' },
];

export interface DemoExpense {
  id: string; title: string; amountCents: number; date: string;
  category: string; paidBy: string; childIds: string[];
  status: 'a_valider' | 'validee' | 'contestee' | 'envoyee';
}

export const demoExpenses: DemoExpense[] = [
  { id: 'e1', title: 'Cantine juillet', amountCents: 8550, date: '2026-07-02', category: 'Cantine', paidBy: 'p1', childIds: ['c1'], status: 'validee' },
  { id: 'e2', title: 'Pharmacie', amountCents: 2340, date: '2026-07-10', category: 'Pharmacie', paidBy: 'p2', childIds: ['c2'], status: 'validee' },
  { id: 'e3', title: 'Stage multisports', amountCents: 12000, date: '2026-07-15', category: 'Sport', paidBy: 'p1', childIds: ['c1', 'c2'], status: 'a_valider' },
  { id: 'e4', title: 'Chaussures rentrée', amountCents: 6490, date: '2026-07-18', category: 'Chaussures', paidBy: 'p2', childIds: ['c1'], status: 'envoyee' },
];

export function demoSchedule(from: string, to: string) {
  return buildSchedule(demoRule, from, to, demoHolidays);
}

export function demoToday(today: string) {
  const periods = demoSchedule('2026-01-05', '2026-12-31');
  return whereToday(periods, today);
}

export function demoBalance() {
  const validated: ExpenseForBalance[] = demoExpenses
    .filter((e) => e.status === 'validee')
    .map((e) => ({
      paidBy: e.paidBy,
      allocations: splitAmount(e.amountCents, [
        { kind: 'percentage', parentId: 'p1', basisPoints: 5000 },
        { kind: 'percentage', parentId: 'p2', basisPoints: 5000 },
      ]),
    }));
  return computePairBalance('p1', 'p2', validated);
}

export const parentById = (id: string) => DEMO.parents.find((p) => p.id === id)!;
export const childById = (id: string) => DEMO.children.find((c) => c.id === id)!;

export const isDemoMode = () => !process.env.NEXT_PUBLIC_SUPABASE_URL;
