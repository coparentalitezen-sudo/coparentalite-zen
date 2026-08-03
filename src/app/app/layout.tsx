import Image from 'next/image';
import Link from 'next/link';
import { Icone } from '@/components/icons';
import { Cloche } from '@/components/cloche';

/** Version affichée = commit réellement déployé (fourni par Vercel au build). */
const VERSION = process.env.NEXT_PUBLIC_VERSION
  ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  ?? 'local';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pb-32">
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-4">
          <Image src="/symbole.png" alt="" width={44} height={44} priority />
          <span className="font-display text-[20px] font-semibold leading-[1.05] tracking-tight">
            Coparentalité<br />
            <span className="text-[#22A15B]">Zen</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] text-soft">{VERSION}</span>
            <Cloche />
          </span>
        </div>
        {process.env.NEXT_PUBLIC_BETA !== 'false' && (
          <p className="px-4 pb-2 text-center text-[10px] font-medium text-soft/80">
            Version bêta — certaines rubriques sont encore en construction.
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
