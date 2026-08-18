import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { BANQUE } from '@/lib/marketing/banque';
import {
  classer, urlConsultations, totaliserConsultations, ARTICLES, type SignauxNiche,
} from '@/lib/marketing/detection';

/**
 * Détection hebdomadaire des micro-niches.
 *
 * Interroge les sources publiques, agrège nos propres mesures, classe les
 * quinze sujets et enregistre le résultat. Le classement sert ensuite à
 * décider quels sujets traiter en priorité.
 *
 * Tolérante aux pannes par construction : une source indisponible n'interrompt
 * pas la tâche, elle laisse simplement sa composante à zéro. Une détection
 * partielle vaut mieux qu'une détection qui échoue entièrement parce qu'un
 * service tiers était en maintenance.
 */
function reponseJSON(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

/** Consultations Wikipédia des trente derniers jours, par niche. */
async function consultationsParNiche(): Promise<Record<string, number | null>> {
  const fin = new Date();
  fin.setDate(fin.getDate() - 2); // l'API accuse un ou deux jours de retard
  const debut = new Date(fin);
  debut.setDate(debut.getDate() - 30);

  // Les articles se répètent d'une niche à l'autre : deux niches peuvent
  // partager « Pension_alimentaire ». On n'interroge chaque article qu'une
  // fois, par courtoisie envers une API gratuite.
  const articles = [...new Set(Object.values(ARTICLES))];
  const parArticle: Record<string, number | null> = {};

  await Promise.all(articles.map(async (article) => {
    try {
      const reponse = await fetch(urlConsultations(article, debut, fin), {
        headers: {
          // La Wikimedia Foundation demande un agent identifiable. S'en
          // dispenser expose à un blocage, et le blocage serait mérité.
          'User-Agent': 'CoparentaliteZen/1.0 (https://coparentalitezen.fr)',
          Accept: 'application/json',
        },
      });
      parArticle[article] = reponse.ok
        ? totaliserConsultations(await reponse.json())
        : null;
    } catch {
      parArticle[article] = null;
    }
  }));

  const parNiche: Record<string, number | null> = {};
  for (const [niche, article] of Object.entries(ARTICLES)) {
    parNiche[niche] = parArticle[article] ?? null;
  }
  return parNiche;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) {
    return reponseJSON({ message: 'Non autorisé.' }, 401);
  }

  const service = supabaseService();
  if (!service) return reponseJSON({ message: 'Service indisponible.' }, 503);

  const consultations = await consultationsParNiche();

  // Nos propres mesures : contenus publiés par niche, et clics reçus. Les
  // clics sont rattachés au contenu par la référence, qui sert aussi de
  // valeur utm_content — d'où l'absence de table de correspondance.
  const [{ data: contenus }, { data: visites }, { data: inscrits }] = await Promise.all([
    service.from('marketing_contenus')
      .select('reference, statut, marketing_opportunites(niche_id)')
      .eq('statut', 'publie'),
    service.from('marketing_visites').select('contenu, clics'),
    service.from('profiles').select('origine_contenu').not('origine_contenu', 'is', null),
  ]);

  const nicheParReference: Record<string, string> = {};
  for (const c of contenus ?? []) {
    const lien = c.marketing_opportunites as unknown as { niche_id?: string } | null;
    if (c.reference && lien?.niche_id) nicheParReference[c.reference] = lien.niche_id;
  }

  const signaux: Record<string, SignauxNiche> = {};
  const pour = (niche: string): SignauxNiche => (signaux[niche] ??= {
    consultations: consultations[niche] ?? null,
    publies: 0, clics: 0, inscriptions: 0, saisonProche: false,
  });

  for (const niche of Object.values(nicheParReference)) pour(niche).publies += 1;
  for (const v of visites ?? []) {
    const niche = nicheParReference[v.contenu];
    if (niche) pour(niche).clics += v.clics ?? 0;
  }
  for (const p of inscrits ?? []) {
    const niche = p.origine_contenu ? nicheParReference[p.origine_contenu] : undefined;
    if (niche) pour(niche).inscriptions += 1;
  }
  for (const niche of Object.keys(consultations)) pour(niche);

  const mois = new Date().getMonth() + 1;
  const rangs = classer(BANQUE, signaux, mois);
  const detecteeLe = new Date().toISOString().slice(0, 10);

  // Une opportunité par sujet et par semaine : le même sujet détecté en
  // semaine 34 puis en semaine 40 répond à deux relevés distincts, dont les
  // scores se comparent dans le temps.
  let enregistrees = 0;
  for (const { sujet, score } of rangs) {
    const { error } = await service.from('marketing_opportunites').upsert({
      reference: `detection-${detecteeLe}-${sujet.niche}`,
      niche_id: sujet.niche,
      probleme: sujet.probleme,
      intention: sujet.intention,
      angle: sujet.angle,
      fonctionnalite: sujet.fonctionnalite,
      score: score.total,
      details_score: { ...score.details, provisoire: score.provisoire },
      source: score.provisoire
        ? 'Wikimédia Pageviews + calendrier scolaire officiel (performance non fiable)'
        : 'Wikimédia Pageviews + calendrier scolaire officiel + mesures internes',
      source_url: 'https://wikimedia.org/api/rest_v1/',
      detectee_le: detecteeLe,
      statut: 'idee',
    }, { onConflict: 'reference', ignoreDuplicates: false });
    if (!error) enregistrees += 1;
  }

  const sourcesEnPanne = Object.entries(consultations)
    .filter(([, v]) => v === null).map(([niche]) => niche);

  return reponseJSON({
    detectee_le: detecteeLe,
    niches_classees: rangs.length,
    opportunites_enregistrees: enregistrees,
    // Signalé et non tu : un classement calculé sans sa principale source
    // extérieure ne vaut pas un classement complet, et le tableau de bord doit
    // pouvoir le dire.
    sources_indisponibles: sourcesEnPanne,
    tete_de_classement: rangs.slice(0, 3).map((r) => ({
      niche: r.sujet.niche, score: r.score.total, provisoire: r.score.provisoire,
    })),
  });
}
