import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import type { PlateformeBoutique, Vente, ProduitCatalogue, ReleveVues } from './types';
import type { ResultatImport, SourceImport, TypeImport } from './import';
import type { Idee, Amelioration, Propositions } from './propositions';
import type { Rapport } from './rapport';

/**
 * Accès aux données du copilote.
 *
 * Toujours par la clé de service : les tables sont fermées par RLS sans
 * politique. Le contrôle d'accès se fait en amont — page ou action serveur
 * qui vérifie l'administrateur, route de tâche qui vérifie CRON_SECRET.
 */

/** PostgREST plafonne une lecture à 1 000 lignes : on pagine. */
const PAGE = 1000;
/** Taille des lots d'écriture, pour rester loin des limites de requête. */
const LOT = 500;

export type StatutProposition = 'en_attente' | 'validee' | 'rejetee' | 'realisee';

export interface PropositionEnregistree {
  id: string;
  semaine: string;
  type: 'idee' | 'amelioration';
  cle: string;
  rang: number;
  titre: string;
  contenu: Idee | Amelioration;
  statut: StatutProposition;
  motif: string | null;
}

export interface ImportEnregistre {
  id: string;
  plateforme: SourceImport;
  type: TypeImport;
  fichier: string | null;
  lignesLues: number;
  ajoutees: number;
  ignorees: number;
  erreurs: string[];
  creeLe: string;
}

// ---------- Imports ----------

/**
 * Enregistre un import complet. Rend le nombre de lignes réellement ajoutées :
 * réimporter un fichier déjà vu en ajoute zéro, et l'écran le dit.
 */
export async function enregistrerImport(
  resultat: ResultatImport, fichier: string,
): Promise<{ ok: boolean; ajoutees: number; message?: string }> {
  const service = supabaseService();
  if (!service) return { ok: false, ajoutees: 0, message: 'Service indisponible.' };

  const { data: trace, error: e1 } = await service.from('boutique_imports').insert({
    plateforme: resultat.source,
    type: resultat.type,
    fichier: fichier.slice(0, 200),
    lignes_lues: resultat.lignesLues,
    ignorees: resultat.ignorees,
    erreurs: resultat.erreurs,
  }).select('id').single();
  if (e1 || !trace) {
    console.error('[copilote] import', e1);
    return { ok: false, ajoutees: 0, message: 'La trace d’import n’a pas pu être enregistrée.' };
  }

  let ajoutees = 0;
  let echec: string | undefined;

  if (resultat.type === 'ventes') {
    for (let i = 0; i < resultat.ventes.length; i += LOT) {
      const lot = resultat.ventes.slice(i, i + LOT).map((v) => ({
        plateforme: v.plateforme, commande: v.commande, ligne: v.ligne, produit_ref: v.produitRef,
        titre: v.titre, quantite: v.quantite, montant_centimes: v.montantCentimes,
        devise: v.devise, vendu_le: v.venduLe, import_id: trace.id,
      }));
      // « ignoreDuplicates » : une vente déjà connue n'est ni doublée ni
      // modifiée, et seules les nouvelles sont renvoyées — d'où le décompte.
      const { data, error } = await service.from('boutique_ventes')
        .upsert(lot, { onConflict: 'plateforme,commande,ligne', ignoreDuplicates: true })
        .select('id');
      if (error) { echec = error.message; break; }
      ajoutees += data?.length ?? 0;
    }
  } else if (resultat.type === 'catalogue') {
    // Une fiche reflète l'état en ligne : la plus récente remplace l'ancienne.
    const lot = dedoublonner(resultat.catalogue, (c) => `${c.plateforme}|${c.reference}`).map((c) => ({
      plateforme: c.plateforme, reference: c.reference, titre: c.titre, prix_centimes: c.prixCentimes,
      devise: c.devise, tags: c.tags, description: c.description, updated_at: new Date().toISOString(),
    }));
    const { data, error } = await service.from('boutique_produits')
      .upsert(lot, { onConflict: 'plateforme,reference' }).select('id');
    if (error) echec = error.message; else ajoutees = data?.length ?? 0;
  } else {
    const lot = dedoublonner(resultat.vues, (v) => `${v.plateforme}|${v.produitRef}|${v.releveLe}`).map((v) => ({
      plateforme: v.plateforme, produit_ref: v.produitRef, titre: v.titre, vues: v.vues, releve_le: v.releveLe,
    }));
    const { data, error } = await service.from('boutique_vues')
      .upsert(lot, { onConflict: 'plateforme,produit_ref,releve_le' }).select('id');
    if (error) echec = error.message; else ajoutees = data?.length ?? 0;
  }

  await service.from('boutique_imports').update({ ajoutees }).eq('id', trace.id);
  if (echec) {
    console.error('[copilote] écriture', echec);
    return { ok: false, ajoutees, message: `Écriture interrompue : ${echec}` };
  }
  return { ok: true, ajoutees };
}

/** Une même clé deux fois dans un lot ferait échouer tout l'upsert. */
function dedoublonner<T>(liste: T[], cle: (x: T) => string): T[] {
  return [...new Map(liste.map((x) => [cle(x), x])).values()];
}

export async function lireImports(limite = 10): Promise<ImportEnregistre[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('boutique_imports')
    .select('id, plateforme, type, fichier, lignes_lues, ajoutees, ignorees, erreurs, created_at')
    .order('created_at', { ascending: false }).limit(limite);
  return (data ?? []).map((d) => ({
    id: d.id, plateforme: d.plateforme, type: d.type, fichier: d.fichier,
    lignesLues: d.lignes_lues, ajoutees: d.ajoutees, ignorees: d.ignorees,
    erreurs: (d.erreurs as string[]) ?? [], creeLe: d.created_at,
  }));
}

/**
 * Date du dernier import de ventes, par plateforme.
 *
 * Deux sources, la plus récente l'emporte : la trace d'import (un fichier
 * déposé sans vente nouvelle compte quand même — il n'y avait simplement rien
 * de neuf), et la date d'ajout des ventes, seule à connaître la plateforme
 * des lignes d'un fichier au format générique.
 */
export async function derniersImportsVentes(): Promise<Partial<Record<PlateformeBoutique, string>>> {
  const service = supabaseService();
  if (!service) return {};
  const resultat: Partial<Record<PlateformeBoutique, string>> = {};
  for (const p of ['etsy', 'payhip', 'gumroad'] as PlateformeBoutique[]) {
    const [trace, vente] = await Promise.all([
      service.from('boutique_imports').select('created_at')
        .eq('type', 'ventes').eq('plateforme', p).order('created_at', { ascending: false }).limit(1),
      service.from('boutique_ventes').select('created_at')
        .eq('plateforme', p).order('created_at', { ascending: false }).limit(1),
    ]);
    const dates = [trace.data?.[0]?.created_at, vente.data?.[0]?.created_at]
      .filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
    if (dates.length) resultat[p] = dates[dates.length - 1];
  }
  return resultat;
}

// ---------- Lectures pour l'analyse ----------

async function toutLire<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await requete(debut, debut + PAGE - 1);
    if (error) { console.error('[copilote] lecture', error); return null; }
    lignes.push(...(data ?? []));
    if (!data || data.length < PAGE) return lignes;
  }
}

export async function lireDonneesBoutique(depuis: string): Promise<{
  ventes: Vente[]; catalogue: ProduitCatalogue[]; vues: ReleveVues[];
} | null> {
  const service = supabaseService();
  if (!service) return null;

  const [ventes, catalogue, vues] = await Promise.all([
    toutLire((d, f) => service.from('boutique_ventes')
      .select('plateforme, commande, ligne, produit_ref, titre, quantite, montant_centimes, devise, vendu_le')
      .gte('vendu_le', depuis).order('vendu_le').order('id').range(d, f)),
    toutLire((d, f) => service.from('boutique_produits')
      .select('plateforme, reference, titre, prix_centimes, devise, tags, description')
      .order('id').range(d, f)),
    toutLire((d, f) => service.from('boutique_vues')
      .select('plateforme, produit_ref, titre, vues, releve_le')
      .gte('releve_le', depuis).order('id').range(d, f)),
  ]);
  if (!ventes || !catalogue || !vues) return null;

  return {
    ventes: ventes.map((v) => ({
      plateforme: v.plateforme, commande: v.commande, ligne: v.ligne, produitRef: v.produit_ref,
      titre: v.titre, quantite: v.quantite, montantCentimes: v.montant_centimes,
      devise: v.devise, venduLe: v.vendu_le,
    })),
    catalogue: catalogue.map((c) => ({
      plateforme: c.plateforme, reference: c.reference, titre: c.titre,
      prixCentimes: c.prix_centimes, devise: c.devise, tags: c.tags ?? [], description: c.description ?? '',
    })),
    vues: vues.map((v) => ({
      plateforme: v.plateforme, produitRef: v.produit_ref, titre: v.titre,
      vues: v.vues, releveLe: v.releve_le,
    })),
  };
}

// ---------- Propositions ----------

/**
 * Enregistre les propositions de la semaine.
 *
 * Rejouable : une proposition encore en attente est mise à jour avec les
 * chiffres du moment ; une proposition déjà décidée (validée, rejetée,
 * réalisée) n'est jamais touchée. Les propositions en attente qui ne figurent
 * plus dans le nouveau calcul sont retirées — elles ne sont plus justifiées.
 */
export async function enregistrerPropositions(semaine: string, p: Propositions): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;

  const toutes = [
    ...p.idees.map((x, rang) => ({ x, rang })),
    ...p.ameliorations.map((x, rang) => ({ x, rang })),
  ];
  const { data: existantes, error: e1 } = await service.from('copilote_propositions')
    .select('cle, statut').eq('semaine', semaine);
  if (e1) { console.error('[copilote] propositions', e1); return false; }
  const decidees = new Set((existantes ?? []).filter((e) => e.statut !== 'en_attente').map((e) => e.cle));

  const aEcrire = toutes.filter(({ x }) => !decidees.has(x.cle)).map(({ x, rang }) => ({
    semaine, type: x.type, cle: x.cle, rang, titre: x.titre, contenu: x,
    statut: 'en_attente', updated_at: new Date().toISOString(),
  }));
  if (aEcrire.length) {
    const { error } = await service.from('copilote_propositions')
      .upsert(aEcrire, { onConflict: 'semaine,cle' });
    if (error) { console.error('[copilote] propositions', error); return false; }
  }

  const cles = new Set(toutes.map(({ x }) => x.cle));
  const perimees = (existantes ?? [])
    .filter((e) => e.statut === 'en_attente' && !cles.has(e.cle)).map((e) => e.cle);
  if (perimees.length) {
    await service.from('copilote_propositions').delete()
      .eq('semaine', semaine).eq('statut', 'en_attente').in('cle', perimees);
  }
  return true;
}

export async function lirePropositions(semaine?: string): Promise<PropositionEnregistree[]> {
  const service = supabaseService();
  if (!service) return [];
  let requete = service.from('copilote_propositions')
    .select('id, semaine, type, cle, rang, titre, contenu, statut, motif');
  if (semaine) requete = requete.eq('semaine', semaine);
  else requete = requete.eq('statut', 'en_attente');
  const { data } = await requete.order('semaine', { ascending: false })
    .order('type').order('rang').limit(100);
  return (data ?? []) as PropositionEnregistree[];
}

/** Décisions récentes, pour garder la trace de ce qui a été validé ou fait. */
export async function lireDecisions(limite = 20): Promise<PropositionEnregistree[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('copilote_propositions')
    .select('id, semaine, type, cle, rang, titre, contenu, statut, motif')
    .neq('statut', 'en_attente').order('updated_at', { ascending: false }).limit(limite);
  return (data ?? []) as PropositionEnregistree[];
}

export async function majStatutProposition(
  id: string, statut: StatutProposition, motif?: string,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('copilote_propositions')
    .update({ statut, motif: motif?.slice(0, 500) ?? null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[copilote] statut', error);
  return !error;
}

// ---------- Rapports ----------

export async function enregistrerRapport(rapport: Rapport, texte: string): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('copilote_rapports').upsert({
    semaine: rapport.semaine, donnees: rapport, texte, updated_at: new Date().toISOString(),
  }, { onConflict: 'semaine' });
  if (error) console.error('[copilote] rapport', error);
  return !error;
}

export async function marquerEnvoi(semaine: string, motif: string | null): Promise<void> {
  const service = supabaseService();
  if (!service) return;
  await service.from('copilote_rapports').update(motif === null
    ? { envoye_le: new Date().toISOString(), envoi_motif: null }
    : { envoi_motif: motif.slice(0, 300) }).eq('semaine', semaine);
}

export async function lireRapport(semaine?: string): Promise<{
  rapport: Rapport; envoyeLe: string | null; envoiMotif: string | null; majLe: string;
} | null> {
  const service = supabaseService();
  if (!service) return null;
  let requete = service.from('copilote_rapports').select('donnees, envoye_le, envoi_motif, updated_at');
  if (semaine) requete = requete.eq('semaine', semaine);
  const { data } = await requete.order('semaine', { ascending: false }).limit(1);
  const d = data?.[0];
  if (!d) return null;
  return { rapport: d.donnees as Rapport, envoyeLe: d.envoye_le, envoiMotif: d.envoi_motif, majLe: d.updated_at };
}

export async function semainesRapportees(limite = 12): Promise<string[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('copilote_rapports').select('semaine')
    .order('semaine', { ascending: false }).limit(limite);
  return (data ?? []).map((d) => d.semaine);
}

/** Trace dans le journal des tâches marketing, lisible au-delà d'une heure. */
export async function journaliser(jour: string, rapport: Record<string, unknown>): Promise<void> {
  const service = supabaseService();
  if (!service) return;
  const { error } = await service.from('marketing_journal').insert({
    tache: 'copilote-hebdo', jour, source: 'copilote', publie: false, rapport,
  });
  if (error) console.error('[copilote] journal', error);
}
