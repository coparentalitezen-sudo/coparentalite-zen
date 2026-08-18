import { genererSemaine, type Contenu } from './generateur';
import { construireLien } from './utm';

const REFERENCE = /^(\d{4})s(\d{2})-(reel|carrousel|publication)-([1-7])$/;

/** Retrouve le lundi d'une semaine ISO à partir de la référence publique. */
export function dateDepuisReference(reference: string): Date | null {
  const resultat = REFERENCE.exec(reference);
  if (!resultat) return null;
  const annee = Number(resultat[1]);
  const semaine = Number(resultat[2]);
  if (annee < 2020 || annee > 2100 || semaine < 1 || semaine > 53) return null;

  const quatreJanvier = new Date(Date.UTC(annee, 0, 4, 12));
  const jour = quatreJanvier.getUTCDay() || 7;
  const lundi = new Date(quatreJanvier);
  lundi.setUTCDate(quatreJanvier.getUTCDate() - jour + 1 + (semaine - 1) * 7);
  return lundi;
}

/** Régénère un contenu ancien sans dépendre de la semaine courante. */
export function contenuPinterest(reference: string, base: string): Contenu | null {
  const date = dateDepuisReference(reference);
  if (!date) return null;
  return genererSemaine(date, base).find((contenu) => contenu.reference === reference) ?? null;
}

export function lienConseilPinterest(base: string, reference: string): string {
  return construireLien(base, {
    source: 'pinterest', campagne: 'conseils', contenu: reference,
  }, `/conseils/${encodeURIComponent(reference)}`);
}

export function lienImagePinterest(base: string, reference: string): string {
  return new URL(`/api/marketing/pinterest-visuel?ref=${encodeURIComponent(reference)}`, base).toString();
}

export function resumePinterest(contenu: Contenu): string {
  const etapes = contenu.pages
    .filter((page) => page.titre.startsWith('Étape'))
    .map((page) => page.texte)
    .slice(0, 3);
  const corps = etapes.length > 0
    ? etapes.join(' ')
    : contenu.pages.slice(1, 3).map((page) => page.texte).join(' ');
  return `${contenu.accroche} ${corps} Découvrez CoparentalitéZen pour organiser le planning familial plus sereinement.`;
}

function echapperXml(valeur: string): string {
  return valeur
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function datePublication(contenu: Contenu, semaine: Date): Date {
  const lundi = new Date(semaine);
  const decalage = contenu.jour === 0 ? 6 : contenu.jour - 1;
  lundi.setUTCDate(lundi.getUTCDate() + decalage);
  lundi.setUTCHours(9, 0, 0, 0);
  return lundi;
}

/** Flux RSS 2.0 accepté par l'import automatique de Pinterest. */
export function creerFluxPinterest(contenus: Contenu[], base: string): string {
  const items = contenus.map((contenu) => {
    const semaine = dateDepuisReference(contenu.reference) ?? new Date();
    const lien = lienConseilPinterest(base, contenu.reference);
    const image = lienImagePinterest(base, contenu.reference);
    return `    <item>\n`
      + `      <title>${echapperXml(contenu.accroche)}</title>\n`
      + `      <link>${echapperXml(lien)}</link>\n`
      + `      <guid isPermaLink="false">${echapperXml(contenu.reference)}</guid>\n`
      + `      <description>${echapperXml(resumePinterest(contenu))}</description>\n`
      + `      <pubDate>${datePublication(contenu, semaine).toUTCString()}</pubDate>\n`
      + `      <media:content url="${echapperXml(image)}" medium="image" type="image/jpeg" />\n`
      + `      <enclosure url="${echapperXml(image)}" type="image/jpeg" />\n`
      + `    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n`
    + `  <channel>\n`
    + `    <title>Conseils CoparentalitéZen</title>\n`
    + `    <link>${echapperXml(base)}</link>\n`
    + `    <description>Conseils pratiques pour organiser la coparentalité avec sérénité.</description>\n`
    + `    <language>fr-FR</language>\n`
    + `${items ? `${items}\n` : ''}`
    + `  </channel>\n`
    + `</rss>\n`;
}
