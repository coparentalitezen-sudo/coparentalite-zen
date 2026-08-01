import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';
import {
  versPeriodesImportables, versCorrespondancesAcademies,
  type EnregistrementOfficiel,
} from '@/lib/calendrier-officiel';

/**
 * Réponse JSON avec encodage déclaré.
 *
 * Sans « charset=utf-8 », un navigateur interprète les accents comme du
 * latin-1 : « clés » devient « clÃ©s ». Ces routes étant consultées à la main
 * pour diagnostiquer, leurs messages doivent rester lisibles.
 */
function reponseJSON(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}


/**
 * Import du calendrier scolaire officiel.
 *
 * Source : data.education.gouv.fr, jeu « fr-en-calendrier-scolaire », publié
 * par le ministère de l'Éducation nationale. C'est la référence : aucune date
 * n'est déduite ni approximée ici. Une date fausse dans un planning de garde,
 * c'est un enfant qui attend devant une école.
 *
 * Déclenchement : tâche planifiée Vercel (voir vercel.json) ou appel manuel
 * protégé par CRON_SECRET. Idempotent — rejouable sans créer de doublon.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets'
  + '/fr-en-calendrier-scolaire/records';

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  const entete = requete.headers.get('authorization');
  // Vercel envoie « Bearer <CRON_SECRET> » pour les tâches planifiées
  return entete === `Bearer ${attendu}`;
}

/**
 * Déclenchement manuel par un membre connecté.
 *
 * La tâche planifiée hebdomadaire ne suffit pas : après avoir choisi sa zone,
 * un parent doit voir ses vacances tout de suite, pas le lundi suivant.
 * L'appel est réservé aux membres d'un foyer et limité en fréquence — la
 * source officielle n'a pas à être sollicitée en boucle.
 */
async function autoriseMembre(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('household_members').select('household_id')
    .eq('profile_id', user.id).is('deleted_at', null).limit(1);
  return Boolean(data && data.length > 0);
}

/** Un import récent rend le suivant inutile : on l'annonce sans le refaire. */
async function importRecent(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const ilYaUneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await supabase
    .from('school_calendar_syncs').select('id')
    .eq('statut', 'succes').gte('finished_at', ilYaUneHeure).limit(1);
  return Boolean(data && data.length > 0);
}

export async function POST() {
  if (!(await autoriseMembre())) {
    return reponseJSON({ message: 'Connectez-vous pour synchroniser.' }, 401);
  }
  if (await importRecent()) {
    return reponseJSON({
      message: 'Le calendrier a déjà été mis à jour il y a moins d’une heure.',
      deja_a_jour: true,
    });
  }
  return synchroniser('manuelle');
}

export async function GET(requete: Request) {
  // Tâche planifiée Vercel, authentifiée par le secret
  if (autorise(requete)) return synchroniser('planifiee');

  // Membre connecté : la même synchronisation, mais consultable directement
  // dans le navigateur. La réponse brute affiche la cause exacte d'un échec,
  // là où l'interface ne montre qu'un message résumé — indispensable pour
  // diagnostiquer sans deviner.
  if (await autoriseMembre()) {
    if (await importRecent()) {
      return reponseJSON({
        message: 'Le calendrier a déjà été mis à jour il y a moins d’une heure.',
        deja_a_jour: true,
      });
    }
    return synchroniser('manuelle');
  }

  return reponseJSON({ message: 'Non autorisé.' }, 401);
}

async function synchroniser(origine: 'planifiee' | 'manuelle') {
  // Un appel manuel vient d'un membre du foyer qui cherche à comprendre :
  // lui renvoyer « impossible pour le moment » sans la cause l'oblige à
  // deviner. La cause exacte n'est exposée que par cette voie.
  const exposerCause = origine === 'manuelle';
  const service = supabaseService();
  if (!service) {
    return NextResponse.json(
      { message: 'Clé de service absente : import impossible.' },
      { status: 503 },
    );
  }

  // Trace d'entrée : toute tentative laisse une empreinte, même si la suite
  // échoue. Sans cela, un appel qui se perd est indiscernable d'un appel
  // jamais parti — ce qui a coûté plusieurs allers-retours de diagnostic.
  await service.rpc('log_calendar_sync', {
    p_zone: null, p_annee: null, p_periodes: 0,
    p_statut: 'echec', p_message: `tentative ${origine} en cours`,
  });

  // On couvre l'année scolaire en cours et les deux suivantes : le planning
  // doit pouvoir aller au-delà d'un an pour les abonnés.
  const annee = new Date().getFullYear();
  const anneesScolaires = [
    `${annee - 1}-${annee}`, `${annee}-${annee + 1}`,
    `${annee + 1}-${annee + 2}`, `${annee + 2}-${annee + 3}`,
  ];

  try {
    // L'API plafonne à 100 enregistrements par appel. Quatre années scolaires
    // en comptent davantage : sans pagination, les dernières périodes étaient
    // silencieusement perdues.
    const brut: EnregistrementOfficiel[] = [];
    let filtreRejete = false;
    const PAGE = 100;
    const PAGES_MAX = 10;          // garde-fou : 1 000 enregistrements suffisent
    for (let page = 0; page < PAGES_MAX; page += 1) {
      // Deux tentatives : filtrée sur les années utiles, puis sans filtre.
      // La syntaxe de filtrage de la source peut évoluer ; le calendrier
      // complet reste exploitable, seulement plus volumineux.
      const base = {
        limit: String(PAGE),
        offset: String(page * PAGE),
        select: 'description,start_date,end_date,zones,annee_scolaire,population,location',
        order_by: 'start_date',
      };
      const filtre = `annee_scolaire in (${anneesScolaires.map((a) => `"${a}"`).join(',')})`;

      let reponse = await fetch(
        `${SOURCE}?${new URLSearchParams({ ...base, where: filtre })}`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' },
      );
      if (reponse.status === 400) {
        filtreRejete = true;
        reponse = await fetch(
          `${SOURCE}?${new URLSearchParams(base)}`,
          { headers: { Accept: 'application/json' }, cache: 'no-store' },
        );
      }
      if (!reponse.ok) {
        const detail = await reponse.text().catch(() => '');
        throw new Error(
          `la source officielle a répondu ${reponse.status}`
          + (detail ? ` : ${detail.slice(0, 200)}` : ''),
        );
      }

      const corps = (await reponse.json()) as { results?: EnregistrementOfficiel[] };
      const lot = corps.results ?? [];
      brut.push(...lot);
      if (lot.length < PAGE) break;   // dernière page atteinte
    }

    const periodes = versPeriodesImportables(brut);

    if (periodes.length === 0) {
      await service.rpc('log_calendar_sync', {
        p_zone: null, p_annee: null, p_periodes: 0,
        p_statut: 'echec', p_message: 'aucune période exploitable dans la réponse',
      });
      return reponseJSON({ message: 'La source officielle n’a renvoyé aucune période exploitable.' }, 502);
    }

    const { data: importees, error } = await service.rpc('import_school_holidays', {
      p_periodes: periodes,
    });
    if (error) throw new Error(error.message);

    // Correspondances académie → zone, déduites de la même réponse officielle :
    // elles permettront de proposer la bonne zone depuis un code postal.
    const lignes = versCorrespondancesAcademies(brut);
    let academies = 0;
    if (lignes.length > 0) {
      const { data: n, error: erreurZones } = await service.rpc('import_area_zones', {
        p_pays: 'FR', p_lignes: lignes,
      });
      if (erreurZones) {
        // Non bloquant : les vacances sont importées, seule l'aide au choix
        // de zone reste indisponible.
        console.error('[vacances] correspondances', erreurZones.message);
      } else {
        academies = Number(n ?? 0);
      }
    }

    await service.rpc('log_calendar_sync', {
      p_zone: null, p_annee: anneesScolaires.join(', '),
      p_periodes: Number(importees ?? 0),
      p_statut: 'succes',
      p_message: [
        academies > 0 ? `${academies} académies rattachées` : null,
        filtreRejete ? 'filtre par année refusé, calendrier complet récupéré' : null,
      ].filter(Boolean).join(' · ') || null,
    });

    return reponseJSON({
      importees: Number(importees ?? 0),
      academies,
      enregistrements_lus: brut.length,
      annees: anneesScolaires,
      ...(filtreRejete ? { note: 'filtre par année refusé par la source' } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[vacances]', message);
    await service.rpc('log_calendar_sync', {
      p_zone: null, p_annee: null, p_periodes: 0,
      p_statut: 'echec', p_message: message,
    });
    // Aucune donnée approximative n'est écrite : mieux vaut un calendrier vide
    // qu'un calendrier faux.
    return reponseJSON({
      message: 'Import impossible pour le moment.',
      ...(exposerCause ? { cause: message } : {}),
    }, 502);
  }
}
