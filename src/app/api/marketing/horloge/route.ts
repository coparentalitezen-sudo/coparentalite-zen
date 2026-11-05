import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { enregistrerSemaine } from '@/lib/marketing/depot';
import { executerPublicationPlanifiee } from '@/lib/marketing/planification';
import { executerPublicationYoutube } from '@/lib/youtube/publication';
import { envoyerAlertesEnAttente } from '@/lib/marketing/alertes';
import { programmerRecapitulatif } from '@/lib/marketing/recapitulatif';
import { heureParis, jourParis, jourSemaineParis } from '@/lib/marketing/horaire';
import { semaineIso } from '@/lib/marketing/generateur';

/**
 * Horloge de la publication automatique, appelée toutes les heures par
 * GitHub Actions (.github/workflows/horloge-publication.yml) : l'offre Hobby
 * de Vercel ne permet qu'un passage quotidien par tâche, et l'heure de
 * publication doit être réglable depuis l'administration.
 *
 * Chaque passage :
 *   1. enregistre les contenus de cette semaine et de la suivante (le rendu
 *      des Reels a besoin de les connaître à l'avance) ;
 *   2. publie YouTube, puis Instagram et Facebook — chacun ne part que si son
 *      heure est atteinte, son interrupteur allumé et sa vidéo contrôlée ;
 *      une plateforme en échec n'empêche pas les autres ;
 *   3. le lundi à partir de 8 h, prépare le récapitulatif de la semaine ;
 *   4. envoie les alertes en attente.
 *
 * Protégée par CRON_SECRET, comme les autres tâches. Sans lui : 404.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

const sur = async <T,>(f: () => Promise<T>): Promise<T | { erreur: string }> => {
  try { return await f(); } catch (e) { return { erreur: e instanceof Error ? e.message : String(e) }; }
};

export async function GET(requete: Request) {
  if (!autorise(requete)) return new NextResponse('Not found', { status: 404 });
  const service = supabaseService();
  if (!service) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const maintenant = new Date();
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const semaines = await sur(async () => {
    await enregistrerSemaine(maintenant, base);
    await enregistrerSemaine(new Date(maintenant.getTime() + 7 * 86_400_000), base);
    return 'ok';
  });
  const youtube = await sur(() => executerPublicationYoutube({ maintenant }));
  const meta = await sur(() => executerPublicationPlanifiee());
  let recapitulatif: unknown = null;
  if (jourSemaineParis(maintenant) === 1 && heureParis(maintenant) >= 8) {
    recapitulatif = await sur(() => programmerRecapitulatif(service, jourParis(maintenant),
      `${maintenant.getFullYear()}s${String(semaineIso(maintenant)).padStart(2, '0')}`));
  }
  const alertes = await sur(() => envoyerAlertesEnAttente(service));
  return NextResponse.json({ heure: heureParis(maintenant), semaines, youtube, meta, recapitulatif, alertes });
}
