import Link from 'next/link';

/** Écrans d'état homogènes : jamais de page vide inexpliquée. */
export function Chargement() {
  return <p className="card p-4 text-soft" role="status">Chargement…</p>;
}

export function Erreur({ message, onReessayer }: { message: string; onReessayer?: () => void }) {
  return (
    <div className="card space-y-3 p-4">
      <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{message}</p>
      {onReessayer && <button className="btn btn-ghost w-full" onClick={onReessayer}>Réessayer</button>}
    </div>
  );
}

export function SansFoyer() {
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-bold">Commencez par créer votre foyer</h2>
      <p className="text-sm text-soft">
        Un foyer regroupe vos enfants, votre planning de garde et vos dépenses partagées.
      </p>
      <Link href="/app/foyer" className="btn btn-primary w-full">Créer mon foyer</Link>
    </div>
  );
}

export function Vide({ titre, texte, action }: { titre: string; texte: string; action?: { href: string; label: string } }) {
  return (
    <div className="card space-y-3 p-5 text-center">
      <h2 className="font-bold">{titre}</h2>
      <p className="text-sm text-soft">{texte}</p>
      {action && <Link href={action.href} className="btn btn-primary w-full">{action.label}</Link>}
    </div>
  );
}
