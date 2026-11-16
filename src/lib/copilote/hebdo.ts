import 'server-only';
import { configEmail, envoyerEmail } from '@/lib/email';
import { administrateurs } from '@/lib/marketing/administration';
import { lireMesures } from '@/lib/marketing/depot';
import { performances, meilleuresAccroches } from '@/lib/marketing/mesures';
import { analyser } from './analyse';
import { proposer } from './propositions';
import { construireRapport, rapportTexte, rapportHtml, objetCourriel, type ContenuPerformant } from './rapport';
import { ajouterJours, cleSemaine, jourIso, periodeAnalysee } from './dates';
import {
  lireDonneesBoutique, enregistrerPropositions, enregistrerRapport, marquerEnvoi,
  derniersImportsVentes, journaliser, lireRapport,
} from './depot';
import { clicsBoutique } from './depot-contenus';
import { genererPostsSemaine } from './posts';

/**
 * La boucle hebdomadaire : collecter → analyser → proposer → rapporter.
 *
 * Exécutée le lundi matin par la tâche planifiée, et à la demande depuis
 * /admin/rapport après un import. Rejouable : relancer la même semaine met à
 * jour le rapport et les propositions encore en attente, sans doublon et sans
 * toucher à une proposition déjà décidée.
 *
 * Le courriel n'est envoyé qu'une fois par semaine, sauf demande explicite :
 * recalculer après un import ne doit pas remplir la boîte de réception.
 */

/** Profondeur d'historique lue : un an suffit à toutes les comparaisons. */
const HISTORIQUE_JOURS = 365;

export interface ResultatHebdo {
  ok: boolean;
  semaine: string;
  message: string;
  idees: number;
  ameliorations: number;
  ecartees: number;
  courriel: 'envoye' | 'deja_envoye' | 'non_demande' | 'non_configure' | 'echec';
  posts?: string;
}

/** Le destinataire : COPILOTE_EMAIL, sinon le premier administrateur. */
function destinataire(): string | null {
  const explicite = process.env.COPILOTE_EMAIL?.trim();
  if (explicite && explicite.includes('@')) return explicite;
  return administrateurs()[0] ?? null;
}

/** Les contenus marketing les plus cliqués — vide si la mesure est indisponible. */
async function contenusPerformants(): Promise<ContenuPerformant[]> {
  try {
    const d = await lireMesures();
    if (!d) return [];
    const lignes = performances(d.contenus, d.visites, d.originesInscrits, d.releves);
    return meilleuresAccroches(lignes).map((l) => ({
      accroche: l.accroche, clics: l.clics, inscriptions: l.inscriptions,
    }));
  } catch (e) {
    console.error('[copilote] mesures marketing', e);
    return [];
  }
}

export async function executerHebdo(options: {
  maintenant?: Date;
  /** 'si_pas_encore' : le passage du lundi. 'forcer' : bouton « Renvoyer ». */
  courriel: 'non' | 'si_pas_encore' | 'forcer';
  lienAdmin: string;
  /** Adresse publique du site, pour les liens et visuels des publications produits. */
  base?: string;
}): Promise<ResultatHebdo> {
  const maintenant = options.maintenant ?? new Date();
  const aujourdhui = jourIso(maintenant);
  const { fin } = periodeAnalysee(maintenant);
  const semaine = cleSemaine(fin);
  const resultat: ResultatHebdo = {
    ok: false, semaine, message: '', idees: 0, ameliorations: 0, ecartees: 0, courriel: 'non_demande',
  };

  const donnees = await lireDonneesBoutique(ajouterJours(fin, -HISTORIQUE_JOURS));
  if (!donnees) {
    resultat.message = 'Base de données indisponible : rien n’a été calculé.';
    await journaliser(aujourdhui, { ...resultat });
    return resultat;
  }

  const analyse = analyser({ ...donnees, fin });
  const propositions = proposer(analyse, aujourdhui);
  // Les publications produits de la semaine qui commence, puis les clics de
  // la semaine écoulée vers les fiches.
  const base = options.base ?? new URL(options.lienAdmin).origin;
  const posts = await genererPostsSemaine(maintenant, base).catch((e) => {
    console.error('[copilote] publications produits', e);
    return null;
  });
  resultat.posts = posts?.message;
  const [contenus, imports, clics] = await Promise.all([
    contenusPerformants(), derniersImportsVentes(), clicsBoutique(ajouterJours(fin, -6)),
  ]);
  const rapport = construireRapport({
    semaine, analyse, propositions, contenus, derniersImports: imports, aujourdhui,
    boutique: posts ? { produitsAvecLien: posts.produitsAvecLien, clics } : undefined,
  });
  const texte = rapportTexte(rapport);

  const [okP, okR] = await Promise.all([
    enregistrerPropositions(semaine, propositions),
    enregistrerRapport(rapport, texte),
  ]);
  resultat.idees = propositions.idees.length;
  resultat.ameliorations = propositions.ameliorations.length;
  resultat.ecartees = propositions.ecartees.length;
  if (propositions.ecartees.length) {
    console.warn('[copilote] propositions écartées par les garde-fous', propositions.ecartees);
  }
  if (!okP || !okR) {
    resultat.message = 'Le calcul a abouti mais l’enregistrement a échoué.';
    await journaliser(aujourdhui, { ...resultat });
    return resultat;
  }

  // ---------- Courriel ----------
  const dejaEnvoye = options.courriel === 'si_pas_encore'
    && Boolean((await lireRapport(semaine))?.envoyeLe);
  const envoyer = options.courriel === 'forcer'
    || (options.courriel === 'si_pas_encore' && !dejaEnvoye);
  if (dejaEnvoye) resultat.courriel = 'deja_envoye';
  if (envoyer) {
    const config = configEmail();
    const a = destinataire();
    if (!config || !a) {
      resultat.courriel = 'non_configure';
      await marquerEnvoi(semaine, 'Courriel non configuré (RESEND_API_KEY ou destinataire manquant).');
    } else {
      const motif = await envoyerEmail(config, a, objetCourriel(rapport),
        rapportHtml(rapport, options.lienAdmin), `${texte}\n\nValider : ${options.lienAdmin}`);
      resultat.courriel = motif === null ? 'envoye' : 'echec';
      await marquerEnvoi(semaine, motif);
    }
  }

  resultat.ok = true;
  resultat.message = `Semaine ${semaine} calculée : ${resultat.idees} idée(s), `
    + `${resultat.ameliorations} amélioration(s).`;
  await journaliser(aujourdhui, { ...resultat });
  return resultat;
}
