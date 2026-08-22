import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { nettoyerValeur } from '@/lib/marketing/utm';

export const dynamic = 'force-dynamic';

const ETAPES = ['commence', 'termine', 'clic_inscription'];

/**
 * Compteur agrégé du quiz. Aucune réponse, identité, adresse IP ou donnée
 * concernant les enfants n'est transmise ni enregistrée.
 */
export async function POST(requete: Request) {
  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ compte: false }, { status: 400 });
  }

  const recu = corps as Record<string, unknown>;
  if (typeof recu.etape !== 'string' || !ETAPES.includes(recu.etape)) {
    return NextResponse.json({ compte: false }, { status: 400 });
  }

  const source = nettoyerValeur(typeof recu.source === 'string' ? recu.source : '') || 'site';
  const campagne = nettoyerValeur(typeof recu.campagne === 'string' ? recu.campagne : '') || 'quiz';
  const contenu = nettoyerValeur(typeof recu.contenu === 'string' ? recu.contenu : '') || 'quiz-resultat';
  const service = supabaseService();
  if (!service) return NextResponse.json({ compte: false });

  const { error } = await service.rpc('compter_etape_quiz', {
    p_etape: recu.etape,
    p_source: source,
    p_campagne: campagne,
    p_contenu: contenu,
  });
  return NextResponse.json({ compte: !error });
}
