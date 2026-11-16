/**
 * Rapport hebdomadaire : chiffres clés, ce qui a marché, trois actions.
 *
 * Construit à partir de l'analyse et des propositions, sans rien recalculer.
 * Les chiffres absents sont dits absents : « pas de données Payhip depuis 12
 * jours » vaut mieux qu'un zéro, qui se lirait « aucune vente ».
 */

import { MINIMUM_VENTES, type Analyse } from './analyse';
import { euros, type Propositions } from './propositions';
import { ecartJours, jourCourt } from './dates';
import { NOMS_PLATEFORMES } from './types';

const ventes = (n: number) => `${n} vente${n > 1 ? 's' : ''}`;

/** Au-delà, l'export d'une plateforme est jugé en retard. */
export const JOURS_AVANT_RELANCE = 8;

export interface ContenuPerformant {
  accroche: string;
  clics: number;
  inscriptions: number;
}

export interface Rapport {
  semaine: string;
  periode: { debut: string; fin: string };
  chiffres: {
    unites: number;
    unitesPrecedentes: number;
    evolution: number | null;
    commandes: number;
    ca: string;
    caPrecedent: string;
    panierMoyen: string;
    autresDevises: string[];
    parPlateforme: { plateforme: string; unites: number; ca: string }[];
  };
  reussites: string[];
  vigilance: string[];
  contenus: ContenuPerformant[];
  actions: string[];
  propositions: { idees: number; ameliorations: number };
}

export function construireRapport(entree: {
  semaine: string;
  analyse: Analyse;
  propositions: Propositions;
  contenus: ContenuPerformant[];
  /** Date du dernier import par plateforme (AAAA-MM-JJ). */
  derniersImports: Partial<Record<string, string>>;
  aujourdhui: string;
}): Rapport {
  const { analyse: a, propositions: p, aujourdhui } = entree;
  const devise = a.devise;

  // ---------- Ce qui a marché ----------
  const reussites: string[] = [];
  if (a.evolution !== null && a.evolution > 0) {
    reussites.push(`${ventes(a.semaine.unites)} cette semaine, soit ${a.evolution} % de plus que la précédente.`);
  }
  for (const f of a.produits.filter((x) => x.statut === 'moteur')) {
    reussites.push(`« ${f.titre} » : ${f.motif}`);
  }
  for (const f of a.produits.filter((x) => x.statut === 'en_hausse')) {
    reussites.push(`« ${f.titre} » en hausse : ${f.motif}`);
  }
  const top = entree.contenus[0];
  if (top) {
    reussites.push(`Contenu le plus cliqué : « ${top.accroche} » (${top.clics} clics, ${top.inscriptions} inscription${top.inscriptions > 1 ? 's' : ''}).`);
  }
  if (reussites.length === 0) {
    reussites.push(`Pas encore assez de données pour désigner un gagnant (il faut au moins ${MINIMUM_VENTES} ventes par produit).`);
  }

  // ---------- Points de vigilance ----------
  const vigilance: string[] = [];
  for (const f of a.produits.filter((x) => x.statut === 'stagne' || x.statut === 'faible_conversion')) {
    vigilance.push(`« ${f.titre} » : ${f.motif}`);
  }
  if (a.evolution !== null && a.evolution < 0) {
    vigilance.push(`${ventes(a.semaine.unites)} contre ${a.precedente.unites} la semaine précédente (${a.evolution} %). Sur une semaine, l’écart peut tenir au hasard.`);
  }

  // Exports en retard : la donnée la plus utile du rapport est celle qui manque.
  const retards: string[] = [];
  for (const pl of a.plateformesActives) {
    const dernier = entree.derniersImports[pl] ?? a.derniereVenteParPlateforme[pl];
    if (dernier && ecartJours(dernier, aujourdhui) > JOURS_AVANT_RELANCE) {
      retards.push(`${NOMS_PLATEFORMES[pl]} (dernier import le ${jourCourt(dernier)})`);
    }
  }
  if (retards.length) vigilance.push(`Exports en retard : ${retards.join(', ')}.`);

  // ---------- Trois actions ----------
  const actions: string[] = [];
  if (a.totalVentes === 0) {
    actions.push('Déposer tes premiers exports CSV de ventes (Etsy, Payhip, Gumroad) dans /admin/boutique.');
  } else if (retards.length) {
    actions.push(`Déposer les exports de ventes à jour : ${retards.join(', ')}.`);
  }
  const amelioration = p.ameliorations[0];
  if (amelioration) {
    actions.push(`Mettre à jour la fiche « ${amelioration.produit} » : nouveau titre et tags proposés dans /admin/propositions.`);
  }
  const idee = p.idees.find((i) => !i.hypothese) ?? p.idees[0];
  if (idee) {
    const prix = idee.prixSuggereCentimes !== null ? `, prix suggéré ${euros(idee.prixSuggereCentimes, idee.devise)}` : '';
    actions.push(`${idee.titre}${prix}.`);
  }
  if (actions.length < 3 && top) {
    actions.push(`Décliner le contenu « ${top.accroche} », le plus cliqué, en épingle et en post.`);
  }
  if (actions.length < 3) {
    actions.push('Importer l’export des fiches Etsy et un relevé de vues pour affiner le diagnostic.');
  }

  return {
    semaine: entree.semaine,
    periode: { debut: a.semaine.debut, fin: a.semaine.fin },
    chiffres: {
      unites: a.semaine.unites,
      unitesPrecedentes: a.precedente.unites,
      evolution: a.evolution,
      commandes: a.semaine.commandes,
      ca: euros(a.semaine.caCentimes, devise),
      caPrecedent: euros(a.precedente.caCentimes, devise),
      panierMoyen: euros(a.semaine.panierMoyenCentimes, devise),
      autresDevises: a.autresDevises,
      parPlateforme: a.parPlateforme.map((x) => ({
        plateforme: NOMS_PLATEFORMES[x.plateforme], unites: x.unites, ca: euros(x.caCentimes, devise),
      })),
    },
    reussites,
    vigilance,
    contenus: entree.contenus.slice(0, 3),
    actions: actions.slice(0, 3),
    propositions: { idees: p.idees.length, ameliorations: p.ameliorations.length },
  };
}

function signe(n: number | null): string {
  if (n === null) return 'pas de comparaison possible';
  return `${n > 0 ? '+' : ''}${n} %`;
}

/** Version texte : corps de courriel brut et archive en base. */
export function rapportTexte(r: Rapport): string {
  const c = r.chiffres;
  const lignes = [
    `Copilote ParentZen — semaine ${r.semaine} (du ${jourCourt(r.periode.debut)} au ${jourCourt(r.periode.fin)})`,
    '',
    'CHIFFRES CLÉS',
    `• Ventes : ${c.unites} (semaine précédente : ${c.unitesPrecedentes}, ${signe(c.evolution)})`,
    `• Chiffre d’affaires : ${c.ca} (précédente : ${c.caPrecedent})`,
    `• Commandes : ${c.commandes} · panier moyen : ${c.panierMoyen}`,
    ...c.parPlateforme.map((x) => `• ${x.plateforme} : ${ventes(x.unites)}, ${x.ca}`),
    ...(c.autresDevises.length ? [`• Ventes aussi en ${c.autresDevises.join(', ')}, non additionnées.`] : []),
    '',
    'CE QUI A MARCHÉ',
    ...r.reussites.map((x) => `• ${x}`),
  ];
  if (r.vigilance.length) lignes.push('', 'À SURVEILLER', ...r.vigilance.map((x) => `• ${x}`));
  lignes.push('', 'LES 3 ACTIONS DE LA SEMAINE', ...r.actions.map((x, i) => `${i + 1}. ${x}`));
  lignes.push('',
    `${r.propositions.idees} idée(s) de produit et ${r.propositions.ameliorations} amélioration(s) de fiche attendent ta validation.`);
  return lignes.join('\n');
}

function echapper(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Version HTML du courriel : sobre, lisible sur téléphone. */
export function rapportHtml(r: Rapport, lienAdmin: string): string {
  const c = r.chiffres;
  const liste = (items: string[], ordonnee = false) => {
    const balise = ordonnee ? 'ol' : 'ul';
    return `<${balise} style="margin:0;padding-left:20px;">${items
      .map((x) => `<li style="margin:0 0 6px;">${echapper(x)}</li>`).join('')}</${balise}>`;
  };
  const titre = (t: string) =>
    `<h2 style="margin:20px 0 8px;font-size:15px;color:#1B2B3A;">${echapper(t)}</h2>`;
  const chiffre = (libelle: string, valeur: string, note = '') =>
    `<td style="padding:8px;background:#FAF7F2;border-radius:10px;">
       <div style="font-size:12px;color:#7A8794;">${echapper(libelle)}</div>
       <div style="font-size:20px;font-weight:700;color:#1B2B3A;">${echapper(valeur)}</div>
       ${note ? `<div style="font-size:12px;color:#7A8794;">${echapper(note)}</div>` : ''}
     </td>`;

  return `<!doctype html><html lang="fr"><body style="margin:0;background:#FAF7F2;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <p style="margin:0 0 16px;font-size:13px;color:#7A8794;">Copilote ParentZen · ${echapper(r.semaine)}</p>
      <div style="background:#fff;border-radius:20px;padding:20px;font-size:14px;line-height:1.5;color:#3E4C5A;">
        <h1 style="margin:0 0 4px;font-size:19px;color:#1B2B3A;">Ta semaine du ${echapper(jourCourt(r.periode.debut))} au ${echapper(jourCourt(r.periode.fin))}</h1>
        <table role="presentation" style="width:100%;border-spacing:6px;margin:12px -6px 0;"><tr>
          ${chiffre('Ventes', String(c.unites), signe(c.evolution))}
          ${chiffre('Chiffre d’affaires', c.ca, `préc. ${c.caPrecedent}`)}
          ${chiffre('Panier moyen', c.panierMoyen)}
        </tr></table>
        ${c.parPlateforme.length ? `<p style="margin:8px 0 0;font-size:13px;color:#7A8794;">${echapper(
    c.parPlateforme.map((x) => `${x.plateforme} : ${ventes(x.unites)}`).join(' · '))}</p>` : ''}
        ${titre('Les 3 actions de la semaine')}${liste(r.actions, true)}
        ${titre('Ce qui a marché')}${liste(r.reussites)}
        ${r.vigilance.length ? titre('À surveiller') + liste(r.vigilance) : ''}
        <p style="margin:20px 0 0;"><a href="${echapper(lienAdmin)}"
          style="background:#2B4257;color:#fff;text-decoration:none;padding:12px 20px;
                 border-radius:10px;display:inline-block;font-weight:700;">
          ${r.propositions.idees + r.propositions.ameliorations > 0
    ? `Valider les ${r.propositions.idees + r.propositions.ameliorations} propositions`
    : 'Ouvrir le copilote'}</a></p>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#9AA5B1;">
        Rapport automatique du lundi. Rien n’est publié sans ta validation.
      </p>
    </div></body></html>`;
}

export function objetCourriel(r: Rapport): string {
  const ev = r.chiffres.evolution;
  const tendance = ev === null ? '' : ` (${ev > 0 ? '+' : ''}${ev} %)`;
  return `Copilote ${r.semaine} : ${ventes(r.chiffres.unites)}${tendance}, 3 actions pour la semaine`;
}
