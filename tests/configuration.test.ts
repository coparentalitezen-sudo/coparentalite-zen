import { describe, it, expect } from 'vitest';
import {
  etapes, avancement, prochaineEtape, invitationPrematuree,
  type EtatConfiguration,
} from '../src/lib/configuration';

const vierge: EtatConfiguration = {
  foyerCree: false, nbEnfants: 0, secondParentNomme: false,
  secondParentInscrit: false, rythmeDefini: false,
  zoneScolaireDefinie: false, invitationEnvoyee: false,
};

const complet: EtatConfiguration = {
  foyerCree: true, nbEnfants: 2, secondParentNomme: true,
  secondParentInscrit: true, rythmeDefini: true,
  zoneScolaireDefinie: true, invitationEnvoyee: true,
};

describe('parcours de configuration', () => {
  it('l’invitation est la dernière étape', () => {
    // C'est le point central du parcours : on ne dérange l'autre parent
    // qu'une fois le foyer prêt.
    const liste = etapes(vierge);
    expect(liste[liste.length - 1].cle).toBe('invitation');
  });

  it('les étapes sont numérotées dans l’ordre, sans trou', () => {
    const numeros = etapes(vierge).map((e) => e.numero);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('le rythme vient après avoir nommé le second parent', () => {
    // Le rythme se définit à deux : nommer l'autre parent doit le précéder.
    const liste = etapes(vierge);
    const iParent = liste.findIndex((e) => e.cle === 'second_parent');
    const iRythme = liste.findIndex((e) => e.cle === 'rythme');
    expect(iParent).toBeLessThan(iRythme);
  });

  it('chaque étape explique à quoi elle sert', () => {
    for (const e of etapes(vierge)) {
      expect(e.titre.length).toBeGreaterThan(5);
      expect(e.aQuoiCaSert.length).toBeGreaterThan(20);
      expect(e.href).toMatch(/^\/app\//);
    }
  });
});

describe('avancement', () => {
  it('foyer vierge : rien de fait', () => {
    const a = avancement(vierge);
    expect(a.faites).toBe(0);
    expect(a.pourcentage).toBe(0);
    expect(a.terminee).toBe(false);
  });

  it('foyer complet : terminé', () => {
    const a = avancement(complet);
    expect(a.faites).toBe(a.total);
    expect(a.pourcentage).toBe(100);
    expect(a.terminee).toBe(true);
  });

  it('les vacances ne bloquent pas l’achèvement', () => {
    // Un foyer peut être pleinement fonctionnel sans avoir réparti les vacances
    const sansVacances = { ...complet, zoneScolaireDefinie: false };
    expect(avancement(sansVacances).terminee).toBe(true);
  });

  it('le pourcentage progresse étape par étape', () => {
    const a = avancement({ ...vierge, foyerCree: true, nbEnfants: 1 });
    expect(a.faites).toBe(2);
    expect(a.pourcentage).toBeGreaterThan(0);
    expect(a.pourcentage).toBeLessThan(100);
  });
});

describe('prochaineEtape', () => {
  it('désigne la première étape non faite', () => {
    expect(prochaineEtape(vierge)?.cle).toBe('foyer');
    expect(prochaineEtape({ ...vierge, foyerCree: true })?.cle).toBe('enfants');
  });

  it('ne renvoie rien quand tout est fait', () => {
    expect(prochaineEtape(complet)).toBeNull();
  });

  it('propose les vacances avant l’invitation', () => {
    const presque = {
      ...complet, zoneScolaireDefinie: false, secondParentInscrit: false,
    };
    expect(prochaineEtape(presque)?.cle).toBe('vacances');
  });
});

describe('invitationPrematuree', () => {
  it('alerte si aucun enfant n’est enregistré', () => {
    expect(invitationPrematuree({ ...complet, nbEnfants: 0 }))
      .toMatch(/espace vide/);
  });

  it('alerte si le rythme n’est pas défini', () => {
    expect(invitationPrematuree({ ...complet, rythmeDefini: false }))
      .toMatch(/planning apparaîtrait vide/);
  });

  it('n’alerte pas quand le foyer est prêt', () => {
    expect(invitationPrematuree(complet)).toBeNull();
  });

  it('n’alerte pas pour les vacances, qui restent facultatives', () => {
    expect(invitationPrematuree({ ...complet, zoneScolaireDefinie: false })).toBeNull();
  });

  it('reste un avertissement, jamais un blocage', () => {
    // La fonction renvoie un message, pas un booléen d'interdiction :
    // un parent pressé doit pouvoir inviter tout de suite.
    const message = invitationPrematuree(vierge);
    expect(typeof message).toBe('string');
  });
});
