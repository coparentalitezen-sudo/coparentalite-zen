import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { estRobot } from '@/lib/marketing/utm';
import { lireContenuParReference } from '@/lib/copilote/depot-contenus';

/**
 * Lien suivi d'une publication produit : compte le clic, puis renvoie vers la
 * fiche (Etsy, Payhip…).
 *
 * Même comptage que les visites de l'application (compter_visite) : un
 * compteur par jour, source et publication, sans identifiant ni adresse IP —
 * donc sans bandeau de consentement. Les robots qui vérifient les liens ne
 * comptent pas.
 *
 * Un compteur qui échoue ne bloque jamais la redirection : le visiteur doit
 * arriver sur la fiche quoi qu'il arrive à la mesure.
 */
export const dynamic = 'force-dynamic';

const SOURCES = new Set(['instagram', 'facebook', 'pinterest']);

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const contenu = await lireContenuParReference(reference);
  const destination = contenu?.produit.url;
  if (!contenu || !destination || !/^https:\/\//.test(destination)) {
    return NextResponse.redirect(new URL('/', base), 302);
  }

  const brute = new URL(requete.url).searchParams.get('s') ?? '';
  const source = SOURCES.has(brute) ? brute : 'autre';
  const robot = estRobot(requete.headers.get('user-agent'), requete.headers.get('accept-language'));
  const service = robot ? null : supabaseService();
  if (service) {
    const { error } = await service.rpc('compter_visite', {
      p_source: source, p_campagne: 'boutique', p_contenu: reference,
    });
    if (error) console.error('[copilote] clic non compté', reference, error.message);
  }

  return NextResponse.redirect(destination, 302);
}
