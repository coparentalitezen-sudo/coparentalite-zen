import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { genererSemaine } from '@/lib/marketing/generateur';
import { planifierVisuel, COULEURS, type Planche, type NomFormat } from '@/lib/marketing/visuel';

/**
 * Rendu d'une planche en image.
 *
 * Réservée à l'administrateur, pour deux raisons : produire une image consomme
 * du calcul, et une route ouverte deviendrait un moyen commode d'épuiser le
 * quota de fonctions. La restriction n'est pas une question de confidentialité
 * — ces visuels ont vocation à être publiés.
 *
 * Les images ne sont pas conservées : elles sont reconstruites à la demande.
 * Le générateur étant déterministe, la même référence redonne toujours la même
 * image, ce qui rend le stockage inutile tant que le volume reste celui-ci.
 */
export const dynamic = 'force-dynamic';

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

export async function GET(requete: Request) {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) {
    // Même réponse qu'une route inexistante : rien n'indique à un visiteur
    // qu'il existe ici quelque chose à forcer.
    return new NextResponse('Not found', { status: 404 });
  }

  const url = new URL(requete.url);
  const reference = url.searchParams.get('ref') ?? '';
  const page = Number(url.searchParams.get('page') ?? '0');

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenu = genererSemaine(new Date(), base).find((c) => c.reference === reference);
  if (!contenu || !contenu.pages[page]) {
    return new NextResponse('Not found', { status: 404 });
  }

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
