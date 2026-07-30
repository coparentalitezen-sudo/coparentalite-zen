import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';

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

/** Seules les zones métropolitaines nous concernent. */
const ZONES = ['A', 'B', 'C'] as const;

interface EnregistrementOfficiel {
  description?: string;
  start_date?: string;
  end_date?: string;
  zones?: string;
  annee_scolaire?: string;
  population?: string;
  location?: string;      // académie concernée
}

/** « Zone A » → « A ». */
function zoneCourte(zones: string | undefined): string | null {
  if (!zones) return null;
  const m = /Zone\s+([ABC])/i.exec(zones);
  return m ? m[1].toUpperCase() : null;
}

/** Les dates officielles sont des horodatages ; le planning raisonne en jours. */
function jour(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

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
    const parametres = new URLSearchParams({
      limit: '100',
      where: `annee_scolaire in (${anneesScolaires.map((a) => `"${a}"`).join(',')})`,
      select: 'description,start_date,end_date,zones,annee_scolaire,population,location',
    });

    const reponse = await fetch(`${SOURCE}?${parametres}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!reponse.ok) {
      throw new Error(`la source officielle a répondu ${reponse.status}`);
    }

    const corps = (await reponse.json()) as { results?: EnregistrementOfficiel[] };
    const brut = corps.results ?? [];

    const periodes = brut
      .map((e) => {
        const zone = zoneCourte(e.zones);
        const debut = jour(e.start_date);
        const fin = jour(e.end_date);
        if (!zone || !ZONES.includes(zone as 'A' | 'B' | 'C') || !debut || !fin) return null;
        return {
          country_code: 'FR',
          label: e.description ?? 'Vacances scolaires',
          zone,
          school_year: e.annee_scolaire ?? null,
          starts_on: debut,
          ends_on: fin,
          population: e.population ?? null,
          external_id: `${e.annee_scolaire ?? ''}|${zone}|${e.description ?? ''}|${debut}`,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

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

    // Correspondances académie → zone, déduites de la même réponse officielle.
    // Elles servent à proposer la bonne zone à l'utilisateur sans qu'il cherche.
    const parAcademie = new Map<string, string>();
    for (const e of brut) {
      const zone = zoneCourte(e.zones);
      const academie = e.location?.trim();
      if (zone && academie && ZONES.includes(zone as 'A' | 'B' | 'C')) {
        parAcademie.set(academie, zone);
      }
    }
    let academies = 0;
    if (parAcademie.size > 0) {
      const lignes = [...parAcademie.entries()].map(([academie, zone]) => ({
        area_code: academie.toUpperCase(),
        area_label: academie,
        zone_code: zone,
      }));
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
