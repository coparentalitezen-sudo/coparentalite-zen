/**
 * Lecture des fichiers CSV exportés par les boutiques.
 *
 * Écrit à la main plutôt qu'importé : le besoin tient en une centaine de
 * lignes (guillemets, retours à la ligne dans un champ, séparateur « , » ou
 * « ; »), et une dépendance de plus serait une chose de plus à tenir à jour.
 *
 * Tout ici est pur — aucune lecture de fichier, aucun réseau — donc testable
 * avec de simples chaînes.
 */

/** Découpe un texte CSV en lignes de cellules (RFC 4180, séparateur détecté). */
export function lireCsv(texte: string): string[][] {
  const source = texte.replace(/^﻿/, '');
  const separateur = detecterSeparateur(source);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let entreGuillemets = false;

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (source[i + 1] === '"') { cellule += '"'; i++; }
        else entreGuillemets = false;
      } else {
        cellule += c;
      }
      continue;
    }
    if (c === '"') { entreGuillemets = true; continue; }
    if (c === separateur) { ligne.push(cellule); cellule = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = []; cellule = '';
      continue;
    }
    cellule += c;
  }
  if (cellule !== '' || ligne.length > 0) { ligne.push(cellule); lignes.push(ligne); }

  // Les lignes entièrement vides (fin de fichier, séparations) ne sont pas des données.
  return lignes.filter((l) => l.some((v) => v.trim() !== ''));
}

/** Le séparateur le plus fréquent sur la première ligne, hors guillemets. */
function detecterSeparateur(texte: string): ',' | ';' | '\t' {
  const compte = { ',': 0, ';': 0, '\t': 0 };
  let entre = false;
  for (const c of texte) {
    if (c === '"') entre = !entre;
    else if (!entre && c === '\n') break;
    else if (!entre && (c === ',' || c === ';' || c === '\t')) compte[c]++;
  }
  if (compte[';'] > compte[','] && compte[';'] >= compte['\t']) return ';';
  if (compte['\t'] > compte[',']) return '\t';
  return ',';
}

/**
 * Forme comparable d'un texte : minuscules, sans accents ni ponctuation.
 * Sert aux en-têtes de colonnes comme aux titres de produits.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** En-tête comparable : le contenu entre parenthèses (« ($) ») est retiré. */
export function normaliserEntete(entete: string): string {
  return normaliser(entete.replace(/\([^)]*\)/g, ' '));
}

/** Devise annoncée dans un en-tête, par exemple « Sale Price ($) ». */
export function deviseEntete(entete: string): string | null {
  const m = entete.match(/\(([^)]*)\)/);
  if (!m) return null;
  const s = m[1].trim();
  if (s === '$' || /usd/i.test(s)) return 'USD';
  if (s === '€' || /eur/i.test(s)) return 'EUR';
  if (s === '£' || /gbp/i.test(s)) return 'GBP';
  return null;
}

/**
 * Montant en centimes, quel que soit son format : « 12.50 », « 12,50 »,
 * « €12.50 », « 1 234,56 », « 1,234.56 ». Rend null si illisible.
 */
export function lireMontant(brut: string): number | null {
  let s = brut.replace(/[\s  ]/g, '').replace(/[€$£]|EUR|USD|GBP/gi, '');
  if (s === '' || s === '-') return null;
  const negatif = s.startsWith('-');
  s = s.replace(/^-/, '');
  const virgule = s.lastIndexOf(',');
  const point = s.lastIndexOf('.');
  if (virgule >= 0 && point >= 0) {
    // Le dernier des deux est le séparateur décimal.
    s = virgule > point ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgule >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/\.(?=\d{3})/g, '').replace(',', '.') : s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const centimes = Math.round(Number(s) * 100);
  return negatif ? -centimes : centimes;
}

const MOIS_ANGLAIS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type OrdreDate = 'jma' | 'mja';

/**
 * Ordre jour/mois d'une colonne de dates, déduit des valeurs elles-mêmes.
 *
 * « 03/04/2026 » est ambigu ; « 25/04/2026 » ne l'est pas. Il suffit d'une
 * seule date sans ambiguïté pour trancher pour tout le fichier — sinon on
 * retient l'habitude de la plateforme (les exports Etsy sont à l'américaine).
 */
export function deduireOrdre(valeurs: string[], parDefaut: OrdreDate): OrdreDate {
  for (const v of valeurs) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) return 'jma';
    if (Number(m[2]) > 12) return 'mja';
  }
  return parDefaut;
}

/** Date au format AAAA-MM-JJ, ou null si illisible. */
export function lireDate(brut: string, ordre: OrdreDate): string | null {
  const s = brut.trim();
  let a: number, m: number, j: number;

  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) {
    [a, m, j] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    const x = Number(r[1]); const y = Number(r[2]);
    a = Number(r[3]); if (a < 100) a += 2000;
    [j, m] = ordre === 'jma' ? [x, y] : [y, x];
  } else if ((r = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) {
    m = MOIS_ANGLAIS[r[1].toLowerCase()] ?? 0; j = Number(r[2]); a = Number(r[3]);
  } else if ((r = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.? (\d{4})/))) {
    m = MOIS_ANGLAIS[r[2].toLowerCase()] ?? 0; j = Number(r[1]); a = Number(r[3]);
  } else {
    return null;
  }

  if (m < 1 || m > 12 || j < 1 || j > 31 || a < 2000 || a > 2100) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1) return null; // 31 février
  return d.toISOString().slice(0, 10);
}

/** Les entités HTML que l'export Etsy laisse dans les titres (« &quot; »). */
export function decoderEntites(texte: string): string {
  return texte
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Vrai pour « true », « yes », « oui », « 1 », « refunded », « remboursé »… */
export function estVrai(brut: string): boolean {
  const s = normaliser(brut);
  return ['true', 'yes', 'oui', '1', 'vrai', 'refunded', 'rembourse', 'remboursee',
    'fully refunded', 'partially refunded', 'cancelled', 'canceled', 'annule', 'annulee']
    .includes(s);
}
