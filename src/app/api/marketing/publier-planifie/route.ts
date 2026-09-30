import { NextResponse } from 'next/server';
import { executerPublicationPlanifiee } from '@/lib/marketing/planification';

/**
 * Publication planifiée, en tâche quotidienne.
 *
 * La mécanique vit dans « executerPublicationPlanifiee » : elle est aussi
 * déclenchée depuis l'écran d'administration, et chaque exécution laisse son
 * rapport en base. Les journaux de l'hébergeur sont effacés au bout d'une
 * heure : une chaîne qui s'arrête à 9h y devient indéchiffrable avant midi.
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

  const rapport = await executerPublicationPlanifiee();
  if (rapport.motif === 'Service indisponible.') {
    return NextResponse.json({ message: rapport.motif }, { status: 503 });
  }
  return NextResponse.json(rapport);
}
