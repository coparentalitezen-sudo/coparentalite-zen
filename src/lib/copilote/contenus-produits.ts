/**
 * Publications qui mènent aux fiches des boutiques.
 *
 * Chaque semaine, deux publications (mardi et vendredi), chacune sur un
 * produit qui a une adresse publique. Les produits tournent d'une semaine à
 * l'autre pour que tout le catalogue passe, et l'angle change aussi, pour ne
 * pas reposter deux fois le même texte sur le même produit.
 *
 * Pur et déterministe, comme le générateur marketing : la même semaine
 * produit les mêmes textes, et relancer la génération ne crée aucun doublon.
 *
 * Rien n'est dit sur un produit qui ne figure pas déjà dans sa fiche : les
 * formats (Google Sheets, Excel, PDF…) ne sont cités que s'ils y sont, et le
 * prix n'est jamais recopié — il peut changer sur Etsy, la légende resterait.
 */

import { normaliser } from './csv';
import { themeDe, formatsDe, type Theme } from './propositions';
import { verifierObjet, type Probleme } from './garde-fous';
import { ajouterJours } from './dates';
import { NOMS_PLATEFORMES, type PlateformeBoutique } from './types';

export interface ProduitDiffusable {
  id: string;
  plateforme: PlateformeBoutique;
  titre: string;
  url: string;
  tags: string[];
  description: string;
}

export type Angle = 'probleme' | 'pour_qui' | 'apercu';
export type SourceLien = 'instagram' | 'facebook' | 'pinterest';

export interface ContenuProduit {
  /** Sert d'identifiant public (lien suivi, visuel) : court et sans caractère spécial. */
  reference: string;
  produitId: string;
  angle: Angle;
  accroche: string;
  /** Texte de la planche : l'accroche ; en appel, le nom du produit. */
  appelVisuel: string;
  legendeInstagram: string;
  legendeFacebook: string;
  texteAlternatif: string;
  titrePinterest: string;
  descriptionPinterest: string;
  datePublication: string;
}

/** Mardi et vendredi : décalage depuis le lundi de la semaine. */
export const DECALAGES_PUBLICATION = [1, 4];
export const ANGLES: Angle[] = ['probleme', 'pour_qui', 'apercu'];

/**
 * Accroches par thème. Elles décrivent une situation, jamais un résultat
 * garanti : « moins de disputes », « des économies » seraient des promesses.
 */
const ACCROCHES: Record<Theme['id'] | 'autre', string[]> = {
  coparentalite: [
    'Qui récupère les enfants mercredi ? La réponse est sur la page.',
    'Deux maisons, un seul planning que chacun peut lire.',
    'Les dates de garde, posées une fois pour toutes.',
  ],
  budget: [
    'Où est passé l’argent ce mois-ci ?',
    'Le budget du foyer sur une seule page.',
    'Les dépenses du mois, rangées au même endroit.',
  ],
  organisation: [
    'Qui fait quoi cette semaine ? Tout est sur une page.',
    'La semaine de la famille, posée noir sur blanc.',
    'Une liste de moins à garder en tête.',
  ],
  scolarite: [
    'Devoirs, sorties, réunions : tout au même endroit.',
    'L’année scolaire sur une seule page.',
    'La rentrée, préparée sans rien oublier.',
  ],
  autre: [
    'Un modèle prêt à remplir, pour t’organiser simplement.',
    'Un outil simple pour poser les choses à plat.',
    'Tout au même endroit, sans repartir de zéro.',
  ],
};

const MOTS_DIESE: Record<Theme['id'] | 'autre', string[]> = {
  coparentalite: ['#coparentalite', '#gardealternee', '#parentssepares'],
  budget: ['#budgetfamilial', '#gestionbudget', '#organisationfamiliale'],
  organisation: ['#organisationfamiliale', '#chargementale', '#planner'],
  scolarite: ['#rentreescolaire', '#organisationfamiliale', '#parents'],
  autre: ['#organisationfamiliale', '#parents'],
};

/** Lien suivi : compte le clic sur notre site, puis renvoie vers la fiche. */
export function lienSuivi(base: string, reference: string, source: SourceLien): string {
  const url = new URL(`/e/${reference}`, base);
  url.searchParams.set('s', source);
  return url.toString();
}

/**
 * Adresse de la page boutique, telle qu'on peut la taper : sans « https:// »
 * ni « www. ». Sur Instagram, aucun lien n'est cliquable dans une légende, et
 * Payhip n'a pas de moteur de recherche où l'on trouverait la boutique : une
 * adresse courte à taper est le seul chemin honnête vers les produits.
 */
export function adressePageBoutique(base: string): string {
  return `${new URL(base).host.replace(/^www\./, '')}/boutique`;
}

/** Référence d'une publication : « p-2026s47-1 ». */
export function referenceContenu(semaine: string, rang: number): string {
  return `p-${semaine.toLowerCase().replace('-', '')}-${rang}`;
}

function numeroSemaine(semaine: string): number {
  const [annee, s] = semaine.split('-S').map(Number);
  return annee * 53 + s;
}

function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const c = texte.slice(0, max - 1);
  return `${c.slice(0, Math.max(c.lastIndexOf(' '), Math.floor(max / 2))).replace(/[\s,;:|–-]+$/, '')}…`;
}

/** Le nom du produit sans la liste de formats qui l'allonge sur Etsy. */
export function nomCourt(titre: string): string {
  const coupe = titre.split(/\s[|–—-]\s|\s\|\s?/)[0].trim();
  return couper(coupe.length >= 8 ? coupe : titre, 70);
}

function corps(angle: Angle, theme: Theme | null, formats: string[]): string {
  const benefice = theme?.benefice ?? 'Un fichier numérique pour t’organiser simplement.';
  const format = formats.filter((f) => f !== 'imprimable');
  const fichier = format.length
    ? `Un fichier ${format.join(' / ')} à télécharger juste après l’achat.`
    : 'Un fichier numérique à télécharger juste après l’achat.';
  if (angle === 'pour_qui') {
    return theme ? `Pour qui : ${theme.cible.charAt(0).toLowerCase()}${theme.cible.slice(1)}.\n\n${benefice}` : benefice;
  }
  if (angle === 'apercu') return `${fichier}\n\n${benefice}`;
  return benefice;
}

export interface EntreeGeneration {
  produits: ProduitDiffusable[];
  /** Clé de semaine ISO, « 2026-S47 ». */
  semaine: string;
  /** Lundi de la semaine (AAAA-MM-JJ). */
  lundi: string;
  base: string;
}

export interface Generation {
  contenus: ContenuProduit[];
  ecartes: { reference: string; problemes: Probleme[] }[];
}

export function genererContenusProduits(e: EntreeGeneration): Generation {
  // Ordre stable, indépendant de l'ordre de lecture en base.
  const produits = [...e.produits]
    .filter((p) => /^https:\/\//.test(p.url))
    .sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre)) || a.id.localeCompare(b.id));
  if (produits.length === 0) return { contenus: [], ecartes: [] };

  const n = numeroSemaine(e.semaine);
  const nombre = Math.min(DECALAGES_PUBLICATION.length, produits.length);
  const contenus: ContenuProduit[] = [];
  const ecartes: Generation['ecartes'] = [];

  for (let i = 0; i < nombre; i++) {
    const produit = produits[(n * DECALAGES_PUBLICATION.length + i) % produits.length];
    const angle = ANGLES[(n + i) % ANGLES.length];
    const texte = `${produit.titre} ${produit.tags.join(' ')} ${produit.description}`;
    const theme = themeDe(texte);
    const cleTheme = theme?.id ?? 'autre';
    const formats = formatsDe(texte);
    const nom = nomCourt(produit.titre);
    const reference = referenceContenu(e.semaine, i + 1);
    const plateforme = NOMS_PLATEFORMES[produit.plateforme];
    const page = adressePageBoutique(e.base);

    const accroches = ACCROCHES[cleTheme];
    const accroche = angle === 'apercu' ? nom : accroches[(n + i) % accroches.length];
    const texteCorps = corps(angle, theme, formats);
    const motsDiese = [...MOTS_DIESE[cleTheme], ...(produit.plateforme === 'etsy' ? ['#etsyfrance'] : [])]
      .slice(0, 5).join(' ');

    const contenu: ContenuProduit = {
      reference,
      produitId: produit.id,
      angle,
      accroche,
      appelVisuel: angle === 'apercu' ? page : nom,
      legendeInstagram:
        `${accroche}\n\n${texteCorps}\n\n`
        + `« ${nom} » et tous mes modèles : ${page}`
        + `\n\n${motsDiese}`,
      legendeFacebook:
        `${accroche}\n\n${texteCorps}\n\n`
        + `👉 « ${nom} » sur ${plateforme} : ${lienSuivi(e.base, reference, 'facebook')}`
        + `\n\n${motsDiese}`,
      texteAlternatif:
        `Visuel sobre, texte blanc sur fond bleu marine : « ${accroche} ». `
        + `En dessous, en corail : « ${angle === 'apercu' ? page : nom} ».`,
      titrePinterest: couper(nom, 100),
      descriptionPinterest: couper(`${accroche} ${texteCorps.replace(/\n+/g, ' ')}`, 480),
      datePublication: ajouterJours(e.lundi, DECALAGES_PUBLICATION[i]),
    };

    const problemes = verifierObjet(contenu);
    if (problemes.length) ecartes.push({ reference, problemes });
    else contenus.push(contenu);
  }
  return { contenus, ecartes };
}
