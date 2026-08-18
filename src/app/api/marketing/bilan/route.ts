import { NextResponse } from 'next/server';
import { lireMesures, lirePoids, ecrirePoids, enregistrerBilan } from '@/lib/marketing/depot';
import { performances, regrouper } from '@/lib/marketing/mesures';
import { ajusterPoids, redigerBilan } from '@/lib/marketing/bilan';
import { semaineIso } from '@/lib/marketing/generateur';

/**
 * Boucle d'amélioration hebdomadaire.
 *
 * Relève les performances, ajuste les poids des micro-niches, rédige un bilan
 * d'une page et l'enregistre.
 *
 * Exécutée après la détection du lundi matin, de sorte que les poids ajustés
 * s'appliquent à la production de la semaine qui commence, et non à celle qui
 * vient de s'écouler.
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

  const donnees = await lireMesures();
  if (!donnees) return reponseJSON({ message: 'Service indisponible.' }, 503);

  const lignes = performances(donnees.contenus, donnees.visites, donnees.originesInscrits);
  const parNiche = regrouper(lignes, 'niche');
  const poidsActuels = await lirePoids();
  const ajustements = ajusterPoids(parNiche, poidsActuels);

  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);
  const semaine = `${maintenant.getFullYear()}s${String(semaineIso(maintenant)).padStart(2, '0')}`;

  const appliques = await ecrirePoids(ajustements, jour);

  const texte = redigerBilan({
    semaine,
    contenusPublies: donnees.contenus.filter((c) => c.statut === 'publie').length,
    clics: lignes.reduce((s, l) => s + l.clics, 0),
    inscriptions: lignes.reduce((s, l) => s + l.inscriptions, 0),
    parNiche,
    // Seuls les ajustements réellement écrits figurent au bilan : annoncer une
    // décision qui a échoué en base rendrait le compte rendu faux.
    ajustements: ajustements.slice(0, appliques),
    sourcesIndisponibles: [],
  });

  const enregistre = await enregistrerBilan(semaine, texte, {
    ajustements, appliques, parNiche,
  });

  return reponseJSON({
    semaine,
    ajustements_decides: ajustements.length,
    ajustements_appliques: appliques,
    bilan_enregistre: enregistre,
    texte,
  });
}
