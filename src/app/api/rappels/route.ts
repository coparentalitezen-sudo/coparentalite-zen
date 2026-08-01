import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';
import { buildDayMap, journeesPartagees } from '@/lib/custody';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reponseJSON(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function autoriseCron(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  return Boolean(attendu)
    && requete.headers.get('authorization') === `Bearer ${attendu}`;
}

interface RegleStockee {
  id: string;
  pattern: string;
  start_date: string;
  starting_parent: string;
  config: { parent2?: string; custom_cycle?: ('P1' | 'P2')[] } | null;
  handover_time: string | null;
}

interface Bilan {
  foyers: number;
  rendezVous: number;
  vacances: number;
  changements: number;
  purges: number;
}

/**
 * Renvoie le foyer du membre connecté. Contrairement à l’ancien GET manuel,
 * cette voie ne permet jamais de lancer le traitement de tous les foyers avec
 * la clé de service.
 */
async function foyerDuMembre(): Promise<string | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.household_id as string;
}

async function traiterFoyers(ids: string[]) {
  const service = supabaseService();
  if (!service) {
    return reponseJSON({ message: 'Clé de service absente : programmation impossible.' }, 503);
  }

  const bilan: Bilan = { foyers: 0, rendezVous: 0, vacances: 0, changements: 0, purges: 0 };
  const soucis: string[] = [];

  try {
    for (const hid of ids) {
      bilan.foyers += 1;

      for (const [fn, cle] of [
        ['programmer_rappels_rendez_vous', 'rendezVous'],
        ['programmer_rappels_vacances', 'vacances'],
        ['purger_rappels_obsoletes', 'purges'],
      ] as const) {
        const { data, error } = await service.rpc(fn, { p_household: hid });
        if (error) {
          soucis.push(`${fn} · ${error.message}`);
          continue;
        }
        bilan[cle] += Number(data ?? 0);
      }

      const { data: regles, error: erreurRegles } = await service
        .from('custody_rules')
        .select('id, pattern, start_date, starting_parent, config, handover_time')
        .eq('household_id', hid)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (erreurRegles) {
        soucis.push(`rythme · ${erreurRegles.message}`);
        continue;
      }

      const regle = (regles?.[0] ?? null) as RegleStockee | null;
      const parent2 = regle?.config?.parent2;
      if (!regle || !parent2) continue;

      const maintenant = new Date();
      const debut = maintenant.toISOString().slice(0, 10);
      const fin = new Date(maintenant.getTime() + 14 * 86400000)
        .toISOString().slice(0, 10);

      const [{ data: exceptions, error: erreurExceptions }, { data: types, error: erreurTypes }] =
        await Promise.all([
          service
            .from('custody_exceptions')
            .select('kind, parent_id, starts_at, ends_at')
            .eq('household_id', hid)
            .is('deleted_at', null)
            .lte('starts_at', `${fin}T23:59:59Z`)
            .gte('ends_at', `${debut}T00:00:00Z`),
          service.from('exception_types').select('code, priority'),
        ]);

      if (erreurExceptions) {
        soucis.push(`exceptions · ${erreurExceptions.message}`);
        continue;
      }
      if (erreurTypes) {
        soucis.push(`types d’exception · ${erreurTypes.message}`);
        continue;
      }

      const priorite = new Map(
        (types ?? []).map((type) => [type.code as string, Number(type.priority)]),
      );

      let carte;
      try {
        carte = buildDayMap(
          {
            pattern: regle.pattern as never,
            startDate: regle.start_date,
            parent1: regle.starting_parent,
            parent2,
            customCycle: regle.config?.custom_cycle,
          },
          regle.start_date < debut ? regle.start_date : debut,
          fin,
          [],
          (exceptions ?? []).map((exception) => ({
            startsOn: (exception.starts_at as string).slice(0, 10),
            endsOn: (exception.ends_at as string).slice(0, 10),
            parentId: exception.parent_id as string,
            source: exception.kind as string,
            priorite: priorite.get(exception.kind as string) ?? 10,
          })),
        );
      } catch (cause) {
        soucis.push(`calcul du planning · ${cause instanceof Error ? cause.message : String(cause)}`);
        continue;
      }

      const heure = regle.handover_time?.slice(0, 5) ?? '08:00';
      for (const [date, jour] of journeesPartagees(carte, heure)) {
        if (date < debut) continue;
        const { data, error } = await service.rpc('programmer_rappel_changement', {
          p_household: hid,
          p_date: date,
          p_parent_accueil: jour.apresMidi,
          p_heure: heure,
        });
        if (error) {
          soucis.push(`changement ${date} · ${error.message}`);
          continue;
        }
        bilan.changements += Number(data ?? 0);
      }
    }

    return reponseJSON({
      ...bilan,
      ...(soucis.length > 0 ? { soucis: soucis.slice(0, 20) } : {}),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error('[rappels]', message);
    return reponseJSON({ message: 'Programmation impossible pour le moment.' }, 502);
  }
}

/** Vercel Cron : seul CRON_SECRET autorise le traitement global. */
export async function GET(requete: Request) {
  if (!autoriseCron(requete)) {
    return reponseJSON({ message: 'Non autorisé.' }, 401);
  }

  const service = supabaseService();
  if (!service) {
    return reponseJSON({ message: 'Clé de service absente : programmation impossible.' }, 503);
  }

  const { data, error } = await service
    .from('households')
    .select('id')
    .is('deleted_at', null);

  if (error) return reponseJSON({ message: 'Impossible de charger les foyers.' }, 502);
  return traiterFoyers((data ?? []).map((foyer) => foyer.id as string));
}

/** Déclenchement manuel : uniquement le foyer du membre connecté. */
export async function POST() {
  const householdId = await foyerDuMembre();
  if (!householdId) {
    return reponseJSON({ message: 'Connectez-vous pour programmer vos rappels.' }, 401);
  }
  return traiterFoyers([householdId]);
}
