import Image from 'next/image';
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          {/* Écrans internes : symbole seul, le logo complet reste sur l'auth et l'accueil public */}
          <Image src="/symbole.png" alt="" width={34} height={34} priority />
          <span className="font-display text-lg font-semibold tracking-tight">Coparentalité Zen</span>
        </div>
        <p className="bg-wait-bg px-4 py-1 text-center text-xs font-bold text-wait">
          Version de démonstration — données fictives.{' '}
          <Link href="/" className="underline">En savoir plus</Link>
        </p>
      </header>
      {children}
    </div>
  );
}
