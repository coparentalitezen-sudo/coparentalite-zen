import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { Plus } from '@/components/plus';

/**
 * Écran « Plus ».
 *
 * Rendu à la demande : il montre une entrée de plus à l'exploitant du service.
 * Un rendu statique servirait la même page à tout le monde, ce qui reviendrait
 * soit à cacher l'entrée à qui y a droit, soit à la montrer à tous.
 */
export const dynamic = 'force-dynamic';

export default async function PagePlus() {
  const supabase = await supabaseServer();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  return <Plus estAdministrateur={estAdministrateur(data.user?.email)} />;
}
