import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';
import { buildDayMap, journeesPartagees } from '@/lib/custody';

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
 * Programmation quotidienne des rappels.
 *
 * Trois familles de rappels :
 *   * rendez-vous à venir, avec les affaires restant à préparer ;
 *   * début et fin des périodes de vacances ;
 *   * changements de garde, calculés par le moteur de planning.
 *
 * Ce dernier point justifie que la tâche vive ici plutôt qu'en base : le
 * moteur qui calcule qui a les enfants quel jour est en TypeScript, éprouvé
 * par ses tests. Le réécrire en SQL créerait deux vérités concurrentes.
 *
 * L'opération est rejouable : la base rejette les rappels déjà programmés à
 * la même heure. Sans cela, un rendez-vous produirait un rappel par jour
 * jusqu'à sa date.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

interface Foyer {
  id: string;
  pattern: string;
  start_date: string;
  starting_parent: string;
  config: { parent2?: string; custom_cycle?: ('P1' | 'P2')[] } | null;
  handover_time: string | null;
}

/**
 * Déclenchement manuel par un membre connecté.
 *
 * La tâche nocturne suffit en régime établi, mais un parent qui vient de créer
 * un rendez-vous doit pouvoir vérifier son rappel sans attendre 3 h du matin.
 * L'opération étant idempotente, la rejouer ne coûte rien.
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

export async function GET(requete: Request) {
  // Tâche planifiée Vercel, ou membre connecté depuis son navigateur
  if (!autorise(requete) && !(await autoriseMembre())) {
    return NextResponse.json(
      { message: 'Connectez-vous pour déclencher la programmation des rappels.' },
      { status: 401 },
    );
  }
  const service = supabaseService();
  if (!service) {
    return NextResponse.json(
      { message: 'Clé de service absente : programmation impossible.' },
      { status: 503 },
    );
  }

  const bilan = { foyers: 0, rendezVous: 0, vacances: 0, changements: 0, purges: 0 };
  const soucis: string[] = [];

  try {
    // Un foyer sans rythme de garde n'a pas de changement à annoncer, mais
    // peut avoir des rendez-vous : on parcourt donc tous les foyers actifs.
    const { data: foyers, error } = await service
      .from('households')
      .select('id')
      .is('deleted_at', null);
    if (error) throw new Error(error.message);

    for (const f of foyers ?? []) {
      const hid = f.id as string;
      bilan.foyers += 1;

      // ---- Rendez-vous et vacances : calculables en base ----
      for (const [fn, cle] of [
        ['programmer_rappels_rendez_vous', 'rendezVous'],
        ['programmer_rappels_vacances', 'vacances'],
        ['purger_rappels_obsoletes', 'purges'],
      ] as const) {
        const { data, error: e } = await service.rpc(fn, { p_household: hid });
        if (e) { soucis.push(`${fn} · ${e.message}`); continue; }
        bilan[cle] += Number(data ?? 0);
      }

      // ---- Changements de garde : calculés par le moteur de planning ----
      const { data: regles } = await service
        .from('custody_rules')
        .select('id, pattern, start_date, starting_parent, config, handover_time')
        .eq('household_id', hid).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1);

      const regle = (regles?.[0] ?? null) as Foyer | null;
      const parent2 = regle?.config?.parent2;
      if (!regle || !parent2) continue;

      // Fenêtre courte : les rappels lointains n'ont pas d'intérêt et
      // encombreraient la table.
      const aujourdhui = new Date();
      const debut = aujourdhui.toISOString().slice(0, 10);
      const fin = new Date(aujourdhui.getTime() + 14 * 86400000)
        .toISOString().slice(0, 10);

      const { data: exceptions } = await service
        .from('custody_exceptions')
        .select('kind, parent_id, starts_at, ends_at')
        .eq('household_id', hid).is('deleted_at', null)
        .lte('starts_at', `${fin}T23:59:59Z`)
        .gte('ends_at', `${debut}T00:00:00Z`);

      const { data: types } = await service
        .from('exception_types').select('code, priority');
      const priorite = new Map(
        (types ?? []).map((t) => [t.code as string, Number(t.priority)]),
      );

      const carte = buildDayMap(
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
        (exceptions ?? []).map((e) => ({
          startsOn: (e.starts_at as string).slice(0, 10),
          endsOn: (e.ends_at as string).slice(0, 10),
          parentId: e.parent_id as string,
          source: e.kind as string,
          priorite: priorite.get(e.kind as string) ?? 10,
        })),
      );

      const heure = regle.handover_time?.slice(0, 5) ?? null;
      for (const [date, jour] of journeesPartagees(carte, heure ?? '08:00')) {
        if (date < debut) continue;
        const { data, error: e } = await service.rpc('programmer_rappel_changement', {
          p_household: hid,
          p_date: date,
          p_parent_accueil: jour.apresMidi,
          p_heure: heure,
        });
        if (e) { soucis.push(`changement ${date} · ${e.message}`); continue; }
        bilan.changements += Number(data ?? 0);
      }
    }

    return reponseJSON({
      ...bilan,
      ...(soucis.length > 0 ? { soucis: soucis.slice(0, 10) } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[rappels]', message);
    return NextResponse.json(
      { message: 'Programmation impossible pour le moment.', cause: message },
      { status: 502 },
    );
  }
}
