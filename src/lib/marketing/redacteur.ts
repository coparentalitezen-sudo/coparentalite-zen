import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MARQUE, type Sujet } from './banque';
import type { Categorie } from './generateur';
import { validerTexte, DESCRIPTIONS_INTERDICTIONS, type Violation } from './garde-fous';

/**
 * Agent rédacteur — se greffe sur genererSemaine, ne le remplace pas.
 *
 * banque.ts choisit toujours l'idée : la niche, la catégorie et l'angle
 * viennent du sujet tiré par sujetsDeLaSemaine, jamais du modèle de langage.
 * Ce module ne fait qu'une chose : mettre cette idée en mots, sous une forme
 * courte (titre, description, texte alternatif) et strictement typée.
 *
 * PAS DE 'server-only' ICI, DÉLIBÉRÉMENT
 * Contrairement à depot.ts ou stats-collecte.ts (qui touchent Supabase et ne
 * doivent jamais être importés depuis un composant client), ce module est un
 * client d'API au même titre que meta.ts ou pinterest-api.ts — aucun des deux
 * n'a ce garde non plus. C'est aussi ce qui permet à scripts/redacteur-test.ts
 * de l'importer directement, sans lancer Next.js.
 *
 * TOUT REPLI EST SILENCIEUX, PAR CONCEPTION
 * Échec d'appel, JSON invalide, rejet par les garde-fous, quota dépassé :
 * les quatre cas renvoient la même forme ({ source: 'deterministe', sortie:
 * null }) et ne lancent jamais d'exception. C'est pour cela qu'un seul bloc
 * catch générique suffit ici (contrairement à la règle habituelle de
 * distinguer les erreurs retenables des définitives) : peu importe pourquoi
 * l'appel a échoué, la décision est toujours la même — retomber sur le texte
 * déterministe de genererSemaine pour cette même idée, jamais interrompre la
 * semaine entière pour un seul contenu.
 *
 * RIEN N'EST ENCORE BRANCHÉ
 * genererSemaine et enregistrerSemaine ignorent ce module. Il est exposé
 * derrière REDACTEUR_ACTIF (faux par défaut) pour que l'activer plus tard soit
 * une décision explicite, pas un effet de bord de ce commit.
 */

export const MODELE = 'claude-sonnet-5';

const SortieRedacteurSchema = z.object({
  titre: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  texte_alt: z.string().min(1).max(300),
});
export type SortieRedacteur = z.infer<typeof SortieRedacteurSchema>;

export interface Idee {
  sujet: Sujet;
  categorie: Categorie;
}

export type MotifRepli = 'quota_depasse' | 'echec_api' | 'json_invalide' | 'garde_fous';

export interface ResultatRedaction {
  source: 'llm' | 'deterministe';
  sortie: SortieRedacteur | null;
  motif?: MotifRepli;
  violations?: Violation[];
  /** Message d'erreur expurgé, uniquement renseigné pour motif === 'echec_api'. */
  erreur?: string;
}

/** L'agent est-il autorisé à s'exécuter ? Faux tant que personne ne l'active explicitement. */
export function estActif(): boolean {
  return process.env.REDACTEUR_ACTIF === 'true';
}

/** Plafond hebdomadaire d'appels payants. 10 par défaut, jamais une valeur invalide ou négative. */
export function quotaMax(): number {
  const brut = Number(process.env.REDACTEUR_MAX_PAR_SEMAINE);
  return Number.isFinite(brut) && brut > 0 ? Math.floor(brut) : 10;
}

export function sousQuota(appelsCetteSemaine: number): boolean {
  return appelsCetteSemaine < quotaMax();
}

/**
 * Prompt système : voix de marque + interdictions (source unique :
 * garde-fous.ts, jamais réécrites ici) + derniers apprentissages Pinterest.
 *
 * LA VOIX DE MARQUE EST CITÉE, PAS PARAPHRASÉE
 * Les deux premières phrases sont recopiées mot pour mot du commentaire en
 * tête de banque.ts — un commentaire TypeScript n'étant pas une valeur
 * importable, il n'y a pas moyen de les référencer autrement que de les
 * reproduire ici ; si ce commentaire change dans banque.ts, penser à
 * reporter le changement ici aussi. La troisième vient en revanche de
 * MARQUE[1].corps, une valeur réellement exportée : elle est importée telle
 * quelle, sans copie, pour ne jamais pouvoir diverger de la source.
 */
export function construirePromptSysteme(blocLearnings: string | null): string {
  const interdictions = DESCRIPTIONS_INTERDICTIONS.map((d) => `- ${d}`).join('\n');
  const lignes = [
    'Tu rédiges pour Coparentalité Zen, application d’organisation pour parents séparés.',
    '',
    'Voix de marque (citations de banque.ts, à respecter dans l’esprit) :',
    '« Le ton est calme et pratique. Rien ici ne désigne un parent fautif : les contenus '
      + 'qui opposent les parents font de l’audience et détruisent la confiance des deux '
      + 'côtés. »',
    '« Aucune statistique, aucun témoignage : on n’invente pas de chiffres, et un '
      + 'témoignage fabriqué se retournerait contre l’application le jour où quelqu’un le '
      + 'vérifierait. »',
    `« ${MARQUE[1].corps} »`,
    '',
    'Format attendu :',
    '- titre : commence par la requête telle que les gens la tapent dans la recherche '
      + 'Pinterest (ex. « calendrier garde alternée », « vacances scolaires parents '
      + 'séparés ») — le mot-clé d’abord, l’angle éditorial ensuite, jamais l’inverse.',
    '- description : les 60 premiers caractères doivent se suffire à eux-mêmes et porter '
      + 'l’essentiel — Pinterest tronque au-delà, le reste peut être perdu par le lecteur.',
    '',
    'Interdictions strictes — le texte sera aussi vérifié par du code après coup, mais ne '
      + 'les enfreins pas :',
    interdictions,
  ];
  if (blocLearnings) {
    lignes.push('', 'Apprentissages de la boucle Pinterest :', blocLearnings);
  }
  return lignes.join('\n');
}

function promptUtilisateur(idee: Idee): string {
  const { sujet, categorie } = idee;
  return [
    `Angle : ${sujet.angle}`,
    `Problème vécu par le parent : ${sujet.probleme}`,
    `Ce qu’il cherche à faire : ${sujet.intention}`,
    `Catégorie de contenu à produire : ${categorie}`,
    `Ce que l’application apporte, une fois le problème compris : ${sujet.apport}`,
    '',
    'Rédige un titre, une description et un texte alternatif d’image pour ce contenu.',
  ].join('\n');
}

/**
 * Le seul geste réseau de ce module, isolé pour les tests.
 *
 * Une interface étroite plutôt que le client Anthropic complet : ce dernier
 * expose des dizaines de méthodes (batches, fichiers, comptage de jetons...)
 * qu'un faux client de test n'a aucune raison d'implémenter pour vérifier un
 * repli. `Anthropic.APIError` reste directement utilisable dans les tests,
 * lui, puisque c'est une classe exportée par le SDK et non une forme de
 * réponse.
 */
export type AppelRedacteur = (params: {
  model: string;
  max_tokens: number;
  output_config: { effort: 'low'; format: ReturnType<typeof zodOutputFormat<typeof SortieRedacteurSchema>> };
  system: string;
  messages: { role: 'user'; content: string }[];
}) => Promise<{ parsed_output: SortieRedacteur | null }>;

async function appelParDefaut(
  params: Parameters<AppelRedacteur>[0],
): ReturnType<AppelRedacteur> {
  const client = new Anthropic();
  return client.messages.parse(params);
}

export interface DependancesRedaction {
  /** Appel injectable pour les tests — un faux appel évite tout accès réseau réel. */
  appel?: AppelRedacteur;
}

/**
 * Rédige le texte d'un contenu à partir d'une idée choisie par banque.ts.
 *
 * Ne lance jamais d'exception : toute défaillance renvoie
 * { source: 'deterministe', sortie: null } plutôt que de se propager, pour
 * que l'appelant retombe sur le texte de genererSemaine sans rien
 * intercepter lui-même.
 */
export async function rediger(
  idee: Idee,
  appelsCetteSemaine: number,
  blocLearnings: string | null,
  deps: DependancesRedaction = {},
): Promise<ResultatRedaction> {
  if (!sousQuota(appelsCetteSemaine)) {
    console.info(`[redacteur] quota hebdomadaire atteint (${appelsCetteSemaine}/${quotaMax()}) — repli déterministe.`);
    return { source: 'deterministe', sortie: null, motif: 'quota_depasse' };
  }

  console.info(`[redacteur] appel ${appelsCetteSemaine + 1}/${quotaMax()}`);

  let sortieBrute: SortieRedacteur | null;
  try {
    const appel = deps.appel ?? appelParDefaut;
    const reponse = await appel({
      model: MODELE,
      max_tokens: 1024,
      output_config: { effort: 'low', format: zodOutputFormat(SortieRedacteurSchema) },
      system: construirePromptSysteme(blocLearnings),
      messages: [{ role: 'user', content: promptUtilisateur(idee) }],
    });
    sortieBrute = reponse.parsed_output;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.info(`[redacteur] échec d’appel API — repli déterministe : ${message}`);
    return { source: 'deterministe', sortie: null, motif: 'echec_api', erreur: message.slice(0, 300) };
  }

  if (!sortieBrute) {
    console.info('[redacteur] réponse non conforme au schéma — repli déterministe.');
    return { source: 'deterministe', sortie: null, motif: 'json_invalide' };
  }

  const violations = [
    ...validerTexte(sortieBrute.titre, 'titre'),
    ...validerTexte(sortieBrute.description, 'description'),
    ...validerTexte(sortieBrute.texte_alt, 'texte_alt'),
  ];
  if (violations.length > 0) {
    console.info(
      `[redacteur] rejeté par les garde-fous (${violations.map((v) => v.categorie).join(', ')}) — repli déterministe.`,
    );
    return { source: 'deterministe', sortie: null, motif: 'garde_fous', violations };
  }

  return { source: 'llm', sortie: sortieBrute };
}

/** Les cinq issues admises par journal_redacteur (migration 00047). */
export type ResultatJournal = 'succes' | 'echec_api' | 'json_invalide' | 'rejet_garde_fous' | 'quota_atteint';

/**
 * Traduit un résultat de rediger() en ligne de journal — pure, sans base de
 * données, pour rester utilisable aussi bien par redacteur-consigne.ts
 * (le futur point d'intégration réel) que par scripts/redacteur-test.ts
 * (qui n'importe jamais un module 'server-only').
 */
export function libelleJournal(resultat: ResultatRedaction): { resultat: ResultatJournal; motif: string | null } {
  if (resultat.source === 'llm') return { resultat: 'succes', motif: null };

  switch (resultat.motif) {
    case 'quota_depasse':
      return { resultat: 'quota_atteint', motif: null };
    case 'echec_api':
      return { resultat: 'echec_api', motif: resultat.erreur ?? null };
    case 'json_invalide':
      return { resultat: 'json_invalide', motif: null };
    case 'garde_fous':
      return {
        resultat: 'rejet_garde_fous',
        motif: (resultat.violations ?? [])
          .map((v) => `${v.categorie} — ${v.description}`)
          .join(' ; ') || null,
      };
    default:
      // Ne devrait pas arriver : source déterministe sans motif reconnu.
      return { resultat: 'echec_api', motif: 'motif de repli non reconnu' };
  }
}
