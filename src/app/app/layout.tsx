import Image from 'next/image';

/** Version affichée = commit réellement déployé (fourni par Vercel au build). */
const VERSION = process.env.NEXT_PUBLIC_VERSION
  ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  ?? 'local';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Image src="/symbole.png" alt="" width={34} height={34} priority />
          <span className="font-display text-lg font-semibold tracking-tight">Coparentalité Zen</span>
          <span className="ml-auto font-mono text-[10px] text-soft">{VERSION}</span>
        </div>
        <p className="bg-wait-bg px-4 py-1 text-center text-xs font-bold text-wait">
          Version bêta — certaines rubriques sont encore en construction.
        </p>
      </header>
      {children}
    </div>
  );
}
