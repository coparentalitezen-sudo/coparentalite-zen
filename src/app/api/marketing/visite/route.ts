import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { nettoyerValeur } from '@/lib/marketing/utm';

/**
 * Comptage d'une arrivée depuis un contenu publié.
 *
 * Route publique par nécessité : elle est appelée par le navigateur d'un
 * visiteur qui n'a pas de compte. Trois protections tiennent lieu de
 * contrôle d'accès :
 *   * les valeurs sont normalisées avant d'atteindre la base — jeu de
 *     caractères restreint, longueur bornée ;
 *   * la fonction appelée ne sait qu'incrémenter un compteur ; elle ne peut
 *     ni lire, ni écrire ailleurs ;
 *   * aucune donnée personnelle n'est enregistrée, donc rien n'est
 *     divulgable en cas d'abus.
 *
 * Reste un risque assumé : quelqu'un pourrait gonfler un compteur. Cela
 * fausserait un tableau de bord, sans conséquence pour les parents ni pour
 * leurs données. Le prix d'une protection plus lourde — jeton, empreinte —
 * serait précisément la collecte que ce dispositif évite.
 */
export const dynamic = 'force-dynamic';

export async function POST(requete: Request) {
  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ compte: false }, { status: 400 });
  }

  const recu = corps as Record<string, unknown>;
  const source = nettoyerValeur(typeof recu.source === 'string' ? recu.source : '');
  if (!source) {
    return NextResponse.json({ compte: false }, { status: 400 });
  }
  const campagne = nettoyerValeur(typeof recu.campagne === 'string' ? recu.campagne : '') || 'inconnue';
  const contenu = nettoyerValeur(typeof recu.contenu === 'string' ? recu.contenu : '') || 'inconnu';

  const service = supabaseService();
  // Sans clé de service, l'application fonctionne normalement : seule la
  // mesure manque. Un écran ne doit jamais échouer parce qu'un compteur
  // n'a pas pu s'incrémenter.
  if (!service) return NextResponse.json({ compte: false });

  const { error } = await service.rpc('compter_visite', {
    p_source: source, p_campagne: campagne, p_contenu: contenu,
  });

  return NextResponse.json({ compte: !error });
}
