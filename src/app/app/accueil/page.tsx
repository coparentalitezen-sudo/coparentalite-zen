import Link from 'next/link';
import { BottomNav, ParentBadge, StatusPill } from '@/components/ui';
import { DEMO, demoToday, demoBalance, demoExpenses, parentById, childById } from '@/lib/demo-data';
import { balanceLabel, formatCents } from '@/lib/money';

const TODAY = '2026-07-22';

function frDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Accueil() {
  const today = demoToday(TODAY);
  const balance = demoBalance();
  const toValidate = demoExpenses.filter((e) => e.status === 'a_valider');
  const recent = [...demoExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const guardian = today ? parentById(today.parentId) : null;
  const next = today?.nextParent ? parentById(today.nextParent) : null;

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="sr-only">Accueil</h1>

      {/* Où sont les enfants aujourd'hui */}
      <section className="card p-4">
        <h2 className="text-sm font-bold text-soft">Aujourd’hui, {frDate(TODAY)}</h2>
        {guardian && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{DEMO.children.map((c) => c.name).join(' et ')} :</span>
            <ParentBadge {...guardian} />
          </div>
        )}
        {today?.nextChange && next && (
          <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">
            Prochain changement le <strong>{frDate(today.nextChange)}</strong> — chez{' '}
            <strong className="text-navy-text">{next.name}</strong>, 18 h, école.
          </p>
        )}
      </section>

      {/* Solde */}
      <section className="card p-4">
        <h2 className="text-sm font-bold text-soft">Entre vous</h2>
        <p className="mt-1 text-lg font-bold">{balanceLabel(balance, 'p1')}</p>
        <p className="text-sm text-soft">Calculé sur les dépenses validées, part 50/50.</p>
        <Link href="/app/depenses" className="btn btn-ghost mt-3 w-full">Voir le détail</Link>
      </section>

      {/* À valider */}
      {toValidate.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-bold text-soft">Dépenses à valider ({toValidate.length})</h2>
          <ul className="mt-2 divide-y divide-line">
            {toValidate.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-bold">{e.title}</p>
                  <p className="text-sm text-soft">
                    {e.childIds.map((c) => childById(c).name).join(', ')} · payé par {parentById(e.paidBy).name}
                  </p>
                </div>
                <span className="font-bold">{formatCents(e.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Dépenses récentes */}
      <section className="card p-4">
        <h2 className="text-sm font-bold text-soft">Dépenses récentes</h2>
        <ul className="mt-2 divide-y divide-line">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-bold">{e.title}</p>
                <p className="text-sm text-soft">{frDate(e.date)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-bold">{formatCents(e.amountCents)}</span>
                <StatusPill status={e.status} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <BottomNav active="/app/accueil" />
    </main>
  );
}
