import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rediger, construirePromptSysteme, estActif, quotaMax, sousQuota, libelleJournal, MODELE,
  type Idee, type AppelRedacteur, type ResultatRedaction,
} from '../src/lib/marketing/redacteur';
import { BANQUE } from '../src/lib/marketing/banque';
import { DESCRIPTIONS_INTERDICTIONS } from '../src/lib/marketing/garde-fous';

const IDEE: Idee = { sujet: BANQUE[0], categorie: 'conseil' };

const SORTIE_VALIDE = {
  titre: 'Le planning qui ne se redemande pas',
  description: 'Un calendrier partagé, lu à l’identique par les deux parents.',
  texte_alt: 'Visuel sobre, texte blanc sur fond bleu marine.',
};

describe('drapeau et quota', () => {
  const cles = ['REDACTEUR_ACTIF', 'REDACTEUR_MAX_PAR_SEMAINE'] as const;
  afterEach(() => { for (const c of cles) delete process.env[c]; });

  it('est inactif par défaut', () => {
    expect(estActif()).toBe(false);
  });

  it('ne s’active que sur la valeur exacte "true"', () => {
    process.env.REDACTEUR_ACTIF = 'oui';
    expect(estActif()).toBe(false);
    process.env.REDACTEUR_ACTIF = 'true';
    expect(estActif()).toBe(true);
  });

  it('vaut 10 par défaut', () => {
    expect(quotaMax()).toBe(10);
  });

  it('respecte une valeur positive fournie', () => {
    process.env.REDACTEUR_MAX_PAR_SEMAINE = '3';
    expect(quotaMax()).toBe(3);
  });

  it('retombe sur 10 pour une valeur invalide ou négative', () => {
    process.env.REDACTEUR_MAX_PAR_SEMAINE = '-5';
    expect(quotaMax()).toBe(10);
    process.env.REDACTEUR_MAX_PAR_SEMAINE = 'abc';
    expect(quotaMax()).toBe(10);
  });

  it('sousQuota compare strictement au plafond', () => {
    process.env.REDACTEUR_MAX_PAR_SEMAINE = '2';
    expect(sousQuota(0)).toBe(true);
    expect(sousQuota(1)).toBe(true);
    expect(sousQuota(2)).toBe(false);
  });
});

describe('prompt système', () => {
  it('porte la voix de marque', () => {
    expect(construirePromptSysteme(null)).toContain('calme et pratique');
  });

  it('reprend chaque interdiction de garde-fous.ts, sans les réécrire', () => {
    const prompt = construirePromptSysteme(null);
    for (const description of DESCRIPTIONS_INTERDICTIONS) {
      expect(prompt).toContain(description);
    }
  });

  it('inclut le bloc d’apprentissages quand il existe', () => {
    expect(construirePromptSysteme('Privilégier le pilier pension.')).toContain('Privilégier le pilier pension.');
  });

  it('n’ajoute rien quand il n’y a pas encore de bloc', () => {
    expect(construirePromptSysteme(null)).not.toContain('Apprentissages');
  });
});

describe('rédaction — chemin heureux', () => {
  it('renvoie la sortie du modèle, validée par le schéma et les garde-fous', async () => {
    const appel: AppelRedacteur = async (params) => {
      expect(params.model).toBe(MODELE);
      return { parsed_output: SORTIE_VALIDE };
    };
    const r = await rediger(IDEE, 0, null, { appel });
    expect(r.source).toBe('llm');
    expect(r.sortie).toEqual(SORTIE_VALIDE);
  });
});

describe('repli — quota hebdomadaire dépassé', () => {
  it('retombe sur le déterministe sans même appeler l’API', async () => {
    const appel = vi.fn<AppelRedacteur>();
    const r = await rediger(IDEE, quotaMax(), null, { appel });
    expect(r).toEqual({ source: 'deterministe', sortie: null, motif: 'quota_depasse' });
    expect(appel).not.toHaveBeenCalled();
  });
});

describe('repli — échec de l’appel API', () => {
  it('retombe sur le déterministe plutôt que de laisser l’exception se propager', async () => {
    const appel: AppelRedacteur = async () => { throw new Error('réseau indisponible'); };
    const r = await rediger(IDEE, 0, null, { appel });
    expect(r.source).toBe('deterministe');
    expect(r.motif).toBe('echec_api');
  });
});

describe('repli — JSON non conforme au schéma', () => {
  it('retombe sur le déterministe quand parsed_output est vide', async () => {
    const appel: AppelRedacteur = async () => ({ parsed_output: null });
    const r = await rediger(IDEE, 0, null, { appel });
    expect(r.source).toBe('deterministe');
    expect(r.motif).toBe('json_invalide');
  });
});

describe('repli — rejet par les garde-fous', () => {
  it('retombe sur le déterministe et rapporte la violation', async () => {
    const appel: AppelRedacteur = async () => ({
      parsed_output: { ...SORTIE_VALIDE, description: 'Avec cette application, plus aucun conflit entre parents.' },
    });
    const r = await rediger(IDEE, 0, null, { appel });
    expect(r.source).toBe('deterministe');
    expect(r.motif).toBe('garde_fous');
    expect(r.violations?.[0].categorie).toBe('promesse_disparition_conflits');
  });

  it('vérifie les trois champs, pas seulement le titre', async () => {
    const appel: AppelRedacteur = async () => ({
      parsed_output: { ...SORTIE_VALIDE, texte_alt: 'Le mauvais parent y est montré du doigt.' },
    });
    const r = await rediger(IDEE, 0, null, { appel });
    expect(r.motif).toBe('garde_fous');
    expect(r.violations?.[0].champ).toBe('texte_alt');
  });
});

describe('traduction vers le journal — journal_redacteur', () => {
  it('un succès devient "succes", sans motif', () => {
    const r: ResultatRedaction = { source: 'llm', sortie: { titre: 't', description: 'd', texte_alt: 'a' } };
    expect(libelleJournal(r)).toEqual({ resultat: 'succes', motif: null });
  });

  it('quota_depasse devient "quota_atteint"', () => {
    const r: ResultatRedaction = { source: 'deterministe', sortie: null, motif: 'quota_depasse' };
    expect(libelleJournal(r)).toEqual({ resultat: 'quota_atteint', motif: null });
  });

  it('echec_api porte le message d’erreur en motif', () => {
    const r: ResultatRedaction = {
      source: 'deterministe', sortie: null, motif: 'echec_api', erreur: 'réseau indisponible',
    };
    expect(libelleJournal(r)).toEqual({ resultat: 'echec_api', motif: 'réseau indisponible' });
  });

  it('json_invalide n’a pas de motif détaillé', () => {
    const r: ResultatRedaction = { source: 'deterministe', sortie: null, motif: 'json_invalide' };
    expect(libelleJournal(r)).toEqual({ resultat: 'json_invalide', motif: null });
  });

  it('garde_fous devient "rejet_garde_fous" et nomme la règle déclenchée', () => {
    const r: ResultatRedaction = {
      source: 'deterministe', sortie: null, motif: 'garde_fous',
      violations: [{
        categorie: 'promesse_disparition_conflits',
        description: 'Promet la disparition ou l’absence totale de conflit.',
        champ: 'description', extrait: '...',
      }],
    };
    const { resultat, motif } = libelleJournal(r);
    expect(resultat).toBe('rejet_garde_fous');
    expect(motif).toContain('promesse_disparition_conflits');
  });
});
