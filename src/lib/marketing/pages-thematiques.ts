/**
 * Pages thématiques construites sur une intention de recherche.
 *
 * Chacune répond à une question qu'un parent séparé tape réellement dans un
 * moteur. Elles sont peu nombreuses à dessein : quatre pages solides valent
 * mieux que trente pages minces, et des pages quasi identiques générées en
 * masse diluent le site plutôt qu'elles ne le font trouver.
 *
 * Cette table est la seule source de vérité : le plan du site, le maillage
 * interne entre les pages et la destination des épingles Pinterest la lisent
 * tous. Ajouter une page revient à ajouter une ligne ici.
 */

export interface PageThematique {
  /** Chemin public de la page. */
  chemin: string;
  /** Libellé du lien interne, formulé comme la recherche. */
  libelle: string;
  /** Niches de `banque.ts` dont l'intention correspond à cette page. */
  niches: string[];
}

export const PAGES_THEMATIQUES: PageThematique[] = [
  {
    chemin: '/calendrier-garde-alternee',
    libelle: 'Calendrier de garde alternée',
    niches: ['garde-alternee'],
  },
  {
    chemin: '/vacances-scolaires-parents-separes',
    libelle: 'Partage des vacances scolaires entre parents séparés',
    niches: ['vacances-scolaires'],
  },
  {
    chemin: '/partage-frais-enfants-parents-separes',
    libelle: 'Partage des frais des enfants entre parents séparés',
    niches: ['depenses-partagees'],
  },
  {
    chemin: '/pension-alimentaire-suivi',
    libelle: 'Pension alimentaire : calcul et suivi',
    niches: ['pension'],
  },
  {
    chemin: '/echange-des-enfants',
    libelle: 'Organiser les échanges d’enfants après une séparation',
    niches: ['echange-enfants'],
  },
];

/**
 * La page thématique qui répond à l'intention d'une niche, ou null.
 *
 * Null signifie qu'aucune page ne couvre encore cette intention : l'appelant
 * garde alors sa destination par défaut.
 */
export function pageDeLaNiche(niche: string): PageThematique | null {
  return PAGES_THEMATIQUES.find((page) => page.niches.includes(niche)) ?? null;
}

/** Les autres pages thématiques, pour le maillage interne d'une page. */
export function autresPages(chemin: string): PageThematique[] {
  return PAGES_THEMATIQUES.filter((page) => page.chemin !== chemin);
}
