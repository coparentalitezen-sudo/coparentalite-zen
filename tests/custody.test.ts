import { describe, it, expect } from 'vitest';
import {
  assignDays, buildSchedule, validateSchedule, whereToday,
  holidayAssignments, isoWeek, addDays,
  type CustodyRule,
} from '../src/lib/custody';

const P1 = 'alice', P2 = 'bob';
// Lundi 5 janvier 2026 comme ancre (2026-01-05 est bien un lundi)
const base: CustodyRule = { pattern: 'alternating_weeks', startDate: '2026-01-05', parent1: P1, parent2: P2 };

describe('rythmes réguliers', () => {
  it('une semaine sur deux : bascule exactement au 7e jour', () => {
    const days = assignDays(base, '2026-01-05', '2026-01-19');
    expect(days[0]).toMatchObject({ date: '2026-01-05', parentId: P1 });
    expect(days[6]).toMatchObject({ date: '2026-01-11', parentId: P1 });
    expect(days[7]).toMatchObject({ date: '2026-01-12', parentId: P2 });
    expect(days[13]).toMatchObject({ date: '2026-01-18', parentId: P2 });
    expect(days[14]).toMatchObject({ date: '2026-01-19', parentId: P1 });
  });

  it('semaines paires / impaires (ISO 8601)', () => {
    expect(isoWeek('2026-01-05')).toBe(2); // semaine ISO 2
    const even = assignDays({ ...base, pattern: 'even_weeks' }, '2026-01-05', '2026-01-18');
    expect(even[0].parentId).toBe(P1);   // semaine 2 (paire) → P1
    expect(even[7].parentId).toBe(P2);   // semaine 3 (impaire) → P2
    const odd = assignDays({ ...base, pattern: 'odd_weeks' }, '2026-01-05', '2026-01-18');
    expect(odd[0].parentId).toBe(P2);
    expect(odd[7].parentId).toBe(P1);
  });

  it('2-2-3 : cycle de 14 jours, chaque parent a 7 jours par quinzaine', () => {
    const days = assignDays({ ...base, pattern: 'p2233' }, '2026-01-05', '2026-01-18');
    const seq = days.map(d => (d.parentId === P1 ? '1' : '2')).join('');
    expect(seq).toBe('11221112211222');
    expect(seq.split('1').length - 1).toBe(7);
    // le cycle se répète à l'identique la quinzaine suivante
    const next = assignDays({ ...base, pattern: 'p2233' }, '2026-01-19', '2026-02-01');
    expect(next.map(d => (d.parentId === P1 ? '1' : '2')).join('')).toBe(seq);
  });

  it('2-2-5-5 : cycle de 14 jours équilibré', () => {
    const days = assignDays({ ...base, pattern: 'p2255' }, '2026-01-05', '2026-01-18');
    const seq = days.map(d => (d.parentId === P1 ? '1' : '2')).join('');
    expect(seq).toBe('11221111122222');
    expect(seq.split('1').length - 1).toBe(7);
  });

  it('un week-end sur deux : P2 samedi+dimanche en alternance, P1 en semaine', () => {
    const days = assignDays({ ...base, pattern: 'alternating_weekends' }, '2026-01-05', '2026-01-25');
    const byDate = Object.fromEntries(days.map(d => [d.date, d.parentId]));
    expect(byDate['2026-01-07']).toBe(P1); // mercredi
    expect(byDate['2026-01-10']).toBe(P2); // 1er samedi → P2
    expect(byDate['2026-01-11']).toBe(P2); // dimanche attaché
    expect(byDate['2026-01-17']).toBe(P1); // 2e week-end → P1
    expect(byDate['2026-01-18']).toBe(P1);
    expect(byDate['2026-01-24']).toBe(P2); // 3e week-end → P2
  });

  it('rythme personnalisé', () => {
    const days = assignDays(
      { ...base, pattern: 'custom', customCycle: ['P1','P2','P2'] },
      '2026-01-05', '2026-01-10'
    );
    expect(days.map(d => d.parentId)).toEqual([P1, P2, P2, P1, P2, P2]);
  });

  it('respecte la date de fin de la règle et rejette une plage inversée', () => {
    const days = assignDays({ ...base, endDate: '2026-01-07' }, '2026-01-05', '2026-01-31');
    expect(days.length).toBe(3);
    expect(() => assignDays(base, '2026-02-01', '2026-01-01')).toThrow(/invalide/);
  });
});

describe('vacances scolaires — prioritaires sur la règle régulière', () => {
  it('coupe la période en deux moitiés (durée impaire : première moitié plus longue)', () => {
    const h = holidayAssignments({ startsOn: '2026-12-19', endsOn: '2027-01-04', firstHalf: P1, secondHalf: P2 });
    expect(h.length).toBe(17);
    expect(h.filter(d => d.parentId === P1).length).toBe(9);
    expect(h.filter(d => d.parentId === P2).length).toBe(8);
    expect(h[8]).toMatchObject({ date: '2026-12-27', parentId: P1 });
    expect(h[9]).toMatchObject({ date: '2026-12-28', parentId: P2 });
  });

  it('alternance selon l’année : inversée les années impaires', () => {
    const even = holidayAssignments({ startsOn: '2026-12-19', endsOn: '2026-12-30', firstHalf: P1, secondHalf: P2, alternateByYear: true });
    expect(even[0].parentId).toBe(P1);
    const odd = holidayAssignments({ startsOn: '2027-12-18', endsOn: '2027-12-29', firstHalf: P1, secondHalf: P2, alternateByYear: true });
    expect(odd[0].parentId).toBe(P2);
  });

  it('remplace la règle régulière uniquement sur la période de vacances', () => {
    const periods = buildSchedule(base, '2026-02-01', '2026-03-15', [
      // vacances d'hiver zone A 2026 (fictives pour le test) : 14-28 février
      { startsOn: '2026-02-14', endsOn: '2026-02-28', firstHalf: P2, secondHalf: P1 },
    ]);
    const feb20 = whereToday(periods, '2026-02-20')!;
    expect(feb20.parentId).toBe(P2); // première moitié → P2, quoi que dise la règle
    const holidayPeriods = periods.filter(p => p.source === 'holiday');
    expect(holidayPeriods[0].start).toBe('2026-02-14');
    expect(holidayPeriods[holidayPeriods.length - 1].end).toBe('2026-02-28');
    // avant et après les vacances, on retrouve la règle
    expect(periods.find(p => p.start <= '2026-02-10' && '2026-02-10' <= p.end)!.source).toBe('rule');
    expect(periods.find(p => p.start <= '2026-03-05' && '2026-03-05' <= p.end)!.source).toBe('rule');
  });
});

describe('exceptions et échanges — prioritaires sur tout', () => {
  it('une exception écrase même les vacances', () => {
    const periods = buildSchedule(base, '2026-02-01', '2026-03-01',
      [{ startsOn: '2026-02-14', endsOn: '2026-02-28', firstHalf: P2, secondHalf: P1 }],
      [{ startsOn: '2026-02-16', endsOn: '2026-02-17', parentId: P1 }]
    );
    expect(whereToday(periods, '2026-02-16')!.parentId).toBe(P1);
    expect(whereToday(periods, '2026-02-15')!.parentId).toBe(P2);
    expect(whereToday(periods, '2026-02-18')!.parentId).toBe(P2);
  });

  it('un échange accepté est tracé avec sa source', () => {
    const periods = buildSchedule(base, '2026-01-05', '2026-01-18', [],
      [{ startsOn: '2026-01-10', endsOn: '2026-01-11', parentId: P2, source: 'exchange' }]);
    const p = periods.find(x => x.start === '2026-01-10')!;
    expect(p.source).toBe('exchange');
    expect(p.parentId).toBe(P2);
  });
});

describe('intégrité du calendrier', () => {
  it('aucun trou ni chevauchement sur 12 mois, tous rythmes confondus', () => {
    for (const pattern of ['alternating_weeks','even_weeks','odd_weeks','alternating_weekends','p2233','p2255'] as const) {
      const periods = buildSchedule({ ...base, pattern }, '2026-01-05', '2027-01-04', [
        { startsOn: '2026-07-04', endsOn: '2026-08-31', firstHalf: P1, secondHalf: P2 },
        { startsOn: '2026-12-19', endsOn: '2027-01-04', firstHalf: P2, secondHalf: P1, alternateByYear: true },
      ]);
      const v = validateSchedule(periods, '2026-01-05', '2027-01-04');
      expect(v.issues).toEqual([]);
      expect(v.ok).toBe(true);
    }
  });

  it('« aujourd’hui » : parent actuel et prochain changement', () => {
    const periods = buildSchedule(base, '2026-01-05', '2026-02-01');
    const t = whereToday(periods, '2026-01-08')!;
    expect(t.parentId).toBe(P1);
    expect(t.nextChange).toBe('2026-01-12');
    expect(t.nextParent).toBe(P2);
    expect(whereToday(periods, '2030-01-01')).toBeNull();
  });

  it('détecte réellement un trou (auto-test du validateur)', () => {
    const broken = [
      { start: '2026-01-05', end: '2026-01-10', parentId: P1, source: 'rule' as const },
      { start: '2026-01-12', end: '2026-01-18', parentId: P2, source: 'rule' as const },
    ];
    const v = validateSchedule(broken, '2026-01-05', '2026-01-18');
    expect(v.ok).toBe(false);
    expect(v.issues[0]).toMatch(/Discontinuité/);
  });
});
