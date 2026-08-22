import { describe, it, expect } from 'vitest';
import { TYPES_DOCUMENT, libelleType } from '../src/lib/actions/documents';

/**
 * Les codes de type doivent correspondre exactement à l'énumération doc_kind
 * de la base. Un code inventé ferait échouer l'insertion à l'exécution, sans
 * que rien ne le signale à la compilation.
 */
const DOC_KIND_EN_BASE = [
  'receipt', 'invoice', 'prescription', 'medical_certificate', 'school',
  'attestation', 'insurance', 'travel', 'agreement', 'authorization',
  'identity', 'other',
];

describe('types de document', () => {
  it('couvre exactement l’énumération de la base', () => {
    const codes = TYPES_DOCUMENT.map((t) => t.code);
    expect([...codes].sort()).toEqual([...DOC_KIND_EN_BASE].sort());
  });

  it('propose l’ordonnance en tête : c’est le cas d’usage courant', () => {
    expect(TYPES_DOCUMENT[0].code).toBe('prescription');
  });

  it('donne un libellé français à chaque code', () => {
    for (const t of TYPES_DOCUMENT) {
      expect(t.libelle.length).toBeGreaterThan(2);
      expect(t.libelle).not.toBe(t.code);
    }
  });

  it('retombe sur « Autre » pour un code inconnu', () => {
    expect(libelleType('inconnu')).toBe('Autre');
    expect(libelleType('prescription')).toBe('Ordonnance');
  });
});
