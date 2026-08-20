import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  contenuPinterest, lienImagePinterest, resumePinterest,
} from '@/lib/marketing/pinterest';
import { construireLien } from '@/lib/marketing/utm';

interface Props {
  params: Promise<{ reference: string }>;
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params;
  const contenu = contenuPinterest(reference, BASE);
  if (!contenu) return {};
  const description = resumePinterest(contenu);
  const canonique = new URL(`/conseils/${encodeURIComponent(reference)}`, BASE).toString();
  return {
    title: `${contenu.accroche} — CoparentalitéZen`,
    description,
    alternates: { canonical: canonique },
    openGraph: {
      title: contenu.accroche,
      description,
      type: 'article',
      url: canonique,
      images: [{
        url: lienImagePinterest(BASE, reference),
        width: 1000,
        height: 1500,
        alt: contenu.texteAlternatif,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: contenu.accroche,
      description,
      images: [lienImagePinterest(BASE, reference)],
    },
  };
}

export default async function Conseil({ params }: Props) {
  const { reference } = await params;
  const contenu = contenuPinterest(reference, BASE);
  if (!contenu) notFound();

  const inscription = construireLien(new URL('/inscription', BASE).toString(), {
    source: 'pinterest', campagne: 'conseils', contenu: reference,
  });
  const points = contenu.pages.filter((page, index) => index > 0 && page.titre !== 'Transition');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <p className="text-xs font-bold uppercase tracking-wide text-soft">Conseil pratique</p>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {contenu.accroche}
          </h1>
          <p className="text-lg leading-relaxed text-soft">{resumePinterest(contenu)}</p>
        </header>

        <img
          src={lienImagePinterest(BASE, reference)}
          alt={contenu.texteAlternatif}
          width={1000}
          height={1500}
          className="mx-auto h-auto w-full max-w-md rounded-3xl shadow-sm"
        />

        <section className="space-y-3" aria-labelledby="etapes">
          <h2 id="etapes" className="font-display text-2xl font-semibold">En pratique</h2>
          <ol className="space-y-3">
            {points.map((point, index) => (
              <li key={`${point.titre}-${index}`} className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-soft">
                  {point.titre}
                </p>
                <p className="mt-1 leading-relaxed">{point.texte}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl bg-navy p-6 text-white">
          <h2 className="font-display text-2xl font-semibold">Une organisation plus claire</h2>
          <p className="mt-2 leading-relaxed text-white/85">
            Réunissez le planning de garde, les dépenses et les informations utiles dans un espace commun.
          </p>
          <a href={inscription} className="btn mt-5 w-full bg-white text-navy">
            Essayer CoparentalitéZen
          </a>
        </section>
      </article>
    </main>
  );
}
