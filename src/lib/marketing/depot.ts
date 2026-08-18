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
  const service = supabaseService();
  // Sans base, la génération reste possible : elle repart simplement de poids
  // neutres. Un écran qui n'affiche rien serait pire qu'un écran qui affiche
  // la production par défaut.
  const poids = service ? await lirePoids() : {};
  const contenus = genererSemaine(date, base, poids);
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

/**
 * Données brutes du tableau de bord.
 *
 * Une seule fonction plutôt qu'une par mesure : les quatre requêtes partent
 * ensemble, et l'écran n'attend qu'une fois. Séquentielles, elles ajouteraient
 * trois allers-retours pour rien.
 */
export async function lireMesures() {
  const service = supabaseService();
  if (!service) return null;

  const [contenus, visites, inscrits, abonnements] = await Promise.all([
    service.from('marketing_contenus')
      .select('reference, format, categorie, accroche, statut, marketing_opportunites(niche_id)'),
    service.from('marketing_visites').select('contenu, source, clics'),
    service.from('profiles').select('origine_contenu').not('origine_contenu', 'is', null),
    service.from('subscriptions').select('status').in('status', ['active', 'trialing']),
  ]);

  return {
    contenus: (contenus.data ?? []).map((c) => ({
      reference: c.reference ?? '',
      niche: (c.marketing_opportunites as unknown as { niche_id?: string } | null)?.niche_id ?? 'inconnue',
      format: c.format,
      categorie: c.categorie,
      accroche: c.accroche,
      statut: c.statut,
    })),
    visites: (visites.data ?? []).map((v) => ({
      contenu: v.contenu, source: v.source, clics: v.clics ?? 0,
    })),
    originesInscrits: (inscrits.data ?? [])
      .map((p) => p.origine_contenu)
      .filter((o): o is string => typeof o === 'string'),
    abonnements: abonnements.data?.length ?? 0,
  };
}

/** Poids courants par niche, tels que la boucle d'amélioration les a laissés. */
export async function lirePoids(): Promise<Record<string, number>> {
  const service = supabaseService();
  if (!service) return {};
  const { data } = await service.from('marketing_niches').select('id, poids').eq('active', true);
  const table: Record<string, number> = {};
  for (const n of data ?? []) table[n.id] = Number(n.poids ?? 1);
  return table;
}

/** Applique les ajustements décidés par la boucle d'amélioration. */
export async function ecrirePoids(
  ajustements: { niche: string; nouveau: number }[], jour: string,
): Promise<number> {
  const service = supabaseService();
  if (!service) return 0;
  let appliques = 0;
  for (const a of ajustements) {
    const { error } = await service.from('marketing_niches')
      .update({ poids: a.nouveau, derniere_evaluation: jour })
      .eq('id', a.niche);
    if (!error) appliques += 1;
  }
  return appliques;
}

/** Enregistre le bilan d'une semaine, sans jamais en écraser un ancien. */
export async function enregistrerBilan(
  semaine: string, texte: string, details: unknown,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('marketing_bilans')
    .upsert({ semaine, texte, details }, { onConflict: 'semaine', ignoreDuplicates: false });
  return !error;
}

/** Derniers bilans, du plus récent au plus ancien. */
export async function lireBilans(limite = 5) {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('marketing_bilans')
    .select('semaine, texte, cree_le').order('cree_le', { ascending: false }).limit(limite);
  return data ?? [];
}

export interface EtatPublication {
  id: string;
  statut: string;
  metaMediaId: string | null;
  tentatives: number;
}

/**
 * Réserve une publication avant d'appeler Meta.
 *
 * L'ordre compte : on écrit d'abord, on publie ensuite. La clé d'idempotence
 * étant unique en base, deux demandes simultanées ne peuvent pas réserver la
 * même ligne — la seconde échoue avant d'avoir rien envoyé. Publier d'abord et
 * enregistrer après laisserait au contraire une fenêtre où un incident réseau
 * produirait un doublon invisible.
 */
export async function reserverPublication(
  contenuReference: string, plateforme: 'instagram' | 'facebook',
): Promise<{ ok: boolean; deja?: EtatPublication; erreur?: string }> {
  const service = supabaseService();
  if (!service) return { ok: false, erreur: 'Service indisponible.' };

  const { data: contenu } = await service.from('marketing_contenus')
    .select('id').eq('reference', contenuReference).single();
  if (!contenu) return { ok: false, erreur: 'Contenu introuvable en base.' };

  const cle = `${contenuReference}:${plateforme}`;
  const { data: existante } = await service.from('marketing_publications')
    .select('id, statut, meta_media_id, tentatives').eq('cle_idempotence', cle).maybeSingle();

  if (existante) {
    if (existante.statut === 'publiee') {
      return {
        ok: false,
        deja: {
          id: existante.id, statut: existante.statut,
          metaMediaId: existante.meta_media_id, tentatives: existante.tentatives,
        },
        erreur: 'Déjà publié.',
      };
    }
    await service.from('marketing_publications')
      .update({ statut: 'envoyee', tentatives: existante.tentatives + 1, updated_at: new Date().toISOString() })
      .eq('id', existante.id);
    return { ok: true, deja: {
      id: existante.id, statut: 'envoyee',
      metaMediaId: existante.meta_media_id, tentatives: existante.tentatives + 1,
    } };
  }

  const { data: creee, error } = await service.from('marketing_publications')
    .insert({
      contenu_id: contenu.id, plateforme, cle_idempotence: cle,
      statut: 'envoyee', tentatives: 1,
    }).select('id').single();

  if (error || !creee) return { ok: false, erreur: 'Réservation impossible.' };
  return { ok: true, deja: { id: creee.id, statut: 'envoyee', metaMediaId: null, tentatives: 1 } };
}

/** Consigne le résultat, succès ou échec, avec un message déjà expurgé. */
export async function conclurePublication(
  id: string, succes: boolean, metaMediaId?: string, erreur?: string,
): Promise<void> {
  const service = supabaseService();
  if (!service) return;
  await service.from('marketing_publications').update({
    statut: succes ? 'publiee' : 'echec',
    meta_media_id: metaMediaId ?? null,
    derniere_erreur: succes ? null : (erreur ?? 'Échec sans message.'),
    publie_le: succes ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}
