import Link from 'next/link';

/** Navigation entre les trois écrans du copilote business. */
export function CopiloteNav({ actif }: { actif: 'rapport' | 'propositions' | 'boutique' }) {
  const lien = (cle: typeof actif, href: string, libelle: string) => (
    <Link href={href} aria-current={actif === cle ? 'page' : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-bold ${
        actif === cle ? 'bg-navy text-white' : 'bg-muted text-ink'}`}>
      {libelle}
    </Link>
  );
  return (
    <header className="space-y-2">
      <Link href="/admin" className="text-sm font-bold text-navy-text underline">
        ← Publications
      </Link>
      <p className="text-xs font-bold uppercase tracking-wide text-soft">Copilote business</p>
      <nav className="flex flex-wrap gap-2">
        {lien('rapport', '/admin/rapport', 'Rapport')}
        {lien('propositions', '/admin/propositions', 'Propositions')}
        {lien('boutique', '/admin/boutique', 'Boutiques')}
      </nav>
    </header>
  );
}
