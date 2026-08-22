import { describe, it, expect } from 'vitest';
import {
  resumerConversations, LONGUEUR_MAX_MESSAGE,
  type LignesConversation, type LigneMessage,
} from '../src/lib/actions/messages';

const MOI = 'profil-moi';
const AUTRE = 'profil-autre';

const CONVERSATION: LignesConversation[] = [
  { id: 'c1', sujet: 'Rentrée scolaire', creeeLe: '2026-08-01T10:00:00Z', creeePar: MOI },
];

/** Messages du plus récent au plus ancien, comme les renvoie la requête. */
function messages(...lignes: [string, string, string][]): LigneMessage[] {
  return lignes.map(([auteurId, texte, envoyeLe]) => ({
    conversationId: 'c1', auteurId, texte, envoyeLe,
  }));
}

describe('résumé des conversations', () => {
  it('retient le dernier message envoyé', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [AUTRE, 'Le plus récent', '2026-08-10T12:00:00Z'],
      [MOI, 'Le plus ancien', '2026-08-09T12:00:00Z'],
    ), new Map(), MOI);
    expect(r[0].dernierMessageExtrait).toBe('Le plus récent');
    expect(r[0].dernierMessageLe).toBe('2026-08-10T12:00:00Z');
  });

  it('ne compte jamais ses propres messages comme non lus', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [MOI, 'Un', '2026-08-10T12:00:00Z'],
      [MOI, 'Deux', '2026-08-09T12:00:00Z'],
    ), new Map(), MOI);
    expect(r[0].nonLus).toBe(0);
  });

  it('compte tout ce que l’autre a écrit quand la conversation n’a jamais été ouverte', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [AUTRE, 'Un', '2026-08-10T12:00:00Z'],
      [AUTRE, 'Deux', '2026-08-09T12:00:00Z'],
    ), new Map([['c1', null]]), MOI);
    expect(r[0].nonLus).toBe(2);
  });

  it('ne compte que ce qui suit la dernière lecture', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [AUTRE, 'Après', '2026-08-10T12:00:00Z'],
      [AUTRE, 'Avant', '2026-08-08T12:00:00Z'],
    ), new Map([['c1', '2026-08-09T00:00:00Z']]), MOI);
    expect(r[0].nonLus).toBe(1);
  });

  it('ne compte rien lorsque tout a été lu', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [AUTRE, 'Lu', '2026-08-08T12:00:00Z'],
    ), new Map([['c1', '2026-08-09T00:00:00Z']]), MOI);
    expect(r[0].nonLus).toBe(0);
  });

  it('mêle correctement les deux auteurs', () => {
    const r = resumerConversations(CONVERSATION, messages(
      [MOI, 'Ma réponse', '2026-08-10T14:00:00Z'],
      [AUTRE, 'Sa question', '2026-08-10T12:00:00Z'],
    ), new Map([['c1', null]]), MOI);
    expect(r[0].nonLus).toBe(1);
    expect(r[0].dernierMessageExtrait).toBe('Ma réponse');
  });

  it('rend une conversation sans message sans la faire disparaître', () => {
    const r = resumerConversations(CONVERSATION, [], new Map(), MOI);
    expect(r).toHaveLength(1);
    expect(r[0].dernierMessageExtrait).toBeNull();
    expect(r[0].nonLus).toBe(0);
  });

  it('tronque l’extrait sans tronquer le message', () => {
    const long = 'a'.repeat(300);
    const r = resumerConversations(CONVERSATION, messages(
      [AUTRE, long, '2026-08-10T12:00:00Z'],
    ), new Map(), MOI);
    expect(r[0].dernierMessageExtrait).toHaveLength(120);
  });

  it('borne la longueur d’un message à une valeur raisonnable', () => {
    expect(LONGUEUR_MAX_MESSAGE).toBeGreaterThan(500);
    expect(LONGUEUR_MAX_MESSAGE).toBeLessThanOrEqual(10000);
  });
});
