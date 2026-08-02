import Link from 'next/link';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-8">
      <Link href="/" className="text-sm font-bold text-navy-text underline">← Retour à l’accueil</Link>
      <article className="card mt-5 space-y-5 p-5 sm:p-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-5 text-sm leading-relaxed text-soft">{children}</div>
      </article>
    </main>
  );
}

export function SectionJuridique({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
