/**
 * Jeu d'icônes maison, en SVG inline.
 * Aucune dépendance externe (le projet n'embarque pas de librairie d'icônes) :
 * chaque glyphe est un tracé unique, homogène — 24×24, trait 1.75, bouts arrondis.
 */

export type NomIcone =
  | 'cloche' | 'check' | 'info' | 'chevron' | 'pousse'
  | 'calendrier' | 'presse-papier' | 'echange' | 'recu'
  | 'ecole' | 'sport' | 'sante' | 'repas' | 'transport' | 'cadeau' | 'personnes';

const TRACES: Record<NomIcone, string[]> = {
  cloche: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  check: ['M20 6 9 17l-5-5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16v-4', 'M12 8h.01'],
  chevron: ['m9 18 6-6-6-6'],
  pousse: ['M12 20v-8', 'M12 12c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5Z', 'M12 14c0-2.5-2-4-5-4 0 2.8 2 4 5 4Z'],
  calendrier: ['M8 2v3', 'M16 2v3', 'M3 9h18', 'M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z'],
  'presse-papier': ['M9 3h6v3H9z', 'M9 4.5H7a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2', 'M9 12h6', 'M9 16h4'],
  echange: ['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 4v4h-4', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 20v-4h4'],
  recu: ['M6 2h12v20l-3-2-3 2-3-2-3 2Z', 'M9 8h6', 'M9 12h6'],
  ecole: ['M8 7V5a4 4 0 0 1 8 0v2', 'M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z', 'M3 13h18'],
  sport: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm12 7 4 3-1.5 4.5h-5L8 10Z', 'M12 3v4', 'm3.5 9 4.5 1', 'm20.5 9-4.5 1'],
  sante: ['M6 3v5a4 4 0 0 0 8 0V3', 'M4 3h3', 'M13 3h3', 'M10 12v3a5 5 0 0 0 8 4', 'M19 17.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  repas: ['M4 3v7a2 2 0 0 0 4 0V3', 'M6 10v11', 'M17 3c-1.5 2-2 4-2 6.5 0 1.5.7 2.5 2 2.5V3Z', 'M17 12v9'],
  transport: ['M5 5h14a2 2 0 0 1 2 2v8H3V7a2 2 0 0 1 2-2Z', 'M3 15h18', 'M7 19v2', 'M17 19v2', 'M6 18h.01', 'M18 18h.01'],
  cadeau: ['M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z', 'M2 7h20v4H2z', 'M12 7v14', 'M12 7S9 3 7 4.5 9 7 12 7Z', 'M12 7s3-4 5-2.5S15 7 12 7Z'],
  personnes: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
};

export function Icone({ nom, taille = 20, className = '' }:
  { nom: NomIcone; taille?: number; className?: string }) {
  return (
    <svg aria-hidden width={taille} height={taille} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {TRACES[nom].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Palette des pastilles d'icône — fonds pâles, glyphe contrasté. */
export const PASTILLES = {
  ambre: 'bg-[#FDF2E2] text-[#B4700F]',
  bleu: 'bg-[#E8F1FD] text-[#2C5FA8]',
  violet: 'bg-[#F1ECFD] text-[#6741B8]',
  rose: 'bg-[#FDEBEA] text-[#B3423A]',
  vert: 'bg-[#E7F4EC] text-[#1F7A45]',
  gris: 'bg-muted text-soft',
} as const;
export type Pastille = keyof typeof PASTILLES;

/** Pastille carrée arrondie contenant une icône — brique visuelle des listes. */
export function PastilleIcone({ nom, ton = 'gris' }: { nom: NomIcone; ton?: Pastille }) {
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${PASTILLES[ton]}`}>
      <Icone nom={nom} taille={21} />
    </span>
  );
}

/** Choix du glyphe et du ton d'après la catégorie de dépense (libellé libre). */
export function categorieVisuel(categorie: string | null): { nom: NomIcone; ton: Pastille } {
  const c = (categorie ?? '').toLowerCase();
  if (/école|ecole|cantine|scolaire|fourniture/.test(c)) return { nom: 'ecole', ton: 'violet' };
  if (/sport|loisir|activité|activite/.test(c)) return { nom: 'sport', ton: 'bleu' };
  if (/santé|sante|pharmacie|médecin|medecin|dentiste|lunette/.test(c)) return { nom: 'sante', ton: 'rose' };
  if (/repas|alimentation|course/.test(c)) return { nom: 'repas', ton: 'ambre' };
  if (/transport|bus|train|essence/.test(c)) return { nom: 'transport', ton: 'bleu' };
  if (/cadeau|anniversaire|noël|noel|vacance/.test(c)) return { nom: 'cadeau', ton: 'ambre' };
  if (/vêtement|vetement|chaussure/.test(c)) return { nom: 'ecole', ton: 'ambre' };
  return { nom: 'recu', ton: 'gris' };
}
