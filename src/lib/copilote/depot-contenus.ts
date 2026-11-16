import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { referenceDepuisTitre } from './import';
import { signerVisuel } from '@/lib/marketing/signature';
import { jourIso } from './dates';
import type { ContenuProduit, ProduitDiffusable } from './contenus-produits';
import type { PlateformeBoutique } from './types';

/**
 * Accès aux publications produits et aux fiches diffusables.
 *
 * Clé de service uniquement ; le contrôle d'accès est fait par l'appelant.
 */

export const NOM_BOUTIQUE = () => process.env.COPILOTE_BOUTIQUE?.trim() || 'ParentZenFrance';

export interface Produit {
  id: string;
  plateforme: PlateformeBoutique;
  titre: string;
  url: string | null;
  imageUrl: string | null;
  prixCentimes: number | null;
  devise: string;
}

export type StatutContenu = 'en_attente' | 'rejete' | 'programme';

export interface ContenuEnregistre {
  id: string;
  reference: string;
  angle: string;
  accroche: string;
  appelVisuel: string;
  legendeInstagram: string;
  legendeFacebook: string;
  texteAlternatif: string;
  titrePinterest: string;
  descriptionPinterest: string;
  datePublication: string;
  statut: StatutContenu;
  reserveId: string | null;
  motif: string | null;
  produit: { titre: string; url: string | null };
}

const COLONNES_CONTENU = 'id, reference, angle, accroche, appel_visuel, legende_instagram, legende_facebook, '
  + 'texte_alternatif, titre_pinterest, description_pinterest, date_publication, statut, reserve_id, motif, '
  + 'boutique_produits(titre, url)';

// Les lignes renvoyées par Supabase ne sont pas typées dans ce dépôt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versContenu(d: any): ContenuEnregistre {
  const p = Array.isArray(d.boutique_produits) ? d.boutique_produits[0] : d.boutique_produits;
  return {
    id: d.id, reference: d.reference, angle: d.angle, accroche: d.accroche, appelVisuel: d.appel_visuel,
    legendeInstagram: d.legende_instagram, legendeFacebook: d.legende_facebook,
    texteAlternatif: d.texte_alternatif, titrePinterest: d.titre_pinterest,
    descriptionPinterest: d.description_pinterest, datePublication: d.date_publication,
    statut: d.statut, reserveId: d.reserve_id, motif: d.motif,
    produit: { titre: p?.titre ?? '', url: p?.url ?? null },
  };
}

// ---------- Visuels ----------

export type FormatVisuelProduit = 'carre' | 'pinterest';
const RANG_FORMAT: Record<FormatVisuelProduit, number> = { carre: 0, pinterest: 1 };

/** Adresse signée du visuel : publique (Meta et Pinterest la lisent) mais non énumérable. */
export function urlVisuelProduit(base: string, reference: string, format: FormatVisuelProduit): string | null {
  const jeton = signerVisuel(`copilote:${reference}`, RANG_FORMAT[format]);
  if (!jeton) return null;
  const url = new URL('/api/copilote/visuel', base);
  url.searchParams.set('ref', reference);
  url.searchParams.set('f', format);
  url.searchParams.set('jeton', jeton);
  return url.toString();
}

export function rangFormat(format: FormatVisuelProduit): number {
  return RANG_FORMAT[format];
}

// ---------- Fiches ----------

export async function lireProduits(): Promise<Produit[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('boutique_produits')
    .select('id, plateforme, titre, url, image_url, prix_centimes, devise').order('titre').limit(500);
  return (data ?? []).map((d) => ({
    id: d.id, plateforme: d.plateforme, titre: d.titre, url: d.url, imageUrl: d.image_url,
    prixCentimes: d.prix_centimes, devise: d.devise,
  }));
}

export async function lireProduitsDiffusables(): Promise<ProduitDiffusable[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('boutique_produits')
    .select('id, titre, url, tags, description').not('url', 'is', null).limit(500);
  return (data ?? []).map((d) => ({
    id: d.id, titre: d.titre, url: d.url, tags: d.tags ?? [], description: d.description ?? '',
  }));
}

export function lienValide(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.length > 3;
  } catch {
    return false;
  }
}

export async function majLienProduit(id: string, url: string | null): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('boutique_produits')
    .update({ url, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[copilote] lien', error);
  return !error;
}

/** Ajout à la main : pour une boutique sans export, ou une fiche toute neuve. */
export async function ajouterProduit(p: {
  plateforme: PlateformeBoutique; titre: string; url: string;
}): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('boutique_produits').upsert({
    plateforme: p.plateforme, reference: referenceDepuisTitre(p.titre), titre: p.titre,
    url: p.url, updated_at: new Date().toISOString(),
  }, { onConflict: 'plateforme,reference' });
  if (error) console.error('[copilote] ajout produit', error);
  return !error;
}

// ---------- Réglage d'auto-validation ----------

export async function lireAutoValider(): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { data } = await service.from('copilote_parametres')
    .select('valeur').eq('cle', 'auto_valider').maybeSingle();
  return data?.valeur === true;
}

export async function ecrireAutoValider(actif: boolean): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('copilote_parametres').upsert({
    cle: 'auto_valider', valeur: actif, updated_at: new Date().toISOString(),
  }, { onConflict: 'cle' });
  return !error;
}

// ---------- Publications ----------

/**
 * Enregistre les publications de la semaine. Une publication déjà enregistrée
 * n'est jamais réécrite : elle a pu être validée, rejetée ou publiée.
 * Rend les références réellement ajoutées.
 */
export async function enregistrerContenusProduits(
  semaine: string, contenus: ContenuProduit[],
): Promise<string[]> {
  const service = supabaseService();
  if (!service || contenus.length === 0) return [];
  const { data, error } = await service.from('copilote_contenus').upsert(contenus.map((c) => ({
    reference: c.reference, produit_id: c.produitId, semaine, angle: c.angle,
    accroche: c.accroche, appel_visuel: c.appelVisuel,
    legende_instagram: c.legendeInstagram, legende_facebook: c.legendeFacebook,
    texte_alternatif: c.texteAlternatif, titre_pinterest: c.titrePinterest,
    description_pinterest: c.descriptionPinterest, date_publication: c.datePublication,
  })), { onConflict: 'reference', ignoreDuplicates: true }).select('reference');
  if (error) { console.error('[copilote] contenus', error); return []; }
  return (data ?? []).map((d) => d.reference);
}

export async function lireContenusProduits(statuts: StatutContenu[], limite = 30): Promise<ContenuEnregistre[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('copilote_contenus').select(COLONNES_CONTENU)
    .in('statut', statuts).order('date_publication', { ascending: false }).limit(limite);
  return (data ?? []).map(versContenu);
}

export async function lireContenuParReference(reference: string): Promise<ContenuEnregistre | null> {
  const service = supabaseService();
  if (!service || !/^[a-z0-9-]{1,64}$/.test(reference)) return null;
  const { data } = await service.from('copilote_contenus').select(COLONNES_CONTENU)
    .eq('reference', reference).maybeSingle();
  return data ? versContenu(data) : null;
}

/** Publications à épingler : programmées, dont la date est arrivée. */
export async function contenusPourPinterest(aujourdhui: string): Promise<ContenuEnregistre[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('copilote_contenus').select(COLONNES_CONTENU)
    .eq('statut', 'programme').lte('date_publication', aujourdhui)
    .order('date_publication', { ascending: false }).limit(50);
  return (data ?? []).map(versContenu);
}

/**
 * Programme une publication : elle entre dans la réserve, que la tâche
 * quotidienne publie sur Instagram et Facebook.
 *
 * Le changement de statut se fait d'abord, sous condition « encore en
 * attente » : deux clics rapprochés ne déposent jamais deux fois la même
 * publication. Si le dépôt échoue ensuite, le statut est rétabli.
 */
export async function programmerContenu(
  id: string, base: string,
): Promise<{ ok: boolean; message: string }> {
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };

  const { data: pris } = await service.from('copilote_contenus')
    .update({ statut: 'programme', updated_at: new Date().toISOString() })
    .eq('id', id).eq('statut', 'en_attente').select(COLONNES_CONTENU).maybeSingle();
  if (!pris) return { ok: false, message: 'Publication introuvable ou déjà traitée.' };
  const c = versContenu(pris);

  const image = urlVisuelProduit(base, c.reference, 'carre');
  if (!image) {
    await service.from('copilote_contenus').update({ statut: 'en_attente' }).eq('id', id);
    return { ok: false, message: 'Visuel impossible à signer : CRON_SECRET manquant.' };
  }
  // Une date passée (validation tardive) part au prochain passage, pas dans le passé.
  const aujourdhui = jourIso(new Date());
  const { data: reserve, error } = await service.from('marketing_reserve').insert({
    theme: 'boutique',
    image_url: image,
    legende: c.legendeInstagram,
    legende_facebook: c.legendeFacebook,
    texte_alternatif: c.texteAlternatif,
    date_publication: c.datePublication < aujourdhui ? aujourdhui : c.datePublication,
  }).select('id').single();
  if (error || !reserve) {
    console.error('[copilote] réserve', error);
    await service.from('copilote_contenus').update({ statut: 'en_attente' }).eq('id', id);
    return { ok: false, message: 'Le dépôt dans la réserve a échoué.' };
  }
  await service.from('copilote_contenus').update({ reserve_id: reserve.id }).eq('id', id);
  return { ok: true, message: `Programmée pour le ${c.datePublication < aujourdhui ? aujourdhui : c.datePublication}.` };
}

/**
 * Rejette une publication en attente, ou annule une publication programmée
 * tant qu'elle n'est partie sur aucun réseau.
 */
export async function rejeterContenu(id: string, motif?: string): Promise<{ ok: boolean; message: string }> {
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { data: c } = await service.from('copilote_contenus')
    .select('statut, reserve_id').eq('id', id).maybeSingle();
  if (!c) return { ok: false, message: 'Publication introuvable.' };

  if (c.statut === 'programme' && c.reserve_id) {
    // Seule une ligne encore « prête » est retirée : en cours ou publiée, il est trop tard.
    const { data: retiree } = await service.from('marketing_reserve').delete()
      .eq('id', c.reserve_id).eq('statut', 'pret')
      .eq('statut_instagram', 'en_attente').eq('statut_facebook', 'en_attente')
      .select('id');
    if (!retiree?.length) return { ok: false, message: 'Déjà publiée ou en cours : trop tard pour annuler.' };
  }
  const { error } = await service.from('copilote_contenus').update({
    statut: 'rejete', motif: motif?.slice(0, 300) ?? null, reserve_id: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  return { ok: !error, message: error ? 'L’enregistrement a échoué.' : 'Retirée.' };
}

/** État de publication sur Meta, lu dans la réserve. */
export async function etatsReserve(ids: string[]): Promise<Record<string, { instagram: string; facebook: string }>> {
  const service = supabaseService();
  if (!service || ids.length === 0) return {};
  const { data } = await service.from('marketing_reserve')
    .select('id, statut_instagram, statut_facebook').in('id', ids);
  return Object.fromEntries((data ?? []).map((d) => [d.id, { instagram: d.statut_instagram, facebook: d.statut_facebook }]));
}

// ---------- Clics ----------

export interface ClicsProduit {
  reference: string;
  produit: string;
  clics: number;
  parSource: Record<string, number>;
}

/** Clics vers les fiches depuis `depuis` (inclus), par publication. */
export async function clicsBoutique(depuis: string): Promise<ClicsProduit[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('marketing_visites')
    .select('contenu, source, clics').eq('campagne', 'boutique').gte('jour', depuis);
  const parRef = new Map<string, Record<string, number>>();
  for (const v of data ?? []) {
    const s = parRef.get(v.contenu) ?? {};
    s[v.source] = (s[v.source] ?? 0) + (v.clics ?? 0);
    parRef.set(v.contenu, s);
  }
  if (parRef.size === 0) return [];
  const { data: contenus } = await service.from('copilote_contenus')
    .select('reference, boutique_produits(titre)').in('reference', [...parRef.keys()]);
  const titres = new Map((contenus ?? []).map((c) => {
    const p = c.boutique_produits as unknown as { titre?: string } | { titre?: string }[] | null;
    return [c.reference, (Array.isArray(p) ? p[0]?.titre : p?.titre) ?? c.reference];
  }));
  return [...parRef.entries()].map(([reference, parSource]) => ({
    reference,
    produit: titres.get(reference) ?? reference,
    clics: Object.values(parSource).reduce((a, b) => a + b, 0),
    parSource,
  })).sort((a, b) => b.clics - a.clics);
}
