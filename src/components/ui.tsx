import Link from 'next/link';

/**
 * Badge d'identification d'un parent.
 * Règle d'accessibilité : jamais la couleur seule — toujours initiale + libellé.
 */
export function ParentBadge({ name, initial, colorKey, compact = false }:
  { name: string; initial: string; colorKey: 'navy' | 'coral'; compact?: boolean }) {
  const bg = colorKey === 'navy' ? 'bg-p1-bg' : 'bg-p2-bg';
  const fg = colorKey === 'navy' ? 'text-navy-text' : 'text-coral-text';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${bg} ${fg} px-2.5 py-1 text-sm font-bold`}>
      <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-white/70 text-xs">{initial}</span>
      {!compact && <span>{name}</span>}
    </span>
  );
}

export function StatusPill({ status }: { status: 'a_valider' | 'validee' | 'contestee' | 'envoyee' }) {
  const map = {
    validee: { label: 'Validée', cls: 'bg-ok-bg text-ok' },
    a_valider: { label: 'À valider', cls: 'bg-wait-bg text-wait' },
    contestee: { label: 'Dépense à vérifier', cls: 'bg-err-bg text-err' },
    envoyee: { label: 'En attente de réponse', cls: 'bg-muted text-soft' },
  } as const;
  const s = map[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

const tabs = [
  { href: '/app/accueil', label: 'Accueil', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5' },
  { href: '/app/planning', label: 'Planning', icon: 'M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' },
  { href: '/app/ajouter', label: 'Ajouter', icon: 'M12 5v14M5 12h14', central: true },
  { href: '/app/depenses', label: 'Dépenses', icon: 'M3 7h18v12H3zM3 7l2-4h14l2 4M8 13h4' },
  { href: '/app/plus', label: 'Plus', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-md items-end justify-around px-2 py-1.5">
        {tabs.map((t) =>
          t.central ? (
            <Link key={t.href} href={t.href} aria-label="Ajouter"
              className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-navy text-white shadow-lg">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d={t.icon} /></svg>
            </Link>
          ) : (
            <Link key={t.href} href={t.href} aria-current={active === t.href ? 'page' : undefined}
              className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-bold ${
                active === t.href ? 'text-navy-text' : 'text-soft'
              }`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {t.label}
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
