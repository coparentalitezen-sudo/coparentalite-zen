import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { genererSemaine, type Contenu } from '@/lib/marketing/generateur';
import { planifierVisuel, COULEURS, type Planche, type NomFormat } from '@/lib/marketing/visuel';

/**
 * Rendu des planches en image.
 *
 * Extrait des routes qui l'appellent, parce qu'il en existe deux : l'une
 * réservée à l'administrateur pour relire un visuel, l'autre publique et
 * signée pour que Meta puisse aller le chercher. Dupliquer le dessin ferait
 * diverger les deux images le jour où l'une serait retouchée.
 */

/**
 * Polices embarquées.
 *
 * Sans elles, la graisse demandée est ignorée en silence : la police par
 * défaut d'ImageResponse ne comporte pas de gras, et tout le visuel sort dans
 * la même épaisseur — un titre qui ne se distingue plus de son texte.
 *
 * Le format woff est retenu parce que le moteur de rendu ne sait pas lire le
 * woff2. Les fichiers sont lus une fois et conservés pour les rendus suivants.
 */
let policesEnCache: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;

async function polices() {
  if (policesEnCache) return policesEnCache;
  const dossier = path.join(process.cwd(), 'node_modules/@fontsource/inter/files');
  const [normale, grasse] = await Promise.all([
    readFile(path.join(dossier, 'inter-latin-400-normal.woff')),
    readFile(path.join(dossier, 'inter-latin-700-normal.woff')),
  ]);
  policesEnCache = [
    { name: 'Inter', data: normale, weight: 400, style: 'normal' },
    { name: 'Inter', data: grasse, weight: 700, style: 'normal' },
  ];
  return policesEnCache;
}


/** Contenu de la semaine correspondant à une référence, ou null. */
export function contenuDeReference(reference: string, base: string): Contenu | null {
  return genererSemaine(new Date(), base).find((c) => c.reference === reference) ?? null;
}

/** Dessine une planche et renvoie la réponse image. */
export async function rendreVisuel(contenu: Contenu, page: number) {
  const format: NomFormat = contenu.format === 'reel' ? 'vertical' : 'carre';
  const planche: Planche = {
    texte: contenu.pages[page].texte,
    surtitre: page === 0 ? undefined : contenu.pages[page].titre,
    couverture: page === 0,
    rang: contenu.format === 'carrousel'
      ? { position: page + 1, total: contenu.pages.length }
      : undefined,
  };

  const plan = planifierVisuel(planche, format);

  return new ImageResponse(
    (
      <div
        style={{
          width: plan.largeur, height: plan.hauteur,
          background: plan.fond, color: plan.couleurTexte,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '110px 90px', fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 34, opacity: 0.65 }}>
          <span>{plan.surtitre ?? 'Coparentalité Zen'}</span>
          {plan.pagination && <span>{plan.pagination}</span>}
        </div>

        <div
          style={{
            display: 'flex', fontSize: plan.taille, lineHeight: 1.28,
            fontWeight: 700, letterSpacing: '-0.02em',
          }}
        >
          {plan.texte}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 9,
            background: plan.fond === COULEURS.marine ? '#FFFFFF' : COULEURS.marine,
          }} />
          <span style={{ fontSize: 32, opacity: 0.7 }}>{plan.signature}</span>
        </div>
      </div>
    ),
    { width: plan.largeur, height: plan.hauteur, fonts: await polices() },
  );
}
