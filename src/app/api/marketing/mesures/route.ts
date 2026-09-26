import { NextResponse } from 'next/server';
import { releverMesures } from '@/lib/marketing/releve';

/**
 * Relevé des statistiques Meta, en tâche planifiée.
 *
 * La mécanique vit dans « releverMesures » : elle est aussi déclenchée depuis
 * l'écran d'administration, où le motif d'échec est affiché au lieu d'être
 * enfoui dans des journaux effacés au bout d'une heure.
 *
 * Chaque passage ajoute un relevé plutôt que d'écraser le précédent : la
 * portée continue de monter plusieurs jours après la mise en ligne, et n'en
 * garder que la dernière valeur interdirait de distinguer un contenu qui monte
 * vite d'un contenu qui monte longtemps.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) return new NextResponse('Not found', { status: 404 });

  const rapport = await releverMesures();

  if (rapport.bloquant) {
    return NextResponse.json({ message: rapport.bloquant }, { status: 503 });
  }

  // Un relevé qui échoue partout renvoie quand même 200 : sans cette trace,
  // une table vide ne dit pas si Meta a refusé ou si rien n'était à relever.
  console.info('[mesures]', JSON.stringify(rapport));
  return NextResponse.json(rapport);
}
