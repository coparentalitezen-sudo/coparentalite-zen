/**
 * Propositions de la semaine : trois idées de produits, trois fiches à améliorer.
 *
 * Déterministe, sans modèle de langage : chaque proposition découle d'une
 * règle lisible et cite les chiffres qui la justifient. Une idée qui ne
 * s'appuie sur aucune vente est marquée « hypothèse » — elle n'est jamais
 * présentée comme une conclusion des données.
 *
 * Rien n'est inventé sur les produits existants : les formats (Google Sheets,
 * Excel, PDF…) ne sont repris dans un titre ou une description que s'ils
 * figurent déjà dans la fiche ou le titre vendu. Ce qui reste à décrire est
 * laissé entre crochets, à compléter à la main.
 */

import { normaliser } from './csv';
import { referenceDepuisTitre } from './import';
import {
  motsSignificatifs, similarite, MINIMUM_VENTES, VUES_FAIBLES, type Analyse, type FicheProduit,
} from './analyse';
import { verifierObjet, type Probleme } from './garde-fous';
import { NOMS_PLATEFORMES, type PlateformeBoutique } from './types';

// ---------- Thèmes ----------

export interface Theme {
  id: 'coparentalite' | 'budget' | 'organisation' | 'scolarite';
  nom: string;
  mots: string[];
  motCle: string;
  cible: string;
  benefice: string;
  tags: string[];
  declinaisons: (annee: number) => string[];
}

/** Ordre significatif : à égalité de mots reconnus, le premier l'emporte. */
export const THEMES: Theme[] = [
  {
    id: 'coparentalite',
    nom: 'coparentalité',
    mots: ['coparentalite', 'coparental', 'coparents', 'garde', 'alternee', 'separes',
      'separation', 'deux maisons', 'pension', 'residence alternee'],
    motCle: 'Garde alternée',
    cible: 'Parents séparés qui organisent la vie des enfants entre deux maisons',
    benefice: 'Un outil neutre pour organiser le quotidien des enfants entre les deux maisons, '
      + 'pensé pour pouvoir être partagé avec l’autre parent.',
    tags: ['coparentalité', 'garde alternée', 'parents séparés', 'planning de garde',
      'calendrier garde', 'organisation enfants', 'deux maisons', 'partage des frais'],
    declinaisons: (a) => [
      `Calendrier de garde alternée ${a}`,
      'Carnet de liaison entre les deux maisons',
      'Tableau de partage des frais des enfants',
      'Planning des vacances scolaires en garde alternée',
    ],
  },
  {
    id: 'budget',
    nom: 'budget',
    mots: ['budget', 'finances', 'finance', 'depenses', 'epargne', 'argent', 'dettes',
      'economies', 'comptes', 'tresorerie'],
    motCle: 'Budget familial',
    cible: 'Familles qui veulent suivre leur budget simplement',
    benefice: 'Pour voir d’un coup d’œil où va l’argent du foyer. Aucune promesse d’économies : '
      + 'c’est toi qui gardes la main sur tes choix.',
    tags: ['budget familial', 'suivi budget', 'budget mensuel', 'gestion budget',
      'tableau budget', 'suivi dépenses', 'épargne', 'finances perso'],
    declinaisons: (a) => [
      `Budget familial annuel ${a}`,
      'Suivi d’épargne par objectifs',
      'Budget des fêtes et des cadeaux',
      'Suivi des dépenses des enfants',
    ],
  },
  {
    id: 'organisation',
    nom: 'organisation familiale',
    mots: ['planner', 'planning', 'agenda', 'organisation', 'organiser', 'routine', 'routines',
      'menage', 'taches', 'menu', 'menus', 'repas', 'courses', 'checklist', 'to do',
      'calendrier', 'semainier'],
    motCle: 'Planner familial',
    cible: 'Parents qui veulent alléger la charge mentale',
    benefice: 'Pour poser sur une page ce que chacun doit faire et alléger la charge mentale '
      + 'de la semaine.',
    tags: ['planner familial', 'organisation', 'charge mentale', 'planning semaine',
      'routine enfant', 'planning familial', 'to do list', 'agenda famille'],
    declinaisons: (a) => [
      `Planner familial ${a}`,
      'Planning des repas et liste de courses',
      'Routines du matin et du soir pour enfants',
      'Tableau des tâches ménagères en famille',
    ],
  },
  {
    id: 'scolarite',
    nom: 'scolarité',
    mots: ['ecole', 'scolaire', 'rentree', 'devoirs', 'college', 'lycee', 'cartable',
      'emploi du temps'],
    motCle: 'Organisation scolaire',
    cible: 'Parents d’enfants scolarisés',
    benefice: 'Pour suivre devoirs, activités et dates importantes de l’année scolaire '
      + 'au même endroit.',
    tags: ['rentrée scolaire', 'emploi du temps', 'organisation école', 'suivi devoirs',
      'planning scolaire', 'année scolaire'],
    declinaisons: (a) => [
      `Emploi du temps ${a - 1}-${a} à personnaliser`,
      'Suivi des devoirs et des activités',
      'Liste de rentrée et budget fournitures',
    ],
  },
];

export function themeDe(texte: string): Theme | null {
  const n = ` ${normaliser(texte)} `;
  let meilleur: Theme | null = null;
  let score = 0;
  for (const t of THEMES) {
    const s = t.mots.filter((m) => n.includes(` ${m} `)).length;
    if (s > score) { meilleur = t; score = s; }
  }
  return meilleur;
}

const FORMATS: [RegExp, string][] = [
  [/\bgoogle sheets?\b|\bsheets\b/, 'Google Sheets'],
  [/\bexcel\b/, 'Excel'],
  [/\bnotion\b/, 'Notion'],
  [/\bcanva\b/, 'Canva'],
  [/\bpdf\b/, 'PDF'],
  [/\bimprimable\b|\bprintable\b/, 'imprimable'],
];

/** Les formats que la fiche annonce déjà — et seulement ceux-là. */
export function formatsDe(texte: string): string[] {
  const n = normaliser(texte);
  return FORMATS.filter(([m]) => m.test(n)).map(([, nom]) => nom);
}

// ---------- Prix ----------

/** Prix « en ,90 » le plus proche : 7,90 € plutôt que 7,83 €. */
export function prixRond(centimes: number): number {
  return Math.max(90, Math.round(centimes / 100) * 100 - 10);
}

function medianePrix(fiches: FicheProduit[]): number | null {
  const p = fiches.map((f) => f.prixMoyenCentimes).filter((x): x is number => x !== null && x > 0)
    .sort((a, b) => a - b);
  if (p.length === 0) return null;
  const m = Math.floor(p.length / 2);
  return p.length % 2 ? p[m] : Math.round((p[m - 1] + p[m]) / 2);
}

function court(titre: string, max = 45): string {
  if (titre.length <= max) return titre;
  const coupe = titre.slice(0, max);
  return `${coupe.slice(0, Math.max(coupe.lastIndexOf(' '), 20)).replace(/[\s,;:|–-]+$/, '')}…`;
}

export function euros(centimes: number | null, devise = 'EUR'): string {
  if (centimes === null) return 'à fixer';
  const symbole = devise === 'EUR' ? '€' : devise === 'USD' ? '$' : devise;
  return `${(centimes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbole}`;
}

// ---------- Types ----------

export interface Idee {
  type: 'idee';
  cle: string;
  titre: string;
  nature: 'diffusion' | 'pack' | 'declinaison' | 'saison';
  cible: string;
  prixSuggereCentimes: number | null;
  devise: string;
  plateformes: PlateformeBoutique[];
  justification: string[];
  /** Vrai quand l'idée ne repose sur aucune vente : à confirmer. */
  hypothese: boolean;
  score: number;
}

export interface Amelioration {
  type: 'amelioration';
  cle: string;
  titre: string;
  produit: string;
  plateforme: PlateformeBoutique | null;
  constats: string[];
  titreActuel: string;
  titrePropose: string;
  tagsActuels: string[];
  tagsProposes: string[];
  descriptionProposee: string;
  ficheImportee: boolean;
  score: number;
}

export type Proposition = Idee | Amelioration;

export interface Propositions {
  idees: Idee[];
  ameliorations: Amelioration[];
  /** Propositions retirées par les garde-fous, pour qu'aucun retrait ne soit silencieux. */
  ecartees: { cle: string; problemes: Probleme[] }[];
}

// ---------- Idées ----------

const NATURE_LIBELLE = { diffusion: 'diffusion', pack: 'pack', declinaison: 'déclinaison', saison: 'saison' };
export { NATURE_LIBELLE };

function ideesDiffusion(a: Analyse): Idee[] {
  if (a.plateformesActives.length < 2) return [];
  const idees: Idee[] = [];
  for (const f of a.produits) {
    if (f.unites90 < MINIMUM_VENTES) continue;
    const theme = themeDe(f.titre);
    const detail = Object.entries(f.unitesParPlateforme)
      .map(([p, n]) => `${n} sur ${NOMS_PLATEFORMES[p as PlateformeBoutique]}`).join(', ');
    for (const p of a.plateformesActives) {
      if (f.plateformes.includes(p)) continue;
      const ailleurs = a.produits.reduce((s, x) => s + (x.unitesParPlateforme[p] ?? 0), 0);
      idees.push({
        type: 'idee',
        cle: `diffusion:${f.cle}:${p}`,
        titre: `Publier « ${court(f.titre, 60)} » sur ${NOMS_PLATEFORMES[p]}`,
        nature: 'diffusion',
        cible: theme?.cible ?? 'Le même public que la fiche d’origine',
        prixSuggereCentimes: f.prixMoyenCentimes !== null ? prixRond(f.prixMoyenCentimes) : null,
        devise: a.devise,
        plateformes: [p],
        justification: [
          `${f.unites90} ventes sur 90 jours (${detail}).`,
          `Aucune vente ni fiche connue sur ${NOMS_PLATEFORMES[p]}, où tu as vendu ${ailleurs} article${ailleurs > 1 ? 's' : ''} sur la même période.`,
          'Le produit existe déjà : seule la fiche est à créer.',
        ],
        hypothese: false,
        score: f.unites90 * 2,
      });
    }
  }
  return idees;
}

function prixPack(x: FicheProduit, y: FicheProduit): number | null {
  if (x.prixMoyenCentimes === null || y.prixMoyenCentimes === null) return null;
  const somme = x.prixMoyenCentimes + y.prixMoyenCentimes;
  // Environ 20 % de moins que les deux achetés séparément, et toujours en dessous.
  return Math.min(prixRond(somme * 0.8), somme - 100);
}

function ideesPack(a: Analyse): Idee[] {
  const parCle = new Map(a.produits.map((f) => [f.cle, f]));
  const idees: Idee[] = [];
  for (const c of a.coAchats) {
    if (c.commandes < 2) break;
    const x = parCle.get(c.a); const y = parCle.get(c.b);
    if (!x || !y) continue;
    const theme = themeDe(`${x.titre} ${y.titre}`);
    idees.push({
      type: 'idee',
      cle: `pack:${c.a}+${c.b}`,
      titre: `Pack « ${court(x.titre, 35)} » + « ${court(y.titre, 35)} »`,
      nature: 'pack',
      cible: theme?.cible ?? 'Les clients qui achètent déjà les deux',
      prixSuggereCentimes: prixPack(x, y),
      devise: a.devise,
      plateformes: [...new Set([...x.plateformes, ...y.plateformes])],
      justification: [
        `${c.commandes} commandes contenaient déjà les deux produits.`,
        'Un pack légèrement moins cher que les deux séparés rend cet achat groupé plus simple.',
      ],
      hypothese: false,
      score: c.commandes * 4,
    });
  }

  // Sans achats groupés, les deux meilleures ventes d'un même thème.
  const porteurs = a.produits.filter((f) => f.unites28 >= MINIMUM_VENTES
    && (f.statut === 'moteur' || f.statut === 'en_hausse'));
  for (let i = 0; i < porteurs.length; i++) {
    for (let j = i + 1; j < porteurs.length; j++) {
      const x = porteurs[i]; const y = porteurs[j];
      const tx = themeDe(x.titre); const ty = themeDe(y.titre);
      if (!tx || tx.id !== ty?.id) continue;
      const [ca, cb] = [x.cle, y.cle].sort();
      if (idees.some((d) => d.cle === `pack:${ca}+${cb}`)) continue;
      idees.push({
        type: 'idee',
        cle: `pack:${ca}+${cb}`,
        titre: `Pack ${tx.nom} : « ${court(x.titre, 35)} » + « ${court(y.titre, 35)} »`,
        nature: 'pack',
        cible: tx.cible,
        prixSuggereCentimes: prixPack(x, y),
        devise: a.devise,
        plateformes: [...new Set([...x.plateformes, ...y.plateformes])],
        justification: [
          `Tes deux produits « ${tx.nom} » les plus vendus du mois : ${x.unites28} et ${y.unites28} ventes sur 28 jours.`,
          'Aucune commande ne les réunit encore : le pack est à tester, pas encore prouvé.',
        ],
        hypothese: false,
        score: (x.unites28 + y.unites28) / 2,
      });
    }
  }
  return idees;
}

function existeDeja(titre: string, a: Analyse): boolean {
  const mots = motsSignificatifs(titre);
  return a.produits.some((f) => similarite(mots, motsSignificatifs(f.titre)) >= 0.5);
}

function ideesDeclinaison(a: Analyse, annee: number): Idee[] {
  const idees: Idee[] = [];
  for (const f of a.produits) {
    if (f.statut !== 'moteur' && f.statut !== 'en_hausse') continue;
    const texte = [f.titre, ...f.catalogue.map((c) => `${c.titre} ${c.tags.join(' ')}`)].join(' ');
    const theme = themeDe(texte);
    if (!theme) continue;
    const proposition = theme.declinaisons(annee).find((d) => !existeDeja(d, a));
    if (!proposition) continue;
    const formats = formatsDe(texte);
    idees.push({
      type: 'idee',
      cle: `declinaison:${f.cle}:${referenceDepuisTitre(proposition)}`,
      titre: formats.length ? `${proposition} (${formats.join(' / ')})` : proposition,
      nature: 'declinaison',
      cible: theme.cible,
      prixSuggereCentimes: f.prixMoyenCentimes !== null ? prixRond(f.prixMoyenCentimes) : null,
      devise: a.devise,
      plateformes: f.plateformes,
      justification: [
        `« ${court(f.titre, 60)} » : ${f.motif}`,
        `Même public (${theme.cible.toLowerCase()}) et même format : la déclinaison s’appuie sur ce qui se vend déjà.`,
      ],
      hypothese: false,
      score: f.unites28 * 1.5,
    });
  }
  return idees;
}

/** Une idée de saison, appuyée sur les ventes quand c'est possible. */
function ideeSaison(a: Analyse, aujourdhui: string): Idee | null {
  const [anneeCourante, mois] = aujourdhui.split('-').map(Number);
  const annee = mois >= 9 ? anneeCourante + 1 : anneeCourante;

  // Fin d'année : l'édition suivante d'un produit daté qui se vend.
  if (mois >= 9) {
    const date = a.produits.find((f) => f.unites90 >= MINIMUM_VENTES
      && new RegExp(`\\b${anneeCourante}\\b`).test(f.titre));
    if (date) {
      const titre = date.titre.replace(new RegExp(`\\b${anneeCourante}\\b`, 'g'), String(annee));
      return {
        type: 'idee',
        cle: `saison:${date.cle}:${annee}`,
        titre: `Édition ${annee} : « ${court(titre, 60)} »`,
        nature: 'saison',
        cible: themeDe(date.titre)?.cible ?? 'Les acheteurs de l’édition actuelle',
        prixSuggereCentimes: date.prixMoyenCentimes !== null ? prixRond(date.prixMoyenCentimes) : null,
        devise: a.devise,
        plateformes: date.plateformes,
        justification: [
          `L’édition ${anneeCourante} s’est vendue ${date.unites90} fois sur 90 jours.`,
          `Elle cessera d’être utile au 1er janvier : l’édition ${annee} prend le relais.`,
        ],
        hypothese: false,
        // Prioritaire : passé le 1er janvier, l'édition actuelle ne se vend plus.
        score: date.unites90 * 2.5,
      };
    }
  }

  const saisons: { mois: number[]; theme: Theme['id']; titre: string; raison: string }[] = [
    { mois: [9, 10, 11, 12], theme: 'organisation', titre: `Planner familial ${annee}`,
      raison: 'Fin d’année : moment où l’on prépare l’organisation de l’année suivante.' },
    { mois: [1, 2], theme: 'budget', titre: `Budget familial annuel ${annee}`,
      raison: 'Début d’année : moment où l’on remet ses comptes à plat.' },
    { mois: [3, 4, 5], theme: 'coparentalite', titre: 'Planning des vacances d’été en garde alternée',
      raison: 'Printemps : moment où les parents séparés organisent l’été des enfants.' },
    { mois: [6, 7, 8], theme: 'scolarite', titre: 'Liste de rentrée et budget fournitures',
      raison: 'Été : moment où l’on prépare la rentrée scolaire.' },
  ];
  const s = saisons.find((x) => x.mois.includes(mois))!;
  if (existeDeja(s.titre, a)) return null;
  const theme = THEMES.find((t) => t.id === s.theme)!;
  return {
    type: 'idee',
    cle: `saison:${referenceDepuisTitre(s.titre)}`,
    titre: s.titre,
    nature: 'saison',
    cible: theme.cible,
    prixSuggereCentimes: (() => { const m = medianePrix(a.produits); return m === null ? null : prixRond(m); })(),
    devise: a.devise,
    plateformes: a.plateformesActives,
    justification: [s.raison, 'Hypothèse de calendrier : elle ne vient pas de tes chiffres, à confirmer.'],
    hypothese: true,
    score: 0.5,
  };
}

/** Quand les données manquent : des idées de ton positionnement, présentées comme telles. */
function ideesDeRepli(a: Analyse, annee: number): Idee[] {
  const dominant = a.produits.map((f) => themeDe(f.titre)).find((t) => t !== null);
  const ordre = dominant ? [dominant, ...THEMES.filter((t) => t !== dominant)] : THEMES;
  const prix = medianePrix(a.produits);
  return ordre.flatMap((t) => t.declinaisons(annee).slice(0, 2)
    .filter((d) => !existeDeja(d, a))
    .map((d): Idee => ({
      type: 'idee',
      cle: `repli:${referenceDepuisTitre(d)}`,
      titre: d,
      nature: 'declinaison',
      cible: t.cible,
      prixSuggereCentimes: prix === null ? null : prixRond(prix),
      devise: a.devise,
      plateformes: a.plateformesActives,
      justification: [
        a.totalVentes === 0
          ? 'Aucune vente importée pour l’instant : idée tirée de ton positionnement, à confirmer.'
          : `Pas assez de ventes (minimum ${MINIMUM_VENTES} par produit) pour une idée appuyée sur tes chiffres.`,
        `Thème : ${t.nom}.`,
      ],
      hypothese: true,
      score: 0,
    })));
}

// ---------- Améliorations de fiches ----------

const LONGUEUR_TITRE_MIN = 40;
const LONGUEUR_TITRE_MAX = 140;
const TAGS_ETSY = 13;
const LONGUEUR_TAG_MAX = 20;
const LONGUEUR_DESCRIPTION_MIN = 300;

function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const c = texte.slice(0, max);
  return c.slice(0, c.lastIndexOf(' ')).replace(/[\s,;:|–&-]+$/, '');
}

export function titrePropose(titre: string, theme: Theme | null, formats: string[]): string {
  let t = titre.replace(/\s+/g, ' ').trim();
  if (theme) {
    const debut = ` ${normaliser(t.slice(0, LONGUEUR_TITRE_MIN))} `;
    const present = normaliser(theme.motCle).split(' ').every((m) => debut.includes(` ${m} `));
    if (!present) t = `${theme.motCle} – ${t}`;
  }
  const n = ` ${normaliser(t)} `;
  const absents = formats.filter((f) => f !== 'imprimable' && !n.includes(` ${normaliser(f)} `));
  if (absents.length) t = `${t} | ${absents.join(' & ')}`;
  return couper(t, LONGUEUR_TITRE_MAX);
}

export function tagsProposes(existants: string[], theme: Theme | null, formats: string[]): string[] {
  const vus = new Set<string>();
  const tags: string[] = [];
  const candidats = [...existants, ...(theme?.tags ?? []), ...formats.map((f) => f.toLowerCase())];
  for (const t of candidats) {
    const propre = t.trim().toLowerCase();
    const cle = normaliser(propre);
    if (!propre || propre.length > LONGUEUR_TAG_MAX || vus.has(cle)) continue;
    vus.add(cle);
    tags.push(propre);
    if (tags.length === TAGS_ETSY) break;
  }
  return tags;
}

export function descriptionProposee(titre: string, theme: Theme | null, formats: string[]): string {
  const format = formats.filter((f) => f !== 'imprimable');
  return [
    titre,
    '',
    theme?.benefice ?? 'Un fichier numérique pour t’organiser simplement.',
    '',
    `Ce que tu reçois : ${format.length ? `un fichier ${format.join(' / ')}` : '[à compléter : format du fichier]'}`
      + ', à télécharger juste après l’achat. Aucun objet physique n’est envoyé.',
    `Pour qui : ${(theme?.cible ?? '[à compléter : à qui s’adresse ce modèle]')}.`,
    '',
    '[À compléter : le contenu du fichier, onglet par onglet. Décris uniquement ce qui existe vraiment.]',
    ...(theme?.id === 'coparentalite'
      ? ['', 'Ce modèle est un outil d’organisation : il ne remplace pas un conseil juridique.']
      : []),
  ].join('\n');
}

function ameliorations(a: Analyse): Amelioration[] {
  const candidates: Amelioration[] = [];
  for (const f of a.produits) {
    const fiche = f.catalogue.find((c) => c.plateforme === 'etsy') ?? f.catalogue[0] ?? null;
    const texte = [f.titre, fiche?.titre ?? '', fiche?.tags.join(' ') ?? '', fiche?.description ?? ''].join(' ');
    const theme = themeDe(texte);
    const formats = formatsDe(texte);
    const titreActuel = fiche?.titre ?? f.titre;
    const constats: string[] = [];

    let score = 0;
    if (f.statut === 'stagne') { score = 100 + f.unitesPrec28; constats.push(f.motif); }
    else if (f.statut === 'faible_conversion') {
      // Avant la fiche peu vue : ici le trafic existe déjà, il reste à convaincre.
      score = 90 + Math.min((f.vues ?? 0) / 50, 30);
      constats.push(f.motif,
        'La fiche est vue mais pas achetée : regarde d’abord la première photo, le prix et les trois premières lignes de la description.');
    } else if (f.statut === 'peu_visible') {
      score = 60 + Math.max(0, VUES_FAIBLES - (f.vues ?? 0)) / 2;
      constats.push(f.motif,
        'Priorité au titre et aux 13 tags : ce sont eux qui font apparaître la fiche dans la recherche Etsy.');
    }
    else if (f.statut === 'moteur') {
      score = 50 + f.unites28;
      constats.push(`Ta meilleure vente (${f.motif.replace(/\.$/, '')}) : chaque point de conversion gagné compte double.`);
    }

    const longueur = titreActuel.length;
    if (longueur < LONGUEUR_TITRE_MIN) {
      constats.push(`Titre de ${longueur} caractères : Etsy en accepte ${LONGUEUR_TITRE_MAX}, et les premiers mots pèsent le plus dans la recherche.`);
    } else if (longueur > LONGUEUR_TITRE_MAX) {
      constats.push(`Titre de ${longueur} caractères : au-delà de ${LONGUEUR_TITRE_MAX}, il est coupé.`);
    }
    if (theme) {
      const debut = ` ${normaliser(titreActuel.slice(0, LONGUEUR_TITRE_MIN))} `;
      if (!normaliser(theme.motCle).split(' ').every((m) => debut.includes(` ${m} `))) {
        constats.push(`Le mot-clé principal (« ${theme.motCle} ») n’apparaît pas au début du titre.`);
      }
    }
    if (formats.filter((x) => x !== 'imprimable').length === 0) {
      constats.push('Le format du fichier (Google Sheets, Excel, PDF…) n’est indiqué nulle part.');
    }
    if (fiche) {
      if (fiche.plateforme === 'etsy' && fiche.tags.length < TAGS_ETSY) {
        constats.push(`${fiche.tags.length} tag${fiche.tags.length > 1 ? 's' : ''} sur ${TAGS_ETSY} possibles.`);
        score += 5;
      }
      if (fiche.description.length < LONGUEUR_DESCRIPTION_MIN) {
        constats.push(`Description de ${fiche.description.length} caractères : trop courte pour répondre aux questions avant l’achat.`);
        score += 5;
      }
    } else {
      constats.push('Fiche non importée : diagnostic fait à partir du titre vu dans les ventes. '
        + 'Importe l’export des fiches Etsy pour un diagnostic complet.');
    }

    // Une fiche sans problème de forme et sans signal de vente n'appelle rien.
    if (score === 0 && constats.length <= 1) continue;
    if (score === 0) score = f.unitesTotal === 0 && fiche ? 20 : 10;

    const titre = titrePropose(titreActuel, theme, formats);
    candidates.push({
      type: 'amelioration',
      cle: `amelioration:${f.cle}`,
      titre: `Améliorer la fiche « ${court(titreActuel)} »`,
      produit: f.titre,
      plateforme: fiche?.plateforme ?? f.plateformes[0] ?? null,
      constats,
      titreActuel,
      titrePropose: titre,
      tagsActuels: fiche?.tags ?? [],
      tagsProposes: tagsProposes(fiche?.tags ?? [], theme, formats),
      descriptionProposee: descriptionProposee(titre, theme, formats),
      ficheImportee: fiche !== null,
      score,
    });
  }
  return candidates.sort((x, y) => y.score - x.score || x.cle.localeCompare(y.cle));
}

// ---------- Assemblage ----------

export const NOMBRE_PAR_TYPE = 3;

export function proposer(a: Analyse, aujourdhui: string): Propositions {
  const [anneeCourante, mois] = aujourdhui.split('-').map(Number);
  const annee = mois >= 9 ? anneeCourante + 1 : anneeCourante;
  const ecartees: Propositions['ecartees'] = [];

  const sur = <T extends Proposition>(p: T): boolean => {
    const problemes = verifierObjet(p);
    if (problemes.length) ecartees.push({ cle: p.cle, problemes });
    return problemes.length === 0;
  };

  const saison = ideeSaison(a, aujourdhui);
  const candidates = [
    ...ideesDiffusion(a), ...ideesPack(a), ...ideesDeclinaison(a, annee),
    ...(saison ? [saison] : []),
  ].sort((x, y) => y.score - x.score || x.cle.localeCompare(y.cle));

  // Pas plus de deux idées tirées du même produit : trois variantes d'une
  // même réussite ne font pas trois idées.
  const idees: Idee[] = [];
  const parSource = new Map<string, number>();
  const retenir = (liste: Idee[]) => {
    for (const i of liste) {
      if (idees.length >= NOMBRE_PAR_TYPE) return;
      if (idees.some((x) => x.cle === i.cle || x.titre === i.titre)) continue;
      const source = i.cle.split(':')[1] ?? i.cle;
      if ((parSource.get(source) ?? 0) >= 2) continue;
      if (!sur(i)) continue;
      parSource.set(source, (parSource.get(source) ?? 0) + 1);
      idees.push(i);
    }
  };
  retenir(candidates);
  retenir(ideesDeRepli(a, annee));

  return {
    idees,
    ameliorations: ameliorations(a).filter(sur).slice(0, NOMBRE_PAR_TYPE),
    ecartees,
  };
}
