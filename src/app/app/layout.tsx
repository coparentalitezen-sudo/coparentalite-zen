import Image from 'next/image';
import Link from 'next/link';
import { Icone } from '@/components/icons';

/** Version affichée = commit réellement déployé (fourni par Vercel au build). */
const VERSION = process.env.NEXT_PUBLIC_VERSION
  ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  ?? 'local';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pb-28">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
          <Image src="/symbole.png" alt="" width={38} height={38} priority />
          <span className="font-display text-[19px] font-semibold leading-[1.05] tracking-tight">
            Coparentalité<br />
            <span className="text-[#22A15B]">Zen</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] text-soft">{VERSION}</span>
            <Link href="/app/accueil#a-faire" aria-label="Aller aux actions à faire"
              className="grid h-11 w-11 place-items-center rounded-full text-ink">
              <Icone nom="cloche" taille={23} />
            </Link>
          </span>
        </div>
        <p className="px-4 pb-1.5 text-center text-[11px] font-semibold text-soft">
          Version bêta — certaines rubriques sont encore en construction.
        </p>
      </header>
      {children}
    </div>
  );
}
