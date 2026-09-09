/**
 * Vérification manuelle de l'agent rédacteur — n'écrit rien en base.
 *
 * Génère trois contenus avec rediger() et les affiche. Utile pour le premier
 * appel réel avant de faire confiance à l'agent : la forme exacte des sorties
 * n'a jamais été vérifiée contre l'API Anthropic en conditions réelles.
 *
 * N'exige pas REDACTEUR_ACTIF=true : ce drapeau gouverne l'appel automatique
 * depuis le pipeline (non branché aujourd'hui), pas cette vérification
 * manuelle. Exige en revanche ANTHROPIC_API_KEY — sans elle, rediger()
 * retombe proprement sur le texte déterministe et ce script l'affiche tel
 * quel, ce qui reste une façon valable de vérifier le repli.
 *
 * Lancement : npm run redacteur:test
 */

import { BANQUE } from '../src/lib/marketing/banque';
import { rediger, type Idee } from '../src/lib/marketing/redacteur';
import type { Categorie } from '../src/lib/marketing/generateur';

const IDEES: Idee[] = [
  { sujet: BANQUE[0], categorie: 'conseil' as Categorie },
  { sujet: BANQUE[1], categorie: 'quotidien' as Categorie },
  { sujet: BANQUE[2], categorie: 'demonstration' as Categorie },
];

async function main() {
  console.log(`Agent rédacteur — ${IDEES.length} contenus, aucune écriture en base.\n`);

  for (const [i, idee] of IDEES.entries()) {
    console.log(`── ${i + 1}/${IDEES.length} — ${idee.sujet.niche} / ${idee.categorie} ` + '─'.repeat(20));
    const resultat = await rediger(idee, i, null);

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
    console.log('');
  }
}

main().catch((e) => {
  console.error('Échec du script :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
