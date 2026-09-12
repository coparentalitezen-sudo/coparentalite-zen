import { NextResponse } from 'next/server';
import { configurationPrete, statistiquesInstagram } from '@/lib/marketing/meta';
import { publicationsAMesurer, enregistrerMesure } from '@/lib/marketing/depot';

/**
 * Relevé des statistiques Meta.
 *
 * La table des mesures existait depuis la migration 00041 et est restée vide :
 * rien n'appelait « statistiquesInstagram », et l'écran d'administration
 * affichait donc une portée inconnue pour chaque contenu. Le dispositif
 * publiait sans jamais savoir ce que ses publications avaient produit.
 *
 * Chaque passage ajoute un relevé plutôt que d'écraser le précédent : la
 * portée continue de monter plusieurs jours après la mise en ligne, et n'en
 * garder que la dernière valeur interdirait de distinguer un contenu qui monte
 * vite d'un contenu qui monte longtemps.
 *
 * Une publication dont les statistiques échouent n'interrompt pas le relevé
 * des autres : une publication supprimée à la main sur Instagram ne doit pas
 * priver la semaine entière de ses mesures.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Publications relevées par passage, pour tenir dans la durée d'exécution. */
const PLAFOND = 25;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) return new NextResponse('Not found', { status: 404 });

  const prete = await configurationPrete();
  if (!prete.ok) {
    return NextResponse.json({ message: prete.erreur }, { status: 503 });
  }
  const config = prete.donnees!;

  const publications = (await publicationsAMesurer()).slice(0, PLAFOND);

  let releves = 0;
  const echecs: { reference: string; erreur: string }[] = [];

  for (const publication of publications) {
    const r = await statistiquesInstagram(config, publication.metaMediaId);

    if (!r.ok) {
      echecs.push({ reference: publication.reference, erreur: r.erreur ?? 'inconnue' });
      continue;
    }

    const m = r.donnees ?? {};
    const somme = (...noms: string[]) => {
      const presentes = noms.filter((n) => typeof m[n] === 'number');
      if (presentes.length === 0) return null;
      return presentes.reduce((total, n) => total + m[n], 0);
    };

    const ok = await enregistrerMesure(publication.id, {
      portee: typeof m.reach === 'number' ? m.reach : null,
      vues: typeof m.views === 'number' ? m.views : null,
      interactions: somme('likes', 'comments', 'saved'),
    });

    if (ok) releves += 1;
    else echecs.push({ reference: publication.reference, erreur: 'Écriture refusée.' });
  }

  return NextResponse.json({
    examinees: publications.length,
    releves,
    echecs,
  });
}
