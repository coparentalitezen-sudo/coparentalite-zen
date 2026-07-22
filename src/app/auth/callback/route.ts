import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Retour des liens e-mail Supabase (confirmation d'adresse, réinitialisation).
 * Échange le code contre une session puis redirige.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const suite = searchParams.get('suite') ?? '/app/accueil';
  const supabase = await supabaseServer();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${suite}`);
  }
  return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
}
