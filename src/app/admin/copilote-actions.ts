'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { importerCsv, type SourceImport, type TypeImport } from '@/lib/copilote/import';
import { enregistrerImport, majStatutProposition, type StatutProposition } from '@/lib/copilote/depot';
import { executerHebdo, type ResultatHebdo } from '@/lib/copilote/hebdo';
import { jourIso } from '@/lib/copilote/dates';

/**
 * Actions du copilote business.
 *
 * Le contrôle d'administrateur est refait à chaque appel : une action serveur
 * est joignable directement, indépendamment de l'écran qui la propose.
 */
async function exigerAdministrateur(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return estAdministrateur(user?.email);
}

/** Au-delà, un export de ventes n'est probablement pas un export de ventes. */
const TAILLE_MAX = 4 * 1024 * 1024;

const SOURCES: (SourceImport | 'auto')[] = ['auto', 'etsy', 'payhip', 'gumroad', 'generique'];
const TYPES: (TypeImport | 'auto')[] = ['auto', 'ventes', 'catalogue', 'vues'];

export interface ResultatAction {
  ok: boolean;
  message: string;
  details?: string[];
}

export async function actionImporter(formulaire: FormData): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };

  const fichier = formulaire.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, message: 'Choisis un fichier CSV.' };
  }
  if (fichier.size > TAILLE_MAX) {
    return { ok: false, message: 'Fichier trop lourd (4 Mo au plus). Exporte une période plus courte.' };
  }
  const source = String(formulaire.get('source') ?? 'auto') as SourceImport | 'auto';
  const type = String(formulaire.get('type') ?? 'auto') as TypeImport | 'auto';
  if (!SOURCES.includes(source) || !TYPES.includes(type)) {
    return { ok: false, message: 'Choix de plateforme ou de type invalide.' };
  }

  const resultat = importerCsv(await fichier.text(), {
    source: source === 'auto' ? undefined : source,
    type: type === 'auto' ? undefined : type,
    aujourdhui: jourIso(new Date()),
  });
  const lues = resultat.ventes.length + resultat.catalogue.length + resultat.vues.length;
  if (lues === 0) {
    return { ok: false, message: 'Aucune ligne exploitable dans ce fichier.', details: resultat.erreurs };
  }

  const ecrit = await enregistrerImport(resultat, fichier.name);
  revalidatePath('/admin/boutique');
  const nature = { ventes: 'vente', catalogue: 'fiche', vues: 'relevé de vues' }[resultat.type];
  const deja = lues - ecrit.ajoutees;
  return {
    ok: ecrit.ok,
    message: ecrit.ok
      ? `${resultat.source} · ${lues} ${nature}(s) lue(s), ${ecrit.ajoutees} ajoutée(s) ou mise(s) à jour`
        + (resultat.type === 'ventes' && deja > 0 ? `, ${deja} déjà connue(s).` : '.')
      : ecrit.message ?? 'L’enregistrement a échoué.',
    details: resultat.erreurs,
  };
}

const STATUTS: StatutProposition[] = ['en_attente', 'validee', 'rejetee', 'realisee'];

export async function actionStatutProposition(
  id: string, statut: StatutProposition, motif?: string,
): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  if (!STATUTS.includes(statut)) return { ok: false, message: 'Statut invalide.' };
  const ok = await majStatutProposition(id, statut, motif);
  revalidatePath('/admin/propositions');
  return { ok, message: ok ? 'Enregistré.' : 'L’enregistrement n’a pas abouti.' };
}

export async function actionRecalculer(envoyer: boolean): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const r: ResultatHebdo = await executerHebdo({
    courriel: envoyer ? 'forcer' : 'non',
    lienAdmin: new URL('/admin/propositions', base).toString(),
  });
  revalidatePath('/admin/rapport');
  revalidatePath('/admin/propositions');
  const courriel = {
    envoye: ' Courriel envoyé.',
    deja_envoye: '',
    non_demande: '',
    non_configure: ' Courriel non envoyé : RESEND_API_KEY ou destinataire manquant.',
    echec: ' Le courriel n’est pas parti (voir le rapport).',
  }[r.courriel];
  return { ok: r.ok, message: r.message + courriel };
}
