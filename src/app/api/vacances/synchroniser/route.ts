import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';
import {
  versPeriodesImportables, versCorrespondancesAcademies,
  type EnregistrementOfficiel,
} from '@/lib/calendrier-officiel';

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
    return NextResponse.json({ message: 'Connectez-vous pour synchroniser.' }, { status: 401 });
  }
  if (await importRecent()) {
    return NextResponse.json({
      message: 'Le calendrier a déjà été mis à jour il y a moins d’une heure.',
      deja_a_jour: true,
    });
  }
  return synchroniser();
}

export async function GET(requete: Request) {
  if (!autorise(requete)) {
    return NextResponse.json({ message: 'Non autorisé.' }, { status: 401 });
  }
  return synchroniser();
}

async function synchroniser() {
  const service = supabaseService();
  if (!service) {
    return NextResponse.json(
      { message: 'Clé de service absente : import impossible.' },
      { status: 503 },
    );
  }

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
    const PAGE = 100;
    const PAGES_MAX = 10;          // garde-fou : 1 000 enregistrements suffisent
    for (let page = 0; page < PAGES_MAX; page += 1) {
      const parametres = new URLSearchParams({
        limit: String(PAGE),
        offset: String(page * PAGE),
        where: `annee_scolaire in (${anneesScolaires.map((a) => `"${a}"`).join(',')})`,
        select: 'description,start_date,end_date,zones,annee_scolaire,population,location',
        order_by: 'start_date',
      });

      const reponse = await fetch(`${SOURCE}?${parametres}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!reponse.ok) {
        throw new Error(`la source officielle a répondu ${reponse.status}`);
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
      return NextResponse.json(
        { message: 'La source officielle n’a renvoyé aucune période exploitable.' },
        { status: 502 },
      );
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
      p_message: academies > 0 ? `${academies} académies rattachées` : null,
    });

    return NextResponse.json({
      importees: Number(importees ?? 0),
      academies,
      annees: anneesScolaires,
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
    return NextResponse.json(
      { message: 'Import impossible pour le moment.' },
      { status: 502 },
    );
  }
}
