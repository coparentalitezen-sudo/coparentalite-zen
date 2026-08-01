import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { pushConfigure } from '@/lib/push';

/** Enregistre ou retire un appareil pour les notifications poussées. */
export const dynamic = 'force-dynamic';

function reponse(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function POST(requete: Request) {
  if (!pushConfigure()) {
    return reponse({ message: 'Les notifications poussées ne sont pas encore activées.' }, 503);
  }
  const supabase = await supabaseServer();
  if (!supabase) return reponse({ message: 'Service indisponible.' }, 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reponse({ message: 'Connectez-vous.' }, 401);

  let corps: {
    action?: 'abonner' | 'oublier';
    endpoint?: string; p256dh?: string; auth?: string; agent?: string;
  };
  try { corps = await requete.json(); }
  catch { return reponse({ message: 'Requête invalide.' }, 400); }

  if (!corps.endpoint) return reponse({ message: 'Abonnement incomplet.' }, 400);

  if (corps.action === 'oublier') {
    const { error } = await supabase.rpc('oublier_appareil_push', {
      p_endpoint: corps.endpoint,
    });
    if (error) return reponse({ message: error.message }, 400);
    return reponse({ abonne: false });
  }

  if (!corps.p256dh || !corps.auth) {
    return reponse({ message: 'Abonnement incomplet.' }, 400);
  }
  const { error } = await supabase.rpc('enregistrer_appareil_push', {
    p_endpoint: corps.endpoint,
    p_p256dh: corps.p256dh,
    p_auth: corps.auth,
    p_agent: corps.agent ?? null,
  });
  if (error) return reponse({ message: error.message }, 400);
  return reponse({ abonne: true });
}
