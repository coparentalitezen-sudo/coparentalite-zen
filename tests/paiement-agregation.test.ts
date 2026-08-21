import { describe, it, expect } from 'vitest';
import { agreger, type Arrangement, type StatutPart } from '../src/lib/paiement-partage';

const partage: Arrangement = {
  mode: 'half', partsAttendues: 2, totalCents: 1499, expireLe: null,
};
const integral: Arrangement = {
  mode: 'full', partsAttendues: 1, totalCents: 1499, expireLe: null,
};

const p = (parentId: string, statut: StatutPart, montantCents: number) =>
  ({ parentId, statut, montantCents });

const moitieA = (s: StatutPart) => p('parent-a', s, 750);
const moitieB = (s: StatutPart) => p('parent-b', s, 749);

describe('agrégation d’un partage à deux', () => {
  it('n’active pas sur une seule moitié payée', () => {
    expect(agreger(partage, [moitieA('paid'), moitieB('awaiting_second_setup')]))
      .toBe('moitie_payee');
  });

  it('n’active pas sur une seule moitié présente, fût-elle payée', () => {
    expect(agreger(partage, [moitieA('paid')])).toBe('moitie_payee');
  });

  it('active sur deux moitiés payées', () => {
    expect(agreger(partage, [moitieA('paid'), moitieB('paid')])).toBe('actif');
  });

  it('refuse un partage à trois parts', () => {
    expect(agreger(partage, [
      moitieA('paid'), moitieB('paid'), p('parent-c', 'paid', 500),
    ])).toBe('invalide');
  });

  it('refuse deux parts portées par le même parent', () => {
    expect(agreger(partage, [
      p('parent-a', 'paid', 750), p('parent-a', 'paid', 749),
    ])).toBe('invalide');
  });

  it('refuse une somme qui ne reconstitue pas le total annoncé', () => {
    expect(agreger(partage, [moitieA('paid'), p('parent-b', 'paid', 800)]))
      .toBe('invalide');
  });

  it('refuse un écart d’un seul centime', () => {
    expect(agreger(partage, [moitieA('paid'), p('parent-b', 'paid', 748)]))
      .toBe('invalide');
  });

  it('ne compte pas les parts annulées dans le total attendu', () => {
    expect(agreger(partage, [
      moitieA('paid'), moitieB('paid'), p('parent-c', 'canceled', 999),
    ])).toBe('actif');
  });
});

describe('ordre et rejeu des événements', () => {
  it('donne le même résultat quel que soit l’ordre d’arrivée', () => {
    const ordre1 = agreger(partage, [moitieA('paid'), moitieB('paid')]);
    const ordre2 = agreger(partage, [moitieB('paid'), moitieA('paid')]);
    expect(ordre1).toBe(ordre2);
  });

  it('reste stable si le même événement est rejoué', () => {
    const parts = [moitieA('paid'), moitieB('paid')];
    expect(agreger(partage, parts)).toBe('actif');
    expect(agreger(partage, parts)).toBe('actif');
    expect(agreger(partage, parts)).toBe('actif');
  });

  it('ne fait pas avancer un compteur : deux fois la même part reste une part', () => {
    expect(agreger(partage, [moitieA('paid'), moitieA('paid')])).toBe('invalide');
  });

  it('traverse une séquence complète sans jamais activer trop tôt', () => {
    const etapes: [StatutPart, StatutPart, string][] = [
      ['awaiting_first_setup', 'awaiting_partner', 'en_attente'],
      ['ready_to_charge', 'awaiting_second_setup', 'en_attente'],
      ['ready_to_charge', 'ready_to_charge', 'en_attente'],
      ['processing', 'processing', 'en_attente'],
      ['paid', 'processing', 'moitie_payee'],
      ['paid', 'paid', 'actif'],
    ];
    for (const [a, b, attendu] of etapes) {
      expect(agreger(partage, [moitieA(a), moitieB(b)])).toBe(attendu);
    }
  });

  it('n’active pas si le second parent a seulement accepté', () => {
    expect(agreger(partage, [moitieA('paid'), moitieB('ready_to_charge')]))
      .toBe('moitie_payee');
  });
});

describe('échec, grâce et régularisation', () => {
  it('ouvre la grâce sur un impayé, sans couper l’accès', () => {
    expect(agreger(partage, [moitieA('paid'), moitieB('past_due')])).toBe('grace');
  });

  it('signale une régularisation quand une part est payée et l’autre perdue', () => {
    expect(agreger(partage, [moitieA('paid'), moitieB('failed')]))
      .toBe('remboursement_du');
  });

  it('signale une interruption si rien n’a été encaissé', () => {
    expect(agreger(partage, [moitieA('awaiting_second_setup'), moitieB('refused')]))
      .toBe('interrompu');
  });

  it('fait primer un échec franc sur un simple retard', () => {
    expect(agreger(partage, [moitieA('past_due'), moitieB('failed')]))
      .toBe('interrompu');
  });
});

describe('expiration', () => {
  const t0 = new Date('2026-03-10T00:00:00Z');
  const perime: Arrangement = { ...partage, expireLe: '2026-03-01T00:00:00Z' };

  it('n’active ni ne débite un arrangement périmé', () => {
    expect(agreger(perime, [moitieA('ready_to_charge'), moitieB('awaiting_second_setup')], t0))
      .toBe('expire');
  });

  it('n’annule pas un partage périmé mais intégralement réglé', () => {
    expect(agreger(perime, [moitieA('paid'), moitieB('paid')], t0)).toBe('actif');
  });
});

describe('paiement intégral', () => {
  it('active sur une contribution unique payée', () => {
    expect(agreger(integral, [p('parent-a', 'paid', 1499)])).toBe('actif');
  });

  it('refuse deux contributions dans un arrangement intégral', () => {
    expect(agreger(integral, [
      p('parent-a', 'paid', 750), p('parent-b', 'paid', 749),
    ])).toBe('invalide');
  });

  it('refuse un montant qui ne correspond pas au total', () => {
    expect(agreger(integral, [p('parent-a', 'paid', 1000)])).toBe('invalide');
  });

  it('ouvre la grâce sur un impayé', () => {
    expect(agreger(integral, [p('parent-a', 'past_due', 1499)])).toBe('grace');
  });
});
