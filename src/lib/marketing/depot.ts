import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { genererSemaine, semaineIso, type Contenu } from './generateur';
import { contenusPublies } from './pinterest';

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

export type Plateforme = 'global' | 'instagram' | 'facebook' | 'pinterest';

export interface Parametres {
  mode: 'validation' | 'automatique';
  actif: boolean;
  suspenduMotif: string | null;
}

/**
 * Réglages d'une plateforme.
 *
 * Chaque canal a les siens depuis la migration 00045. Auparavant une ligne
 * unique les commandait tous, si bien qu'activer la publication automatique
 * pour un canal l'activait pour les autres — une commande à distance
 * involontaire, découverte parce qu'un second canal est apparu.
 */
export async function lireParametresPlateforme(
  plateforme: Plateforme,
): Promise<Parametres | null> {
  const service = supabaseService();
  if (!service) return null;
  const { data } = await service
    .from('marketing_parametres')
    .select('mode, actif, suspendu_motif').eq('plateforme', plateforme).maybeSingle();
  if (!data) return null;
  return { mode: data.mode, actif: data.actif, suspenduMotif: data.suspendu_motif };
}

/**
 * Une plateforme peut-elle publier ?
 *
 * Deux notions distinctes, qu'il ne faut pas confondre :
 *   * « actif » dit si le canal est en service. C'est l'arrêt d'urgence, et
 *     il vaut aussi pour une publication déclenchée à la main — un arrêt
 *     qu'un clic contourne n'arrête rien.
 *   * « mode » dit qui déclenche : vous, ou la tâche planifiée.
 *
 * Il faut l'interrupteur du canal *et* l'interrupteur général. Le global
 * coupe tout, mais n'allume rien : rallumer doit rester un geste par canal.
 */
export async function publicationAutorisee(
  plateforme: Exclude<Plateforme, 'global'>,
): Promise<{ autorisee: boolean; motif?: string }> {
  const [global, propre] = await Promise.all([
    lireParametresPlateforme('global'),
    lireParametresPlateforme(plateforme),
  ]);

  if (!global?.actif) {
    return { autorisee: false, motif: 'Publication suspendue pour toutes les plateformes.' };
  }
  if (!propre?.actif) {
    return { autorisee: false, motif: `Publication suspendue pour ${plateforme}.` };
  }
  return { autorisee: true };
}

export interface ContenuEnregistre extends Contenu {
  statut: Statut;
  motifRejet: string | null;
}

export async function majParametres(
  champs: Partial<Parametres> & { plateforme?: Plateforme },
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('marketing_parametres').update({
    ...(champs.mode !== undefined ? { mode: champs.mode } : {}),
    ...(champs.actif !== undefined ? { actif: champs.actif } : {}),
    ...(champs.suspenduMotif !== undefined ? { suspendu_motif: champs.suspenduMotif } : {}),
    updated_at: new Date().toISOString(),
  }).eq('plateforme', champs.plateforme ?? 'global');
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

    if (!opportunite) {
      // Une opportunité qui ne s'écrit pas rend tout le reste impossible :
      // le contenu la référence. Le dire plutôt que de passer au suivant, un
      // écran vide sans message étant le pire des symptômes.
      console.error('[marketing] opportunité non enregistrée', referenceOpportunite);
      continue;
    }

    const { error: erreurContenu } = await service.from('marketing_contenus').upsert({
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
      // Seul chemin d'écriture aujourd'hui : genererSemaine est déterministe,
      // l'agent rédacteur (redacteur.ts) n'est pas encore branché ici.
      source: 'deterministe',
    }, { onConflict: 'reference', ignoreDuplicates: true });

    if (erreurContenu) {
      console.error('[marketing] contenu non enregistré', c.reference, erreurContenu.message);
    }
  }

  return contenus;
}

/** Date réelle du jour de la semaine visé, au format ISO. */
export function dateDuJour(reference: Date, jour: number): string {
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

/**
 * Change le statut d'un contenu.
 *
 * Renvoie faux si aucune ligne n'a été touchée. Sans cette vérification, une
 * mise à jour portant sur une référence absente réussissait sans rien faire :
 * l'écran affichait « Validé » alors que la base ne contenait rien. Un
 * mensonge à l'écran coûte plus cher qu'une erreur affichée.
 */
export async function majStatut(
  reference: string, statut: Statut, motif?: string,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { data, error } = await service.from('marketing_contenus').update({
    statut,
    motif_rejet: statut === 'rejete' ? (motif ?? null) : null,
    updated_at: new Date().toISOString(),
  }).eq('reference', reference).select('reference');
  return !error && (data?.length ?? 0) > 0;
}

/** Remplace le texte d'une légende, sans toucher au reste du contenu. */
export async function corrigerLegende(
  reference: string, plateforme: 'instagram' | 'facebook', texte: string,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const champ = plateforme === 'instagram' ? 'legende_instagram' : 'legende_facebook';
  const { data, error } = await service.from('marketing_contenus')
    .update({ [champ]: texte, updated_at: new Date().toISOString() })
    .eq('reference', reference).select('reference');
  return !error && (data?.length ?? 0) > 0;
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

/** Totaux agrégés du questionnaire public, sans réponse ni identifiant. */
export async function lireParcoursQuiz() {
  const service = supabaseService();
  if (!service) return { commences: 0, termines: 0, clicsInscription: 0 };
  const { data } = await service
    .from('marketing_parcours_quiz').select('etape, occurrences');
  const totaux = { commences: 0, termines: 0, clicsInscription: 0 };
  for (const ligne of data ?? []) {
    const n = Number(ligne.occurrences ?? 0);
    if (ligne.etape === 'commence') totaux.commences += n;
    if (ligne.etape === 'termine') totaux.termines += n;
    if (ligne.etape === 'clic_inscription') totaux.clicsInscription += n;
  }
  return totaux;
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

// ============================================================
// Boucle d'amélioration Pinterest
// ============================================================

export interface ContenuSansPin {
  reference: string;
}

/**
 * Contenus dont l'épingle Pinterest n'est pas encore identifiée.
 *
 * Aucun filtre par statut : un contenu peut avoir été exposé au flux RSS en
 * mode « automatique » sans être passé par « valide ». Ce qui décide qu'une
 * référence est réellement rattachable, c'est qu'une épingle existante la
 * porte dans son lien (associerEpingles) — pas ce filtre, qui ne sert qu'à
 * borner la requête.
 */
export async function contenusSansPinId(): Promise<ContenuSansPin[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('marketing_contenus')
    .select('reference')
    .is('pin_id', null)
    .not('reference', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);
  return (data ?? [])
    .map((c) => ({ reference: c.reference ?? '' }))
    .filter((c) => c.reference);
}

/**
 * Enregistre l'épingle retrouvée pour un contenu.
 *
 * La condition « pin_id est encore vide » protège contre une découverte
 * concurrente : la première écriture gagne, la seconde ne touche plus rien
 * plutôt que d'écraser un id déjà correct par un autre trouvé au même passage.
 */
export async function enregistrerPinId(
  reference: string, pinId: string, creeLe: Date | null,
): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { data, error } = await service.from('marketing_contenus')
    .update({
      pin_id: pinId,
      pin_cree_le: creeLe ? creeLe.toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('reference', reference)
    .is('pin_id', null)
    .select('reference');
  return !error && (data?.length ?? 0) > 0;
}

export interface ContenuACollecter {
  contenuId: string;
  pinId: string;
  pinCreeLe: Date;
}

/** Contenus dont l'épingle est connue et dont l'âge peut donc être calculé. */
export async function contenusPourCollecte(): Promise<ContenuACollecter[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('marketing_contenus')
    .select('id, pin_id, pin_cree_le')
    .not('pin_id', 'is', null)
    .not('pin_cree_le', 'is', null);
  return (data ?? [])
    .filter((c): c is { id: string; pin_id: string; pin_cree_le: string } =>
      Boolean(c.pin_id && c.pin_cree_le))
    .map((c) => ({ contenuId: c.id, pinId: c.pin_id, pinCreeLe: new Date(c.pin_cree_le) }));
}

export interface LignePinStats {
  pinId: string;
  contenuId: string;
  joursDepuisPub: number;
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
}

/** Enregistre les relevés du jour. Rejouable : une seconde collecte le même jour remplace, sans dupliquer. */
export async function ecrirePinStats(lignes: LignePinStats[]): Promise<number> {
  const service = supabaseService();
  if (!service || lignes.length === 0) return 0;
  const jour = new Date().toISOString().slice(0, 10);
  const { data, error } = await service.from('pin_stats')
    .upsert(
      lignes.map((l) => ({
        pin_id: l.pinId,
        contenu_id: l.contenuId,
        collecte_le: jour,
        jours_depuis_pub: l.joursDepuisPub,
        impressions: l.impressions,
        saves: l.saves,
        pin_clicks: l.pinClicks,
        outbound_clicks: l.outboundClicks,
      })),
      { onConflict: 'pin_id,collecte_le', ignoreDuplicates: false },
    )
    .select('pin_id');
  return error ? 0 : (data?.length ?? 0);
}

export interface MesurePinBrute {
  pinId: string;
  pilier: string;
  famille: string;
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
}

/**
 * Dernier relevé de chaque épingle, avec son pilier (niche) et sa famille de
 * modèle (catégorie).
 *
 * Un relevé par épingle, pas tout l'historique : classer une épingle sur son
 * état le plus récent plutôt que sur la moyenne de ses relevés évite qu'une
 * épingle mesurée dix fois pèse dix fois plus qu'une épingle mesurée une fois.
 */
export async function lireMesuresPinterest(): Promise<MesurePinBrute[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('pin_stats')
    .select(`
      pin_id, collecte_le, impressions, saves, pin_clicks, outbound_clicks,
      marketing_contenus(categorie, marketing_opportunites(niche_id))
    `)
    .order('collecte_le', { ascending: false });

  const dejaVues = new Set<string>();
  const mesures: MesurePinBrute[] = [];
  for (const ligne of data ?? []) {
    if (!ligne.pin_id || dejaVues.has(ligne.pin_id)) continue;
    dejaVues.add(ligne.pin_id);
    const contenu = ligne.marketing_contenus as unknown as
      { categorie?: string; marketing_opportunites?: { niche_id?: string } } | null;
    mesures.push({
      pinId: ligne.pin_id,
      pilier: contenu?.marketing_opportunites?.niche_id ?? 'inconnue',
      famille: contenu?.categorie ?? 'inconnue',
      impressions: ligne.impressions ?? 0,
      saves: ligne.saves ?? 0,
      pinClicks: ligne.pin_clicks ?? 0,
      outboundClicks: ligne.outbound_clicks ?? 0,
    });
  }
  return mesures;
}

/** Enregistre un bilan d'apprentissages, sans jamais en écraser un ancien. */
export async function enregistrerLearnings(nbPins: number, bloc: string): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('learnings').insert({ nb_pins: nbPins, bloc });
  return !error;
}

export interface Learnings {
  genereLe: string;
  nbPins: number;
  bloc: string;
}

/** Bilan d'apprentissages le plus récent, pour affichage dans /admin/mesures. */
export async function lireDernierLearnings(): Promise<Learnings | null> {
  const service = supabaseService();
  if (!service) return null;
  const { data } = await service.from('learnings')
    .select('genere_le, nb_pins, bloc')
    .order('genere_le', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { genereLe: data.genere_le, nbPins: data.nb_pins, bloc: data.bloc };
}

export interface LigneContenuTableau {
  reference: string;
  date: string;
  niche: string;
  categorie: string;
  source: string;
  titre: string;
  statut: 'généré' | 'publié' | 'épingle trouvée' | 'mesuré';
}

/**
 * Contenus de la semaine en cours, avec leur état d'avancement réel.
 *
 * L'échelle est cumulative — généré, puis publié, puis épingle trouvée, puis
 * mesuré — et chaque palier suppose le précédent : une épingle trouvée sans
 * être passée par « publié » serait un signe d'incohérence, pas un état
 * normal, mais l'affichage reste correct dans les deux cas puisque chaque
 * condition est vérifiée indépendamment.
 *
 * « Publié » réutilise contenusPublies (pinterest.ts) : la même fonction qui
 * décide de ce que Pinterest reçoit décide de ce qui s'affiche ici comme
 * publié, pour que les deux ne divergent jamais.
 */
export async function lireContenusSemaine(date: Date, base: string): Promise<LigneContenuTableau[]> {
  const contenus = genererSemaine(date, base);
  const semaine = `${date.getFullYear()}s${String(semaineIso(date)).padStart(2, '0')}`;

  const service = supabaseService();
  if (!service) {
    return contenus.map((c) => ({
      reference: c.reference, date: dateDuJour(date, c.jour), niche: c.niche,
      categorie: c.categorie, source: 'deterministe', titre: c.accroche, statut: 'généré',
    }));
  }

  const [statuts, parametres, { data: lignes }] = await Promise.all([
    lireStatuts(contenus.map((c) => c.reference)),
    lireParametres(),
    service.from('marketing_contenus')
      .select('reference, source, accroche, pin_id, pin_stats(id)')
      .like('reference', `${semaine}-%`),
  ]);

  type LigneBrute = { reference: string; source: string; accroche: string; pin_id: string | null; pin_stats: { id: string }[] | null };
  const parReference = new Map(((lignes ?? []) as LigneBrute[]).map((l) => [l.reference, l]));
  const publiees = new Set(contenusPublies(contenus, statuts, parametres).map((c) => c.reference));

  return contenus.map((c) => {
    const ligne = parReference.get(c.reference);
    const mesure = (ligne?.pin_stats?.length ?? 0) > 0;
    const statut: LigneContenuTableau['statut'] =
      mesure ? 'mesuré'
        : ligne?.pin_id ? 'épingle trouvée'
          : publiees.has(c.reference) ? 'publié'
            : 'généré';
    return {
      reference: c.reference,
      date: dateDuJour(date, c.jour),
      niche: c.niche,
      categorie: c.categorie,
      source: ligne?.source ?? 'deterministe',
      titre: ligne?.accroche ?? c.accroche,
      statut,
    };
  });
}

/** Consigne l'issue d'un appel à l'agent rédacteur — succès ou l'un des replis. */
export async function consignerRedaction(resultat: string, motif: string | null): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { error } = await service.from('journal_redacteur').insert({ resultat, motif });
  return !error;
}

export interface LigneJournalRedacteur {
  date: string;
  resultat: string;
  motif: string | null;
}

/** Les dernières lignes du journal, du plus récent au plus ancien. */
export async function lireJournalRedacteur(limite = 20): Promise<LigneJournalRedacteur[]> {
  const service = supabaseService();
  if (!service) return [];
  const { data } = await service.from('journal_redacteur')
    .select('date, resultat, motif')
    .order('date', { ascending: false })
    .limit(limite);
  return data ?? [];
}

export interface EtatCollectePinterest {
  derniereCollecte: string | null;
  epinglesMesureesDerniereFois: number;
  epinglesSansPinId: number;
}

/**
 * État de la dernière collecte Pinterest.
 *
 * « Dernier passage » reprend learnings.genere_le : executerBouclePinterest
 * écrit toujours un bilan d'apprentissages en fin de passage, même sans
 * nouvelle épingle mesurée, ce qui en fait un horodatage fiable sans ajouter
 * de table dédiée. Le compte de la dernière collecte se lit dans pin_stats,
 * à la date de relevé la plus récente ; celui des épingles non rattachées
 * réutilise contenusSansPinId, la requête déjà utilisée par la découverte.
 */
export async function etatCollectePinterest(): Promise<EtatCollectePinterest> {
  const service = supabaseService();
  if (!service) return { derniereCollecte: null, epinglesMesureesDerniereFois: 0, epinglesSansPinId: 0 };

  const [{ data: dernierLearnings }, { data: dernierReleve }, sansPinId] = await Promise.all([
    service.from('learnings').select('genere_le').order('genere_le', { ascending: false }).limit(1).maybeSingle(),
    service.from('pin_stats').select('collecte_le').order('collecte_le', { ascending: false }).limit(1).maybeSingle(),
    contenusSansPinId(),
  ]);

  let epinglesMesureesDerniereFois = 0;
  if (dernierReleve?.collecte_le) {
    const { count } = await service.from('pin_stats')
      .select('id', { count: 'exact', head: true })
      .eq('collecte_le', dernierReleve.collecte_le);
    epinglesMesureesDerniereFois = count ?? 0;
  }

  return {
    derniereCollecte: dernierLearnings?.genere_le ?? null,
    epinglesMesureesDerniereFois,
    epinglesSansPinId: sansPinId.length,
  };
}
