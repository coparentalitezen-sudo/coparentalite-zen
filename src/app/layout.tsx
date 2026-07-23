import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://coparentalite-zen-yvtn.vercel.app'),
  title: 'Coparentalité Zen — planning de garde et budget partagé',
  description:
    'Le planning de garde et le budget partagé des parents séparés, réunis dans une seule application simple et apaisante.',
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Coparentalité Zen',
    description: 'S’organiser • Coopérer • Avancer — pour le bien de nos enfants.',
    images: ['/og.png'],
    locale: 'fr_FR',
    type: 'website',
  },
};

export const viewport: Viewport = { themeColor: '#FCF9F6', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
