import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { lireParametresPlateforme } from '@/lib/marketing/depot';
import { publierContenu } from '@/lib/marketing/publication';

/**
 * Publication planifiée.
 *
 * Le réglage « automatique » existait en base et dans l'interface depuis la
 * migration 00045, mais aucune tâche ne le lisait : le basculer ne changeait
 * rien, et seule la route d'administration — qui exige une session et un
 * accord explicite — pouvait publier. Le mode automatique promettait donc une
 * diffusion que rien n'exécutait.
 *
 * Cette route est la pièce manquante. Elle ne décide de rien : elle constate
 * qu'un contenu est arrivé à échéance, que sa plateforme est en service et en
 * mode automatique, et elle publie. Tout le reste — l'arrêt d'urgence, la
 * réservation, l'idempotence — reste dans les modules existants.
 *
 * Un seul contenu par plateforme et par exécution. Rattraper un retard en
 * publiant six fois d'affilée ferait chuter la portée de chacun et
 * ressemblerait à du spam : mieux vaut un retard visible qu'une rafale.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PLATEFORMES = ['instagram', 'facebook'] as const;

/** Nombre de contenus en retard examinés avant d'abandonner pour ce tour. */
const PROFONDEUR = 5;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

interface Rapport {
  plateforme: string;
  publie: boolean;
  reference?: string;
  motif?: string;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) return new NextResponse('Not found', { status: 404 });

  const service = supabaseService();
  if (!service) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const rapports: Rapport[] = [];

  for (const plateforme of PLATEFORMES) {
    const reglages = await lireParametresPlateforme(plateforme);

    if (!reglages?.actif) {
      rapports.push({ plateforme, publie: false, motif: 'Canal hors service.' });
      continue;
    }
    if (reglages.mode !== 'automatique') {
      rapports.push({ plateforme, publie: false, motif: 'Mode validation : publication manuelle.' });
      continue;
    }

    // Les contenus rejetés ne remontent jamais : un refus doit tenir, y
    // compris quand la tâche cherche de quoi publier.
    const { data: dus } = await service
      .from('marketing_contenus')
      .select('reference, prevu_le')
      .in('statut', ['en_attente', 'valide'])
      .lte('prevu_le', aujourdhui)
      .order('prevu_le', { ascending: true })
      .limit(PROFONDEUR);

    if (!dus || dus.length === 0) {
      rapports.push({ plateforme, publie: false, motif: 'Aucun contenu à échéance.' });
      continue;
    }

    let fait = false;
    let derniereErreur = '';

    for (const contenu of dus) {
      const r = await publierContenu(contenu.reference, plateforme, 0);

      if (r.ok) {
        rapports.push({ plateforme, publie: true, reference: contenu.reference });
        fait = true;
        break;
      }

      // Déjà publié sur ce canal : ce n'est pas une erreur, c'est la garantie
      // d'idempotence qui joue. On passe au contenu suivant.
      if (r.dejaPublie) continue;

      derniereErreur = r.erreur ?? 'Échec sans message.';
      break;
    }

    if (!fait) {
      rapports.push({
        plateforme,
        publie: false,
        motif: derniereErreur || 'Tous les contenus à échéance sont déjà publiés.',
      });
    }
  }

  return NextResponse.json({ jour: aujourdhui, rapports });
}
