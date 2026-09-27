import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { verifierVisuel } from '@/lib/marketing/signature';
import { histoireDuJour } from '@/lib/marketing/quotidien';
import { INTER_GRASSE, INTER_NORMALE } from '@/polices/inter';

/** Un JPEG illustré et signé, généré à la demande puis conservé par le CDN. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const jour = url.searchParams.get('jour') ?? '';
  const histoire = histoireDuJour(jour);
  if (!histoire || !verifierVisuel(`quotidien-${jour}`, 0, url.searchParams.get('jeton'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const image = await fetch(new URL(`/marketing/reserve/${histoire.fichier}`, base), {
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!image?.ok || !image.headers.get('content-type')?.includes('image/jpeg')) {
    return new NextResponse('Illustration indisponible.', { status: 503 });
  }

  try {
    const scene = `data:image/jpeg;base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
    const rendu = new ImageResponse(
      <div style={{
        width: 1080, height: 1080, display: 'flex', flexDirection: 'column',
        background: '#FCF9F6', fontFamily: 'Inter', color: '#101B2C',
      }}>
        <div style={{
          height: 175, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '22px 48px', textAlign: 'center', fontSize: 46, fontWeight: 700,
        }}><span style={{ color: '#101B2C' }}>{histoire.question}</span></div>
        <div style={{ height: 520, flexShrink: 0, width: 1080, display: 'flex', overflow: 'hidden' }}>
          {/* Les bandes de texte du visuel source sont hors de ce cadre : seule l'histoire reste. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene} alt="" style={{ width: 1080, height: 520,
            objectFit: 'cover', objectPosition: 'center 35%' }} />
        </div>
        <div style={{
          height: 385, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '12px 44px', gap: 16,
        }}>
          <div style={{
            display: 'flex', textAlign: 'center', fontSize: 37, fontWeight: 700,
          }}>{histoire.solution}</div>
          <div style={{
            width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', borderRadius: 35, background: '#101B2C', color: '#FFFFFF',
            padding: '14px 25px', gap: 3,
          }}>
            <span style={{ fontSize: 39, fontWeight: 700 }}>Installer l’application</span>
            <span style={{ fontSize: 42, fontWeight: 700 }}>www.coparentalitezen.fr</span>
            <span style={{ fontSize: 26 }}>Lien dans ma bio</span>
          </div>
        </div>
      </div>,
      { width: 1080, height: 1080, fonts: [
        { name: 'Inter', data: Buffer.from(INTER_NORMALE, 'base64'), weight: 400, style: 'normal' },
        { name: 'Inter', data: Buffer.from(INTER_GRASSE, 'base64'), weight: 700, style: 'normal' },
      ] },
    );
    const png = PNG.sync.read(Buffer.from(await rendu.arrayBuffer()));
    const jpg = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 88);
    return new NextResponse(new Uint8Array(jpg.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpg.data.length),
        'Cache-Control': 'public, max-age=3600, s-maxage=31536000, immutable',
      },
    });
  } catch (erreur) {
    console.error('[visuel-quotidien] rendu impossible', erreur);
    return new NextResponse('Rendu impossible.', { status: 503 });
  }
}
