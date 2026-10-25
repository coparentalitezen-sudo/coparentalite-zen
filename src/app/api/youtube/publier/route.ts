import { NextResponse } from 'next/server';
import { executerPublicationYoutube, releverYoutube } from '@/lib/youtube/publication';

/**
 * Tâche quotidienne des YouTube Shorts.
 *
 * Déclarée deux fois dans vercel.json (matin et fin d'après-midi) : l'offre
 * Hobby n'autorise qu'une exécution par jour et par tâche, et le second
 * passage sert de rattrapage. Il ne republie jamais : si le Short du jour est
 * déjà en ligne, il s'arrête net.
 *
 * Séparée de /api/marketing/publier-planifie : une panne YouTube ne doit pas
 * priver Instagram et Facebook de leur publication, ni l'inverse.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) return new NextResponse('Not found', { status: 404 });
  const rapport = await executerPublicationYoutube();
  const releve = await releverYoutube();
  return NextResponse.json({ rapport, releve });
}
