import { describe, it, expect } from 'vitest';
import {
  MODELES, modele, schemaDeuxSemaines, repartition,
  cycleParDefaut, validerCyclePersonnalise,
} from '../src/lib/rythmes';
import { buildDayMap, journeesPartagees } from '../src/lib/custody';

describe('catalogue des rythmes', () => {
  it('propose les sept modèles annoncés', () => {
    expect(MODELES).toHaveLength(7);
    const patterns = MODELES.map((m) => m.pattern);
    expect(patterns).toEqual(expect.arrayContaining([
      'alternating_weeks', 'even_weeks', 'p2233', 'p3443', 'p2255',
      'alternating_weekends', 'custom',
    ]));
  });

  it('chaque modèle est expliqué en langage courant', () => {
    for (const m of MODELES) {
      expect(m.nom.length).toBeGreaterThan(2);
      expect(m.explication.length).toBeGreaterThan(30);
      expect(m.convientA.length).toBeGreaterThan(20);
      // Pas de jargon technique dans ce qui est montré à un parent
      expect(m.explication).not.toMatch(/pattern|cycle\[|P1|P2/);
    }
  });

  it('chaque modèle fournit un schéma de deux semaines', () => {
    for (const m of MODELES) {
      expect(m.schema).toHaveLength(14);
      expect(m.schema.every((j) => j === 'P1' || j === 'P2')).toBe(true);
    }
  });
});

describe('schémas et réalité du moteur', () => {
  const rythmeDe = (pattern: string) => ({
    pattern: pattern as never, startDate: '2026-07-06',   // un lundi
    parent1: 'p1', parent2: 'p2',
  });

  it('le schéma affiché correspond à ce que le moteur calcule', () => {
    // Un schéma qui mentirait sur le fonctionnement réel serait pire
    // qu'une absence de schéma.
    for (const m of MODELES.filter((x) => !x.personnalisable)) {
      const carte = buildDayMap(rythmeDe(m.pattern), '2026-07-06', '2026-07-19');
      const reel = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 6, 6 + i)).toISOString().slice(0, 10);
        return carte.get(d)!.parentId === 'p1' ? 'P1' : 'P2';
      });
      expect(reel, `schéma incorrect pour ${m.nom}`).toEqual(m.schema);
    }
  });

  it('le 3-4-4-3 donne bien 7 jours à chacun sur deux semaines', () => {
    const r = repartition(schemaDeuxSemaines('p3443'));
    expect(r.joursP1).toBe(7);
    expect(r.joursP2).toBe(7);
    expect(r.equilibre).toBe(true);
  });

  it('le 3-4-4-3 rend les mêmes jours de semaine une semaine sur deux', () => {
    const s = schemaDeuxSemaines('p3443');
    // le jour i de la première semaine est chez l'autre parent la seconde
    for (let i = 0; i < 7; i += 1) {
      expect(s[i]).not.toBe(s[i + 7]);
    }
  });

  it('le week-end alterné laisse la semaine chez le parent principal', () => {
    const s = schemaDeuxSemaines('alternating_weekends');
    for (const i of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) expect(s[i]).toBe('P1');
    expect(s[5]).toBe('P2');   // samedi de la première semaine
    expect(s[6]).toBe('P2');   // dimanche
  });

  it('la semaine alternée est parfaitement équilibrée', () => {
    expect(repartition(schemaDeuxSemaines('alternating_weeks')).equilibre).toBe(true);
  });
});

describe('cycle personnalisé', () => {
  it('propose une alternance hebdomadaire comme point de départ', () => {
    const c = cycleParDefaut(2);
    expect(c).toHaveLength(14);
    expect(c.slice(0, 7).every((j) => j === 'P1')).toBe(true);
    expect(c.slice(7).every((j) => j === 'P2')).toBe(true);
  });

  it('accepte des cycles d’une à quatre semaines', () => {
    for (const s of [1, 2, 3, 4] as const) {
      expect(cycleParDefaut(s)).toHaveLength(s * 7);
      expect(validerCyclePersonnalise(cycleParDefaut(s))).toBeNull();
    }
  });

  it('refuse un cycle incomplet', () => {
    expect(validerCyclePersonnalise([])).toMatch(/au moins une semaine/);
    expect(validerCyclePersonnalise(Array(10).fill('P1'))).toMatch(/semaines entières/);
  });

  it('refuse un cycle qui prive un parent de toute garde', () => {
    // Un rythme où un parent n'a jamais les enfants n'est pas une garde
    // partagée : mieux vaut le dire que de l'enregistrer.
    expect(validerCyclePersonnalise(Array(14).fill('P1'))).toMatch(/au moins un jour/);
  });

  it('refuse un cycle de plus de quatre semaines', () => {
    expect(validerCyclePersonnalise(Array(35).fill('P1'))).toMatch(/quatre semaines/);
  });

  it('un cycle personnalisé est appliqué fidèlement par le moteur', () => {
    // Roulement de pompier : deux jours de garde, quatre de repos
    const cycle: ('P1' | 'P2')[] = [
      'P2', 'P2', 'P1', 'P1', 'P1', 'P1', 'P1',
      'P2', 'P2', 'P1', 'P1', 'P1', 'P1', 'P1',
    ];
    const m = buildDayMap(
      { pattern: 'custom', startDate: '2026-07-06', parent1: 'p1', parent2: 'p2', customCycle: cycle },
      '2026-07-06', '2026-07-19',
    );
    expect(m.get('2026-07-06')!.parentId).toBe('p2');
    expect(m.get('2026-07-08')!.parentId).toBe('p1');
    // et le cycle se répète
    expect(m.get('2026-07-13')!.parentId).toBe('p2');
  });

  it('conserve les bascules sur le bon jour de semaine quand la règle commence en cours de semaine', () => {
    // La grille est saisie lundi -> dimanche. Ici, P1 a les enfants du lundi
    // au jeudi et P2 du vendredi au dimanche. La règle entre en vigueur un
    // mercredi : le vendredi doit malgré tout rester le jour de bascule.
    const cycle: ('P1' | 'P2')[] = [
      'P1', 'P1', 'P1', 'P1', 'P2', 'P2', 'P2',
      'P1', 'P1', 'P1', 'P1', 'P2', 'P2', 'P2',
    ];
    const m = buildDayMap(
      { pattern: 'custom', startDate: '2026-07-08', parent1: 'p1', parent2: 'p2', customCycle: cycle },
      '2026-07-08', '2026-07-19',
    );

    expect(m.get('2026-07-08')!.parentId).toBe('p1'); // mercredi
    expect(m.get('2026-07-09')!.parentId).toBe('p1'); // jeudi
    expect(m.get('2026-07-10')!.parentId).toBe('p2'); // vendredi : bascule
    expect(m.get('2026-07-12')!.parentId).toBe('p2'); // dimanche
    expect(m.get('2026-07-13')!.parentId).toBe('p1'); // lundi suivant
    expect(m.get('2026-07-17')!.parentId).toBe('p2'); // vendredi suivant

    const transitions = journeesPartagees(m, '18:00');
    expect(transitions.get('2026-07-10')).toMatchObject({
      matin: 'p1', apresMidi: 'p2', heure: '18:00',
    });
    expect(transitions.get('2026-07-17')).toMatchObject({
      matin: 'p1', apresMidi: 'p2', heure: '18:00',
    });
  });

  it('conserve aussi le vendredi comme bascule quand la règle entre en vigueur un vendredi', () => {
    const cycle: ('P1' | 'P2')[] = [
      'P1', 'P1', 'P1', 'P1', 'P2', 'P2', 'P2',
    ];
    const m = buildDayMap(
      { pattern: 'custom', startDate: '2026-07-10', parent1: 'p1', parent2: 'p2', customCycle: cycle },
      '2026-07-10', '2026-07-19',
    );

    expect(m.get('2026-07-10')!.parentId).toBe('p2');
    expect(m.get('2026-07-13')!.parentId).toBe('p1');
    expect(m.get('2026-07-17')!.parentId).toBe('p2');
  });

  it('la répartition annonce des chiffres exacts', () => {
    const r = repartition(['P1', 'P1', 'P1', 'P2', 'P2', 'P2', 'P2']);
    expect(r.joursP1).toBe(3);
    expect(r.joursP2).toBe(4);
    expect(r.pourcentP1).toBe(43);
    expect(r.equilibre).toBe(false);
  });
});

describe('modele()', () => {
  it('retrouve un modèle par son identifiant', () => {
    expect(modele('p3443')?.nom).toBe('3-4-4-3');
  });
  it('ne renvoie rien pour un identifiant inconnu', () => {
    expect(modele('inexistant' as never)).toBeUndefined();
  });
});


describe('semaines paires et impaires', () => {
  const rythme = (pattern: 'even_weeks' | 'odd_weeks') => ({
    pattern: pattern as never, startDate: '2026-01-05',
    parent1: 'p1', parent2: 'p2',
  });

  /** Numéro de semaine ISO, comme l'affichent les agendas. */
  function semaineISO(iso: string): number {
    const d = new Date(`${iso}T12:00:00Z`);
    const jour = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - jour + 3);
    const premierJeudi = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const decalage = (premierJeudi.getUTCDay() + 6) % 7;
    premierJeudi.setUTCDate(premierJeudi.getUTCDate() - decalage + 3);
    return 1 + Math.round((d.getTime() - premierJeudi.getTime()) / (7 * 86400000));
  }

  it('les semaines paires vont au premier parent', () => {
    const m = buildDayMap(rythme('even_weeks'), '2026-01-05', '2026-03-01');
    for (const [date, a] of m) {
      const attendu = semaineISO(date) % 2 === 0 ? 'p1' : 'p2';
      expect(a.parentId, `${date} (semaine ${semaineISO(date)})`).toBe(attendu);
    }
  });

  it('le rythme inverse donne exactement le contraire', () => {
    const pair = buildDayMap(rythme('even_weeks'), '2026-01-05', '2026-03-01');
    const impair = buildDayMap(rythme('odd_weeks'), '2026-01-05', '2026-03-01');
    for (const [date, a] of pair) {
      expect(impair.get(date)!.parentId, date).not.toBe(a.parentId);
    }
  });

  it('une semaine entière reste chez le même parent', () => {
    // C'est tout l'intérêt : pas de passage en milieu de semaine
    const m = buildDayMap(rythme('even_weeks'), '2026-01-05', '2026-02-01');
    const dates = [...m.keys()].sort();
    for (const d of dates) {
      const jour = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (jour === 0) continue;   // dimanche : fin de semaine ISO
      const lendemain = new Date(new Date(`${d}T12:00:00Z`).getTime() + 86400000)
        .toISOString().slice(0, 10);
      if (m.has(lendemain) && semaineISO(d) === semaineISO(lendemain)) {
        expect(m.get(lendemain)!.parentId, `${d} → ${lendemain}`).toBe(m.get(d)!.parentId);
      }
    }
  });

  it('la date de début ne décale pas le rythme', () => {
    // Contrairement à l'alternance simple, le calendrier fait foi : deux
    // foyers ayant démarré à des dates différentes voient les mêmes semaines.
    const a = buildDayMap(rythme('even_weeks'), '2026-01-05', '2026-02-15');
    const b = buildDayMap(
      { pattern: 'even_weeks' as never, startDate: '2026-01-19', parent1: 'p1', parent2: 'p2' },
      '2026-01-19', '2026-02-15',
    );
    for (const [date, x] of b) {
      expect(a.get(date)!.parentId, date).toBe(x.parentId);
    }
  });
});
