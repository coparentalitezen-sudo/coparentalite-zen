import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import React from 'react';
// Chemin interne à Next, pas une API publique de next/og : rendu.tsx est un
// .tsx, et ce dépôt fixe délibérément tsconfig.json en « jsx: preserve »
// (Next transforme lui-même le JSX via SWC ; voir Next.js server/og/
// image-response.js, qui importe exactement ce même chemin). Vitest refuse
// donc de transformer rendu.tsx si on l'importe ici — d'où cette
// reconstruction, par React.createElement, de la même arborescence que
// rendreVisuelVideo. Une dérive entre les deux resterait possible si l'une
// changeait sans l'autre ; c'est le prix pour vérifier un rendu réel
// (satori, la même police embarquée) plutôt qu'une estimation de largeur.
// Un jour où Next changerait ce chemin interne, ce fichier échouerait au
// chargement — visible en CI, pas une omission silencieuse.
import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js';
import { INTER_NORMALE, INTER_GRASSE } from '../src/polices/inter';
import { planifierVisuelVideo, FORMATS } from '../src/lib/marketing/visuel';
import { planchesVideo, TEXTE_APPEL_VIDEO } from '../src/lib/marketing/video-contenu';
import { genererSemaine, type Contenu } from '../src/lib/marketing/generateur';

const BASE = 'https://coparentalitezen.fr';
const MARGE = 90; // padding horizontal de rendreVisuelVideo

async function polices() {
  return [
    { name: 'Inter', data: Buffer.from(INTER_NORMALE, 'base64'), weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: Buffer.from(INTER_GRASSE, 'base64'), weight: 700 as const, style: 'normal' as const },
  ];
}

/** Reconstruction fidèle de l'arborescence dessinée par rendreVisuelVideo (rendu.tsx). */
async function rendreVideoPourTest(texte: string, position: number, total: number): Promise<Buffer> {
  const plan = planifierVisuelVideo(texte, position, total);
  const el = React.createElement(
    'div',
    {
      style: {
        width: plan.largeur, height: plan.hauteur,
        background: plan.fond, color: plan.couleurTexte,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '110px 90px', fontFamily: 'Inter', position: 'relative',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex', position: 'absolute', top: 0, left: 0,
          width: '100%', height: 10, background: 'rgba(255,255,255,0.25)',
        },
      },
      React.createElement('div', {
        style: {
          display: 'flex', width: `${Math.round(plan.progression * 100)}%`,
          height: '100%', background: '#FFFFFF',
        },
      }),
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex', fontSize: plan.taille, lineHeight: 1.15,
          fontWeight: 700, letterSpacing: '-0.02em',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        },
      },
      plan.texte,
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', position: 'absolute', bottom: 40, left: 90, fontSize: 28, opacity: 0.6 } },
      plan.signature,
    ),
  );

  const rendu = new ImageResponse(el, { width: plan.largeur, height: plan.hauteur, fonts: await polices() });
  return Buffer.from(await rendu.arrayBuffer());
}

/**
 * Compte les pixels non conformes au fond marine dans les marges gauche et
 * droite (0..90 et 990..1080), en excluant les quinze premiers pixels de
 * hauteur (le repère de progression, qui occupe légitimement toute la
 * largeur) — tout le reste de ces bandes ne devrait porter que du fond,
 * jamais de texte.
 */
function pixelsHorsCadre(png: PNG): number {
  const { width, height, data } = png;
  const estFond = (r: number, g: number, b: number) => (
    Math.abs(r - 78) < 12 && Math.abs(g - 99) < 12 && Math.abs(b - 129) < 12
  );
  let n = 0;
  for (let y = 15; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= MARGE && x < width - MARGE) continue;
      const idx = (width * y + x) * 4;
      const [r, g, b, a] = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
      if (a > 10 && !estFond(r, g, b)) n++;
    }
  }
  return n;
}

describe('rendu réel des planches vidéo — pas de débordement horizontal', () => {
  it('la planche d’appel à l’action tient dans le cadre', async () => {
    const octets = await rendreVideoPourTest(TEXTE_APPEL_VIDEO, 7, 7);
    const png = PNG.sync.read(octets);
    expect(png.width).toBe(FORMATS.vertical.largeur);
    expect(png.height).toBe(FORMATS.vertical.hauteur);
    expect(pixelsHorsCadre(png)).toBe(0);
  }, 20000);

  it('un mot isolé anormalement long ne déborde pas non plus (garde-fou du word-break)', async () => {
    // Plus long qu'aucun mot du dépôt aujourd'hui — vérifie que le repli
    // (wordBreak) protège même au-delà de ce que tailleTexteVideo anticipe.
    const octets = await rendreVideoPourTest('anticonstitutionnellement', 1, 1);
    const png = PNG.sync.read(octets);
    expect(pixelsHorsCadre(png)).toBe(0);
  }, 20000);

  it('un échantillon de planches réelles, sur plusieurs semaines, tient dans le cadre', async () => {
    const echantillon: { reference: string; texte: string }[] = [];
    for (let semaine = 0; semaine < 12 && echantillon.length < 6; semaine += 3) {
      const date = new Date(Date.UTC(2026, 0, 5 + semaine * 7));
      const reels = genererSemaine(date, BASE).filter((c: Contenu) => c.format === 'reel');
      for (const contenu of reels) {
        const planches = planchesVideo(contenu);
        // La première planche (accroche) et la dernière (appel à l'action)
        // suffisent par semaine échantillonnée : les planches intermédiaires
        // suivent le même gabarit et sont déjà couvertes par la
        // non-régression sur le nombre de mots (marketing-video-contenu.test.ts).
        echantillon.push({ reference: `${contenu.reference}-debut`, texte: planches[0].texte });
        echantillon.push({ reference: `${contenu.reference}-fin`, texte: planches.at(-1)!.texte });
      }
    }

    const echecs: string[] = [];
    for (const { reference, texte } of echantillon) {
      const octets = await rendreVideoPourTest(texte, 1, 1);
      const png = PNG.sync.read(octets);
      if (pixelsHorsCadre(png) > 0) echecs.push(`${reference} — "${texte}"`);
    }
    expect(echecs).toEqual([]);
  }, 60000);
});
