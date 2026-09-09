/**
 * Vérification manuelle de l'agent rédacteur.
 *
 * Génère trois contenus avec rediger() et les affiche. N'écrit rien dans
 * marketing_contenus ni pin_stats — aucun contenu réel n'est créé ou modifié.
 *
 * Consigne en revanche chaque appel dans journal_redacteur (comme le ferait
 * redigerEtConsigner en production) : c'est la seule façon aujourd'hui de
 * voir un repli se déclencher dans /admin/mesures, l'agent n'étant pas
 * encore branché sur le pipeline réel. Sans SUPABASE_SERVICE_ROLE_KEY, cette
 * consignation échoue silencieusement (comme tout le reste du dispositif
 * marketing sans base) et seul l'affichage en console a lieu.
 *
 * N'exige pas REDACTEUR_ACTIF=true : ce drapeau gouverne l'appel automatique
 * depuis le pipeline (non branché aujourd'hui), pas cette vérification
 * manuelle. Exige en revanche ANTHROPIC_API_KEY — sans elle, rediger()
 * retombe proprement sur le texte déterministe et ce script l'affiche tel
 * quel, ce qui reste une façon valable de vérifier le repli (et de le voir
 * consigné).
 *
 * Lancement : npm run redacteur:test
 */

import { BANQUE } from '../src/lib/marketing/banque';
import { rediger, libelleJournal, type Idee } from '../src/lib/marketing/redacteur';
import type { Categorie } from '../src/lib/marketing/generateur';
// Chemin direct vers supabaseService(), jamais via depot.ts : depot.ts porte
// 'server-only', qui lève une exception dès son chargement en dehors de
// Next.js — y compris sous tsx. supabaseService() n'a pas ce garde et ne
// dépend d'aucune API propre à Next.js.
import { supabaseService } from '../src/lib/supabase/server';

const IDEES: Idee[] = [
  { sujet: BANQUE[0], categorie: 'conseil' as Categorie },
  { sujet: BANQUE[1], categorie: 'quotidien' as Categorie },
  { sujet: BANQUE[2], categorie: 'demonstration' as Categorie },
];

async function consigner(resultat: Parameters<typeof libelleJournal>[0]): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { resultat: code, motif } = libelleJournal(resultat);
  const { error } = await service.from('journal_redacteur').insert({ resultat: code, motif });
  return !error;
}

async function main() {
  console.log(`Agent rédacteur — ${IDEES.length} contenus, aucune écriture dans marketing_contenus.\n`);

  for (const [i, idee] of IDEES.entries()) {
    console.log(`── ${i + 1}/${IDEES.length} — ${idee.sujet.niche} / ${idee.categorie} ` + '─'.repeat(20));
    const resultat = await rediger(idee, i, null);
    const consigne = await consigner(resultat);

    if (resultat.source === 'llm') {
      console.log('source : llm');
      console.log(`titre        : ${resultat.sortie!.titre}`);
      console.log(`description  : ${resultat.sortie!.description}`);
      console.log(`texte_alt    : ${resultat.sortie!.texte_alt}`);
    } else {
      console.log('source : deterministe (repli)');
      console.log(`motif  : ${resultat.motif}`);
      if (resultat.violations) {
        for (const v of resultat.violations) {
          console.log(`  · ${v.champ} — ${v.description} (« ${v.extrait} »)`);
        }
      }
    }
    console.log(consigne ? 'journal : consigné' : 'journal : non consigné (base indisponible)');
    console.log('');
  }
}

main().catch((e) => {
  console.error('Échec du script :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
