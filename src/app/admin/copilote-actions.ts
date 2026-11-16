'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { importerCsv, type SourceImport, type TypeImport } from '@/lib/copilote/import';
import { enregistrerImport, majStatutProposition, type StatutProposition } from '@/lib/copilote/depot';
import { executerHebdo, type ResultatHebdo } from '@/lib/copilote/hebdo';
import { jourIso } from '@/lib/copilote/dates';
import {
  lienValide, majLienProduit, ajouterProduit, programmerContenu, rejeterContenu, ecrireAutoValider,
} from '@/lib/copilote/depot-contenus';
import { genererPostsSemaine } from '@/lib/copilote/posts';
import type { PlateformeBoutique } from '@/lib/copilote/types';

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
    // Un export de ventes vide n'est pas une erreur : il n'y a simplement pas eu de vente.
    if (resultat.type === 'ventes' && resultat.lignesLues === 0 && resultat.erreurs.length <= 1) {
      return { ok: true, message: 'Aucune vente dans ce fichier : rien à ajouter. Importe plutôt tes fiches et leurs vues.' };
    }
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
    base,
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
  return { ok: r.ok, message: r.message + courriel + (r.posts ? ` ${r.posts}` : '') };
}

// ---------- Publications produits ----------

const baseSite = () => process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

export async function actionLienProduit(id: string, url: string): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const propre = url.trim();
  if (propre && !lienValide(propre)) {
    return { ok: false, message: 'Le lien doit commencer par https:// (copie-le depuis la barre d’adresse).' };
  }
  const ok = await majLienProduit(id, propre || null);
  revalidatePath('/admin/boutique');
  return { ok, message: ok ? (propre ? 'Lien enregistré.' : 'Lien retiré.') : 'L’enregistrement a échoué.' };
}

export async function actionAjouterProduit(formulaire: FormData): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const titre = String(formulaire.get('titre') ?? '').trim().slice(0, 200);
  const url = String(formulaire.get('url') ?? '').trim();
  const plateforme = String(formulaire.get('plateforme') ?? 'etsy') as PlateformeBoutique;
  if (!titre) return { ok: false, message: 'Indique le nom du produit.' };
  if (!lienValide(url)) return { ok: false, message: 'Le lien doit commencer par https://.' };
  if (!['etsy', 'payhip', 'gumroad'].includes(plateforme)) return { ok: false, message: 'Plateforme invalide.' };
  const ok = await ajouterProduit({ plateforme, titre, url });
  revalidatePath('/admin/boutique');
  return { ok, message: ok ? `« ${titre} » ajouté.` : 'L’enregistrement a échoué.' };
}

export async function actionProgrammer(id: string): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const r = await programmerContenu(id, baseSite());
  revalidatePath('/admin/contenus');
  return r;
}

export async function actionRetirerContenu(id: string, motif?: string): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const r = await rejeterContenu(id, motif);
  revalidatePath('/admin/contenus');
  return r;
}

export async function actionAutoValider(actif: boolean): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await ecrireAutoValider(actif);
  revalidatePath('/admin/contenus');
  return {
    ok,
    message: !ok ? 'L’enregistrement a échoué.'
      : actif ? 'Auto-validation activée : les prochaines publications partiront sans passer par toi.'
        : 'Auto-validation désactivée : chaque publication attend ta validation.',
  };
}

export async function actionPreparerPosts(): Promise<ResultatAction> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const r = await genererPostsSemaine(new Date(), baseSite());
  revalidatePath('/admin/contenus');
  return { ok: r.produitsAvecLien > 0, message: r.message };
}
