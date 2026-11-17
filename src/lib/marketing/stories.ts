import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { lireParametresPlateforme, publicationAutorisee } from './depot';
import { configurationPrete, publierStoryInstagram, publierStoryFacebook } from './meta';
import { urlStoryPublic } from './signature';
import { heureParis, jourParis } from './horaire';
import { signaler } from './alertes';
import { etatStory, heureStory, type PlateformeStory } from './stories-regles';

/**
 * Story du jour sur Instagram et Facebook.
 *
 * Appelée à chaque passage de l'horloge. Pour chaque plateforme : même
 * interrupteur que les publications (arrêt d'urgence compris), mode
 * automatique, heure réglée + 3 h atteinte, pas encore faite aujourd'hui.
 * L'image est la couverture du contenu du jour (accroche), en 1080 × 1920.
 * Chaque essai est consigné dans marketing_journal (tâche « story »).
 */
export interface RapportStory {
  plateforme: PlateformeStory;
  publie: boolean;
  reference?: string;
  motif?: string;
}

export interface RapportStories {
  jour: string;
  rapports: RapportStory[];
  motif?: string;
}

const PLATEFORMES: PlateformeStory[] = ['instagram', 'facebook'];

export async function executerStoriesDuJour(maintenant = new Date()): Promise<RapportStories> {
  const jour = jourParis(maintenant);
  const service = supabaseService();
  if (!service) return { jour, rapports: [], motif: 'Service indisponible.' };

  // Ce qui reste à faire, avant tout appel coûteux.
  const { data: journal } = await service.from('marketing_journal')
    .select('source, publie').eq('tache', 'story').eq('jour', jour);
  const candidates: PlateformeStory[] = [];
  const rapports: RapportStory[] = [];
  for (const plateforme of PLATEFORMES) {
    const etat = etatStory(journal ?? [], plateforme);
    if (etat !== 'a_faire') { rapports.push({ plateforme, publie: false, motif: etat === 'faite' ? 'deja' : 'abandon' }); continue; }
    const reglages = await lireParametresPlateforme(plateforme);
    if (!reglages?.actif) { rapports.push({ plateforme, publie: false, motif: 'Canal hors service.' }); continue; }
    if (reglages.mode !== 'automatique') { rapports.push({ plateforme, publie: false, motif: 'Mode validation.' }); continue; }
    if (heureParis(maintenant) < heureStory(reglages.heure)) {
      rapports.push({ plateforme, publie: false, motif: `Story à partir de ${heureStory(reglages.heure)} h.` });
      continue;
    }
    candidates.push(plateforme);
  }
  if (candidates.length === 0) return { jour, rapports };

  const { data: contenu } = await service.from('marketing_contenus')
    .select('reference').eq('prevu_le', jour).neq('statut', 'rejete')
    .order('reference').limit(1).maybeSingle();
  if (!contenu) return { jour, rapports, motif: 'Aucun contenu prévu aujourd’hui.' };

  const prete = await configurationPrete();
  if (!prete.ok) return { jour, rapports, motif: prete.erreur };
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const url = urlStoryPublic(base, contenu.reference);
  if (!url) return { jour, rapports, motif: 'Visuel non signable : CRON_SECRET manquant.' };

  for (const plateforme of candidates) {
    const autorisation = await publicationAutorisee(plateforme);
    if (!autorisation.autorisee) {
      rapports.push({ plateforme, publie: false, reference: contenu.reference, motif: autorisation.motif });
      continue;
    }
    const r = plateforme === 'instagram'
      ? await publierStoryInstagram(prete.donnees!, url)
      : await publierStoryFacebook(prete.donnees!, url);
    const donnees = r.donnees as { id?: string; post_id?: string } | undefined;
    const rapport: RapportStory = {
      plateforme, publie: r.ok, reference: contenu.reference,
      motif: r.ok ? undefined : (r.erreur ?? 'échec sans message'),
    };
    rapports.push(rapport);
    await service.from('marketing_journal').insert({
      tache: 'story', jour, source: plateforme, publie: r.ok,
      rapport: { ...rapport, metaId: donnees?.post_id ?? donnees?.id ?? null },
    });
    if (!r.ok && etatStory([...(journal ?? []), { source: plateforme, publie: false }], plateforme) === 'abandon') {
      await signaler(service, {
        cle: `echec-story:${jour}:${plateforme}`, niveau: 'echec',
        sujet: `${plateforme} : story du jour non publiée`,
        message: `${contenu.reference} — ${rapport.motif}`,
      });
    }
  }
  return { jour, rapports };
}
