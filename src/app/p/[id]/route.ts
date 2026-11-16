import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { estRobot } from '@/lib/marketing/utm';
import { lireLienFiche } from '@/lib/copilote/depot-contenus';

/**
 * Bouton « Voir sur Payhip / Etsy » de la page /boutique : compte le clic,
 * puis renvoie vers la fiche. Même comptage anonyme que /e/<référence>.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const destination = await lireLienFiche(id);
  if (!destination || !/^https:\/\//.test(destination)) {
    return NextResponse.redirect(new URL('/boutique', base), 302);
  }

  if (!estRobot(requete.headers.get('user-agent'), requete.headers.get('accept-language'))) {
    const service = supabaseService();
    if (service) {
      const { error } = await service.rpc('compter_visite', {
        p_source: 'site', p_campagne: 'boutique', p_contenu: `fiche-${id}`,
      });
      if (error) console.error('[copilote] clic boutique non compté', error.message);
    }
  }
  return NextResponse.redirect(destination, 302);
}
