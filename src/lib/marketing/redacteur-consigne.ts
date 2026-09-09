import 'server-only';
import {
  rediger, libelleJournal, type Idee, type ResultatRedaction, type DependancesRedaction,
} from './redacteur';
import { consignerRedaction } from './depot';

/**
 * rediger(), avec une trace dans journal_redacteur.
 *
 * Séparé de redacteur.ts pour la même raison que stats-collecte.ts est séparé
 * de stats.ts : rediger() reste un module pur, sans base de données et sans
 * 'server-only', pour rester importable depuis scripts/redacteur-test.ts (via
 * tsx, hors Next.js) et testable sans rien faker d'autre que l'appel API.
 * Ce module-ci ajoute la seule chose qui a besoin de Supabase : consigner
 * l'issue — via depot.ts, donc avec son garde 'server-only'.
 */
export async function redigerEtConsigner(
  idee: Idee,
  appelsCetteSemaine: number,
  blocLearnings: string | null,
  deps: DependancesRedaction = {},
): Promise<ResultatRedaction> {
  const resultat = await rediger(idee, appelsCetteSemaine, blocLearnings, deps);
  const { resultat: code, motif } = libelleJournal(resultat);
  await consignerRedaction(code, motif);
  return resultat;
}
