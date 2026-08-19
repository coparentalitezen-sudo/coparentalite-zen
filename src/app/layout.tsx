import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';
import { SuiviOrigine } from '@/components/suivi-origine';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
const PINTEREST_VERIFICATION = process.env.NEXT_PUBLIC_PINTEREST_DOMAIN_VERIFY?.trim()
  || '188783d6df41954e9533962958e31521';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Coparentalité Zen — planning de garde et budget partagé',
  description:
    'Le planning de garde et le budget partagé des parents séparés, réunis dans une seule application simple et apaisante.',
  applicationName: 'Coparentalité Zen',
  appleWebApp: {
    capable: true,
    title: 'Coparentalité Zen',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.ico?v=4', sizes: 'any' },
      { url: '/icons/icon-32.png?v=4', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png?v=4', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=4', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180.png?v=4', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon-167.png?v=4', sizes: '167x167', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152.png?v=4', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-120.png?v=4', sizes: '120x120', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest?v=4',
  openGraph: {
    title: 'Coparentalité Zen',
    description: 'S’organiser • Coopérer • Avancer — pour le bien de nos enfants.',
    images: ['/og.png'],
    locale: 'fr_FR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCF9F6' },
    { media: '(prefers-color-scheme: dark)', color: '#FCF9F6' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {PINTEREST_VERIFICATION
          ? <meta name="p:domain_verify" content={PINTEREST_VERIFICATION} />
          : null}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-startup-image" href="/splash/1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1242x2208.png" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1536x2048.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="min-h-dvh bg-cream text-ink antialiased">
        {children}
        <ServiceWorker />
        <SuiviOrigine />
        <Analytics />
      </body>
    </html>
  );
}
