import { NextResponse } from 'next/server';
import { executerBouclePinterest, inspecterEpingles } from '@/lib/marketing/stats-collecte';

/**
 * Boucle d'amélioration Pinterest — déclenchement manuel.
 *
 * Non planifiée dans vercel.json : sur le compte Hobby de ce projet, qui
 * déclare déjà six tâches planifiées, la boucle Pinterest s'exécute plutôt à
 * la fin de la route bilan (voir stats-collecte.ts::executerBouclePinterest).
 * Cette route reste utile pour un déclenchement manuel, notamment le premier
 * appel réel : ?dry_run=1 renvoie les réponses brutes de l'API Pinterest sans
 * rien écrire en base, pour vérifier leur forme avant de faire confiance aux
 * chiffres qu'en tire une collecte normale (voir stats-collecte.ts,
 * inspecterEpingles).
 *
 * Il n'existe pas d'infrastructure de script Node dans ce dépôt — seulement
 * des routes Next.js et deux scripts Python indépendants (scripts/*.py) —
 * d'où ce mode en paramètre de requête plutôt qu'un flag de ligne de commande.
 */
function reponseJSON(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) return reponseJSON({ message: 'Non autorisé.' }, 401);

  if (new URL(requete.url).searchParams.get('dry_run') === '1') {
    const inspection = await inspecterEpingles();
    if (!inspection.configure) {
      return reponseJSON({ message: 'Pinterest n’est pas configuré (PINTEREST_ACCESS_TOKEN absent).' }, 503);
    }
    return reponseJSON({ dry_run: true, ...inspection });
  }

  const resultat = await executerBouclePinterest();
  if (!resultat.configure) {
    return reponseJSON({ message: 'Pinterest n’est pas configuré (PINTEREST_ACCESS_TOKEN absent).' }, 503);
  }

  return reponseJSON({
    epingles_decouvertes: resultat.decouverte?.epinglesTrouvees ?? 0,
    erreur_decouverte: resultat.decouverte?.erreur,
    epingles_mesurees: resultat.collecte?.epinglesMesurees ?? 0,
    echecs_collecte: resultat.collecte?.echecs ?? 0,
    erreur_collecte: resultat.collecte?.erreur,
    nb_pins_pour_apprentissage: resultat.nbPins,
    learnings_enregistres: resultat.learningsEnregistres,
    bloc: resultat.bloc,
  });
}
