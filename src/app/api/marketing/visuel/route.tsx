import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { contenuDeReference, rendreVisuel } from '@/lib/marketing/rendu';

/**
 * Relecture d'un visuel par l'exploitant.
 *
 * Réservée à l'administrateur : produire une image consomme du calcul, et une
 * route ouverte deviendrait un moyen commode d'épuiser le quota de fonctions.
 * Pour la publication, c'est la route signée qui sert — Meta n'a pas de
 * session.
 */
export const dynamic = 'force-dynamic';

export async function GET(requete: Request) {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) {
    // Même réponse qu'une route inexistante : rien n'indique à un visiteur
    // qu'il existe ici quelque chose à forcer.
    return new NextResponse('Not found', { status: 404 });
  }

  const url = new URL(requete.url);
  const reference = url.searchParams.get('ref') ?? '';
  const page = Number(url.searchParams.get('page') ?? '0');
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

  const contenu = contenuDeReference(reference, base);
  if (!contenu || !contenu.pages[page]) return new NextResponse('Not found', { status: 404 });

  return rendreVisuel(contenu, page);
}
