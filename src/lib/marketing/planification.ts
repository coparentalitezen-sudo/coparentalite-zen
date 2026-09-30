import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { lireParametresPlateforme } from '@/lib/marketing/depot';
import { publierContenu } from '@/lib/marketing/publication';
import { publierReserve, type PlateformeMeta } from '@/lib/marketing/reserve';
import { assurerVisuelDuJour } from '@/lib/marketing/quotidien';

/**
 * Exécution de la publication planifiée.
 *
 * Extraite de la route parce qu'elle est appelée de deux endroits : la tâche
 * de 9h et un bouton d'administration. La raison de ce bouton est la même que
 * pour le relevé des mesures : le 30 septembre, la chaîne s'est arrêtée au
 * moment où elle devait basculer sur le visuel quotidien, et il a fallu
 * quatre jours pour s'en apercevoir. Le rapport partait dans les journaux de
 * l'hébergeur, effacés au bout d'une heure.
 *
 * Chaque exécution laisse donc sa trace en base, y compris — surtout — quand
 * elle ne publie rien.
 */

export interface RapportPlateforme {
  plateforme: string;
  publie: boolean;
  reference?: string;
  motif?: string;
}

export interface RapportPublication {
  jour: string;
  source: 'reserve' | 'quotidien' | 'generateur' | 'aucune';
  rapports: RapportPlateforme[];
  motif?: string;
}

const PLATEFORMES = ['instagram', 'facebook'] as const;

/** Nombre de contenus en retard examinés avant d'abandonner pour ce tour. */
const PROFONDEUR = 5;

/** Consigne le rapport, sans jamais faire échouer la publication pour autant. */
type ServiceSupabase = NonNullable<ReturnType<typeof supabaseService>>;

async function journaliser(
  service: ServiceSupabase,
  rapport: RapportPublication,
): Promise<void> {
  const { error } = await service.from('marketing_journal').insert({
    tache: 'publier-planifie',
    jour: rapport.jour,
    source: rapport.source,
    publie: rapport.rapports.some((r) => r.publie),
    rapport,
  });
  if (error) console.error('[publier-planifie] journal', error);
}

export async function executerPublicationPlanifiee(): Promise<RapportPublication> {
  const service: ServiceSupabase | null = supabaseService();
  if (!service) {
    return {
      jour: new Date().toISOString().slice(0, 10),
      source: 'aucune', rapports: [], motif: 'Service indisponible.',
    };
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const rapports: RapportPlateforme[] = [];

  // Quels canaux peuvent publier ce matin. Le calcul sert deux fois : à la
  // réserve, puis au générateur si la réserve est vide.
  const ouverts: PlateformeMeta[] = [];
  const fermes = new Map<PlateformeMeta, string>();

  for (const plateforme of PLATEFORMES) {
    const reglages = await lireParametresPlateforme(plateforme);
    if (!reglages?.actif) {
      fermes.set(plateforme, 'Canal hors service.');
    } else if (reglages.mode !== 'automatique') {
      fermes.set(plateforme, 'Mode validation : publication manuelle.');
    } else {
      ouverts.push(plateforme);
    }
  }

  // La réserve passe devant : un visuel déposé à la main est toujours plus
  // pertinent qu'une combinaison fabriquée. Si elle est vide, rien ne change.
  const issue = await publierReserve(service, ouverts);
  if (issue) {
    for (const plateforme of PLATEFORMES) {
      const etat = issue[plateforme];
      rapports.push({
        plateforme,
        publie: etat.publie,
        reference: etat.identifiant,
        motif: etat.publie ? undefined : (fermes.get(plateforme) ?? etat.motif),
      });
    }
    const rapport: RapportPublication = { jour: aujourdhui, source: 'reserve', rapports };
    await journaliser(service, rapport);
    return rapport;
  }

  // Après les visuels préparés à la main, une nouvelle histoire illustrée est
  // créée chaque jour, puis publiée par le même circuit que la réserve.
  // Une seconde exécution ce jour-là ne republie jamais cette histoire.
  if (ouverts.length > 0) {
    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
    const quotidien = await assurerVisuelDuJour(service, aujourdhui, base);
    if (quotidien === 'deja') {
      const rapport: RapportPublication = { jour: aujourdhui, source: 'quotidien', rapports: [],
        motif: 'Visuel du jour déjà traité.' };
      await journaliser(service, rapport);
      return rapport;
    }
    if (quotidien === 'echec') {
      rapports.push({ plateforme: 'quotidien', publie: false,
        motif: 'Visuel du jour non fabriqué.' });
    }
    if (quotidien === 'ajoute') {
      const nouvelleIssue = await publierReserve(service, ouverts);
      if (nouvelleIssue) {
        for (const plateforme of PLATEFORMES) {
          const etat = nouvelleIssue[plateforme];
          rapports.push({
            plateforme, publie: etat.publie, reference: etat.identifiant,
            motif: etat.publie ? undefined : (fermes.get(plateforme) ?? etat.motif),
          });
        }
        const rapport: RapportPublication = { jour: aujourdhui, source: 'quotidien', rapports };
        await journaliser(service, rapport);
        return rapport;
      }
    }
  }

  for (const plateforme of PLATEFORMES) {
    const ferme = fermes.get(plateforme);
    if (ferme) {
      rapports.push({ plateforme, publie: false, motif: ferme });
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

      // Un contenu qui ne peut pas être publié ne doit pas bloquer ceux qui
      // le suivent : un seul contenu défectueux en tête de file a suffi à
      // tout arrêter pendant neuf jours. On le signale et on continue.
      derniereErreur = `${contenu.reference} : ${r.erreur ?? 'échec sans message'}`;
      if (!r.metaId && r.erreur === 'Contenu ou planche introuvable.') continue;

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

  // Le rapport part aussi dans les journaux : sans lui, un tour qui n'a rien
  // publié ne laisse aucune trace, et « rien n'est parti » reste inexplicable.
  const rapport: RapportPublication = { jour: aujourdhui, source: 'generateur', rapports };
  await journaliser(service, rapport);
  return rapport;
}
