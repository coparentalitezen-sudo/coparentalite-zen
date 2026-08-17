import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { genererSemaine, semaineIso, type Contenu } from './generateur';

/**
 * Accès aux données du dispositif.
 *
 * Toujours par la clé de service : les tables sont fermées par RLS sans
 * aucune politique, aucun compte connecté ne peut donc les lire directement.
 * Le contrôle d'accès se fait en amont, dans la page, avant d'appeler ces
 * fonctions — jamais ici.
 *
 * L'import de « server-only » n'est pas décoratif : il fait échouer la
 * construction si ce module était importé depuis un composant client, où la
 * clé de service n'aurait rien à faire.
 */

export type Statut = 'brouillon' | 'en_attente' | 'valide' | 'rejete' | 'publie' | 'echec';

export interface Parametres {
  mode: 'validation' | 'automatique';
  actif: boolean;
  suspenduMotif: string | null;
}

export interface ContenuEnregistre extends Contenu {
  statut: Statut;
  motifRejet: string | null;
}

export async function lireParametres(): Promise<Parametres | null> {
  const service = supabaseService();
  if (!service) return null;
  const { data } = await service
    .from('marketing_parametres')
    .select('mode, actif, suspendu_motif').eq('id', true).single();
  if (!data) return null;
  return { mode: data.mode, actif: data.actif, suspenduMotif: data.suspendu_motif };
}

export async function majParametres(champs: Partial<Parametres>): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('marketing_parametres').update({
    ...(champs.mode !== undefined ? { mode: champs.mode } : {}),
    ...(champs.actif !== undefined ? { actif: champs.actif } : {}),
    ...(champs.suspenduMotif !== undefined ? { suspendu_motif: champs.suspenduMotif } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', true);
  return !error;
}

/**
 * Enregistre la semaine engendrée, sans jamais créer de doublon.
 *
 * L'opération est rejouable : les références étant uniques en base, une
 * seconde exécution ne produit rien de nouveau. C'est ce qui permet de
 * relancer après une erreur réseau sans se demander où l'on en était.
 *
 * Le statut de départ est « en_attente » : rien ne part sans accord, même
 * quand le mode automatique sera activé — celui-ci décidera de la publication,
 * pas de la création.
 */
export async function enregistrerSemaine(date: Date, base: string): Promise<Contenu[]> {
  const contenus = genererSemaine(date, base);
  const service = supabaseService();
  if (!service) return contenus;

  const semaine = `${date.getFullYear()}s${String(semaineIso(date)).padStart(2, '0')}`;

  for (const c of contenus) {
    // L'opportunité porte le « pourquoi » du contenu. Une par contenu et par
    // semaine : le même sujet traité en semaine 34 et en semaine 40 répond à
    // deux détections distinctes, et leurs performances se comparent.
    const referenceOpportunite = `${semaine}-${c.niche}`;
    const { data: opportunite } = await service
      .from('marketing_opportunites')
      .upsert({
        reference: referenceOpportunite,
        niche_id: c.niche === 'marque' ? 'communication' : c.niche,
        probleme: c.accroche,
        intention: 'Organiser sans discuter',
        angle: c.categorie,
        fonctionnalite: c.niche,
        source: 'Banque interne de sujets',
        detectee_le: date.toISOString().slice(0, 10),
        statut: 'produite',
      }, { onConflict: 'reference', ignoreDuplicates: false })
      .select('id').single();

    if (!opportunite) continue;

    await service.from('marketing_contenus').upsert({
      reference: c.reference,
      opportunite_id: opportunite.id,
      format: c.format,
      categorie: c.categorie,
      accroche: c.accroche,
      pages: c.pages,
      legende_instagram: c.legendeInstagram,
      legende_facebook: c.legendeFacebook,
      texte_alternatif: c.texteAlternatif,
      hashtags: c.hashtags,
      appel_action: c.appelAction,
      prevu_le: dateDuJour(date, c.jour),
      statut: 'en_attente',
    }, { onConflict: 'reference', ignoreDuplicates: true });
  }

  return contenus;
}

/** Date réelle du jour de la semaine visé, au format ISO. */
function dateDuJour(reference: Date, jour: number): string {
  const d = new Date(reference);
  const decalage = (jour === 0 ? 7 : jour) - (d.getDay() === 0 ? 7 : d.getDay());
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
}

/** Statuts déjà enregistrés, indexés par référence. */
export async function lireStatuts(
  references: string[],
): Promise<Record<string, { statut: Statut; motifRejet: string | null }>> {
  const service = supabaseService();
  if (!service || references.length === 0) return {};
  const { data } = await service
    .from('marketing_contenus')
    .select('reference, statut, motif_rejet').in('reference', references);
  const table: Record<string, { statut: Statut; motifRejet: string | null }> = {};
  for (const l of data ?? []) {
    if (l.reference) table[l.reference] = { statut: l.statut, motifRejet: l.motif_rejet };
  }
  return table;
}

export async function majStatut(
  reference: string, statut: Statut, motif?: string,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('marketing_contenus').update({
    statut,
    motif_rejet: statut === 'rejete' ? (motif ?? null) : null,
    updated_at: new Date().toISOString(),
  }).eq('reference', reference);
  return !error;
}

/** Remplace le texte d'une légende, sans toucher au reste du contenu. */
export async function corrigerLegende(
  reference: string, plateforme: 'instagram' | 'facebook', texte: string,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const champ = plateforme === 'instagram' ? 'legende_instagram' : 'legende_facebook';
  const { error } = await service.from('marketing_contenus')
    .update({ [champ]: texte, updated_at: new Date().toISOString() })
    .eq('reference', reference);
  return !error;
}
