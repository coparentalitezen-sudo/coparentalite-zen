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

/**
 * Lien d'une épingle du questionnaire.
 *
 * Il mène à `/quiz` et non à la page de conseil : une personne venue de
 * Pinterest pour connaître son rythme de garde doit trouver le questionnaire,
 * pas un article qui en parle. Le contenu UTM porte le rang de la planche,
 * ce qui indique laquelle des questions a réellement fait venir du monde.
 */
export function lienQuizPinterest(
  base: string, reference: string, page: number,
): string {
  return construireLien(base, {
    source: 'pinterest', campagne: 'questionnaire', contenu: `${reference}-p${page}`,
  }, '/quiz');
}

export function lienImagePinterest(
  base: string, reference: string, page = 0,
): string {
  const url = new URL('/api/marketing/pinterest-visuel', base);
  url.searchParams.set('ref', reference);
  // La couverture reste à l'adresse historique, sans paramètre : les épingles
  // déjà importées par Pinterest pointent dessus, et changer leur URL les
  // ferait réimporter comme des doublons.
  if (page > 0) url.searchParams.set('page', String(page));
  return url.toString();
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

/**
 * Les épingles produites par un contenu.
 *
 * Un contenu ordinaire donne une épingle. Le questionnaire en donne une par
 * planche : Pinterest étant un moteur de recherche, six épingles distinctes
 * occupent six requêtes différentes — l'âge des enfants, le partage des
 * dépenses, les horaires décalés — là où une seule n'en occuperait qu'une.
 *
 * Chaque épingle porte son propre titre et sa propre description, tirés de la
 * planche qu'elle montre. Ce n'est pas un détail de style : Pinterest écarte
 * les contenus dupliqués, et six épingles au texte identique seraient au
 * mieux ignorées, au pire sanctionnées.
 */
export interface ElementFlux {
  guid: string;
  titre: string;
  lien: string;
  description: string;
  image: string;
}

export function elementsDuContenu(contenu: Contenu, base: string): ElementFlux[] {
  if (contenu.categorie !== 'quiz') {
    return [{
      guid: contenu.reference,
      titre: contenu.accroche,
      lien: lienConseilPinterest(base, contenu.reference),
      description: resumePinterest(contenu),
      image: lienImagePinterest(base, contenu.reference),
    }];
  }

  /*
   * La planche de conclusion est écartée.
   *
   * Elle renvoie au lien de la biographie, ce qui n'a de sens que sur
   * Instagram : sur Pinterest, le lien est porté par l'épingle elle-même. Et
   * son texte, écrit pour être lu en fin de carrousel, ferait un titre de
   * cent quatre-vingts caractères là où Pinterest en affiche une quarantaine.
   */
  const retenues = contenu.pages
    .map((page, rang) => ({ page, rang }))
    .filter(({ page }) => page.titre === 'Couverture' || page.titre.startsWith('Question'));

  return retenues.map(({ page, rang }) => {
    // La première ligne d'une planche porte la question ; les suivantes
    // énumèrent les réponses. Un titre d'épingle doit tenir sur une ligne.
    const [premiere, ...reste] = page.texte.split('\n').filter(Boolean);
    return {
      guid: `${contenu.reference}-p${rang}`,
      titre: premiere,
      lien: lienQuizPinterest(base, contenu.reference, rang),
      description: reste.length > 0
        ? `${premiere} ${reste.join(' ').replaceAll('• ', '')} `
          + 'Le questionnaire complet affiche le planning correspondant sur '
          + 'deux semaines, sans inscription.'
        : `${premiere} Cinq questions pour trouver le rythme de garde adapté `
          + 'à votre situation, avec le planning affiché sur deux semaines.',
      image: lienImagePinterest(base, contenu.reference, rang),
    };
  });
}

/** Flux RSS 2.0 accepté par l'import automatique de Pinterest. */
export function creerFluxPinterest(contenus: Contenu[], base: string): string {
  const items = contenus.flatMap((contenu) => {
    const semaine = dateDepuisReference(contenu.reference) ?? new Date();
    const date = datePublication(contenu, semaine).toUTCString();
    return elementsDuContenu(contenu, base).map((element) =>
      `    <item>\n`
      + `      <title>${echapperXml(element.titre)}</title>\n`
      + `      <link>${echapperXml(element.lien)}</link>\n`
      + `      <guid isPermaLink="false">${echapperXml(element.guid)}</guid>\n`
      + `      <description>${echapperXml(element.description)}</description>\n`
      + `      <pubDate>${date}</pubDate>\n`
      + `      <media:content url="${echapperXml(element.image)}" medium="image" type="image/jpeg" />\n`
      + `      <enclosure url="${echapperXml(element.image)}" type="image/jpeg" />\n`
      + `    </item>`);
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
