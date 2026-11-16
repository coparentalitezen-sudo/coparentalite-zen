import { NextResponse } from 'next/server';
import { executerHebdo } from '@/lib/copilote/hebdo';

/**
 * Copilote business — passage hebdomadaire du lundi.
 *
 * Exécuté après le bilan marketing (5 h 30), pour que le rapport cite les
 * contenus les mieux mesurés. Analyse les ventes importées, enregistre les
 * propositions de la semaine et envoie le rapport par courriel une fois.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) {
    return NextResponse.json({ message: 'Non autorisé.' }, { status: 401 });
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const resultat = await executerHebdo({
    courriel: 'si_pas_encore',
    lienAdmin: new URL('/admin/propositions', base).toString(),
    base,
  });
  return NextResponse.json(resultat, { status: resultat.ok ? 200 : 503 });
}
