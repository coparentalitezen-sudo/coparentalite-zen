import { describe, it, expect, afterEach } from 'vitest';
import {
  repartirMoitie, sommeCoherente, estExpiree, echeanceDemande, echeanceReglement,
  etatPartage, abonnementOuvrable, estTerminal, partageDisponible, formatCents,
  DUREE_DEMANDE_JOURS, DELAI_REGLEMENT_HEURES,
  type Part,
} from '../src/lib/paiement-partage';

const part = (statut: Part['statut'], montantCents = 750): Part => ({ statut, montantCents });

describe('répartition à 50 %', () => {
  it('coupe un montant pair en deux parts identiques', () => {
    expect(repartirMoitie(1498)).toEqual({ premiere: 749, seconde: 749 });
  });

  it('donne le centime supplémentaire à la première part sur un montant impair', () => {
    expect(repartirMoitie(1499)).toEqual({ premiere: 750, seconde: 749 });
  });

  it('applique la même règle au tarif mensuel', () => {
    expect(repartirMoitie(149)).toEqual({ premiere: 75, seconde: 74 });
  });

  it('est déterministe : deux appels donnent le même découpage', () => {
    expect(repartirMoitie(1499)).toEqual(repartirMoitie(1499));
  });

  it('ne perd ni n’invente de centime, sur toute la plage utile', () => {
    for (let total = 0; total <= 5000; total += 1) {
      const { premiere, seconde } = repartirMoitie(total);
      expect(premiere + seconde).toBe(total);
      expect(premiere - seconde).toBeGreaterThanOrEqual(0);
      expect(premiere - seconde).toBeLessThanOrEqual(1);
    }
  });

  it('refuse un montant fractionnaire plutôt que de l’arrondir en douce', () => {
    expect(() => repartirMoitie(1499.5)).toThrow();
  });

  it('refuse un montant négatif', () => {
    expect(() => repartirMoitie(-100)).toThrow();
  });

  it('vérifie la cohérence de la somme affichée', () => {
    const { premiere, seconde } = repartirMoitie(1499);
    expect(sommeCoherente([premiere, seconde], 1499)).toBe(true);
    expect(sommeCoherente([premiere, seconde], 1500)).toBe(false);
  });

  it('formate les deux montants exacts pour l’affichage', () => {
    const { premiere, seconde } = repartirMoitie(1499);
    expect(formatCents(premiere)).toContain('7,50');
    expect(formatCents(seconde)).toContain('7,49');
  });
});

describe('expiration des demandes', () => {
  const t0 = new Date('2026-03-01T10:00:00Z');

  it('ne périme pas une demande sans échéance', () => {
    expect(estExpiree(null, t0)).toBe(false);
  });

  it('ne périme pas une demande encore dans les temps', () => {
    expect(estExpiree('2026-03-05T10:00:00Z', t0)).toBe(false);
  });

  it('périme une demande dont l’échéance est passée', () => {
    expect(estExpiree('2026-02-28T10:00:00Z', t0)).toBe(true);
  });

  it('périme à l’instant exact de l’échéance, sans zone grise', () => {
    expect(estExpiree('2026-03-01T10:00:00Z', t0)).toBe(true);
  });

  it('traite une date illisible comme périmée, plutôt que de laisser ouvert', () => {
    expect(estExpiree('pas-une-date', t0)).toBe(true);
  });

  it('place l’échéance de demande à sept jours', () => {
    const attendu = t0.getTime() + DUREE_DEMANDE_JOURS * 24 * 3600 * 1000;
    expect(echeanceDemande(t0).getTime()).toBe(attendu);
  });

  it('place l’échéance de règlement à soixante-douze heures', () => {
    const attendu = t0.getTime() + DELAI_REGLEMENT_HEURES * 3600 * 1000;
    expect(echeanceReglement(t0).getTime()).toBe(attendu);
  });
});

describe('état global du partage', () => {
  it('ne voit aucun partage sans contribution', () => {
    expect(etatPartage([])).toBe('aucun');
  });

  it('attend l’accord tant que l’autre parent n’a pas répondu', () => {
    expect(etatPartage([part('awaiting_first_setup'), part('awaiting_partner')])).toBe('attente_accord');
  });

  it('attend les règlements une fois la demande acceptée', () => {
    expect(etatPartage([part('ready_to_charge'), part('ready_to_charge')]))
      .toBe('attente_paiement');
  });

  it('signale une moitié payée quand une seule part est confirmée', () => {
    expect(etatPartage([part('paid'), part('ready_to_charge')])).toBe('moitie_payee');
  });

  it('n’active qu’une fois les deux parts confirmées', () => {
    expect(etatPartage([part('paid'), part('paid')])).toBe('actif');
  });

  it('signale un refus tant qu’aucune part n’a été encaissée', () => {
    expect(etatPartage([part('awaiting_partner'), part('refused')])).toBe('refuse');
  });

  it('réclame une régularisation si une part est payée et l’autre refusée', () => {
    expect(etatPartage([part('paid'), part('refused')])).toBe('remboursement_du');
  });

  it('réclame une régularisation si une part est payée et l’autre expirée', () => {
    expect(etatPartage([part('paid'), part('expired')])).toBe('remboursement_du');
  });

  it('signale un échec de paiement', () => {
    expect(etatPartage([part('ready_to_charge'), part('failed')])).toBe('echec');
  });

  it('traite le paiement intégral payé comme actif', () => {
    expect(etatPartage([part('paid', 1499)])).toBe('actif');
  });

  it('traite le paiement intégral échoué comme un échec', () => {
    expect(etatPartage([part('failed', 1499)])).toBe('echec');
  });

  it('est indifférent à l’ordre des parts — les webhooks arrivent désordonnés', () => {
    const a = etatPartage([part('paid'), part('ready_to_charge')]);
    const b = etatPartage([part('ready_to_charge'), part('paid')]);
    expect(a).toBe(b);
  });

  it('est idempotent : recalculer sur le même jeu ne change rien', () => {
    const parts = [part('paid'), part('paid')];
    expect(etatPartage(parts)).toBe(etatPartage(parts));
  });
});

describe('ouverture de l’abonnement', () => {
  it('reste fermé sans aucune contribution', () => {
    expect(abonnementOuvrable([])).toBe(false);
  });

  it('reste fermé si l’autre parent a seulement accepté', () => {
    expect(abonnementOuvrable([part('paid'), part('ready_to_charge')])).toBe(false);
  });

  it('reste fermé si une part a échoué', () => {
    expect(abonnementOuvrable([part('paid'), part('failed')])).toBe(false);
  });

  it('s’ouvre uniquement sur deux confirmations Stripe', () => {
    expect(abonnementOuvrable([part('paid'), part('paid')])).toBe(true);
  });

  it('s’ouvre sur une contribution intégrale confirmée', () => {
    expect(abonnementOuvrable([part('paid', 1499)])).toBe(true);
  });
});

describe('états terminaux', () => {
  it('reconnaît les états dont on ne repart pas', () => {
    expect(estTerminal('refused')).toBe(true);
    expect(estTerminal('expired')).toBe(true);
    expect(estTerminal('canceled')).toBe(true);
  });

  it('laisse les états vivants ouverts à un paiement', () => {
    expect(estTerminal('ready_to_charge')).toBe(false);
    expect(estTerminal('paid')).toBe(false);
  });
});

describe('disponibilité du partage', () => {
  const initial = process.env.PAYMENT_SPLIT_ENABLED;
  afterEach(() => {
    if (initial === undefined) delete process.env.PAYMENT_SPLIT_ENABLED;
    else process.env.PAYMENT_SPLIT_ENABLED = initial;
  });

  it('reste fermé quand l’indicateur n’est pas levé', () => {
    delete process.env.PAYMENT_SPLIT_ENABLED;
    expect(partageDisponible('year')).toBe(false);
  });

  it('reste fermé sur la formule mensuelle, même indicateur levé', () => {
    process.env.PAYMENT_SPLIT_ENABLED = 'true';
    expect(partageDisponible('month')).toBe(false);
  });

  it('s’ouvre sur la formule annuelle quand l’indicateur est levé', () => {
    process.env.PAYMENT_SPLIT_ENABLED = 'true';
    expect(partageDisponible('year')).toBe(true);
  });

  it('ne se laisse pas ouvrir par une valeur approchante', () => {
    process.env.PAYMENT_SPLIT_ENABLED = '1';
    expect(partageDisponible('year')).toBe(false);
  });
});
