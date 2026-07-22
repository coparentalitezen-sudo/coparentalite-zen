import { BottomNav, ParentBadge, StatusPill } from '@/components/ui';
import { demoExpenses, demoBalance, parentById, childById, DEMO } from '@/lib/demo-data';
import { balanceLabel, formatCents } from '@/lib/money';

export default function Depenses() {
  const balance = demoBalance();
  const sorted = [...demoExpenses].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Dépenses</h1>

      <section className="card space-y-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-soft">Solde — {DEMO.parents[0].name}</p>
            <p className="text-lg font-bold">{balanceLabel(balance, 'p1')}</p>
          </div>
          <ParentBadge {...DEMO.parents[0]} compact />
        </div>
        <div className="flex items-start justify-between gap-2 border-t border-line pt-2">
          <div>
            <p className="text-sm font-bold text-soft">Solde — {DEMO.parents[1].name}</p>
            <p className="text-lg font-bold">{balanceLabel(balance, 'p2')}</p>
          </div>
          <ParentBadge {...DEMO.parents[1]} compact />
        </div>
      </section>

      <ul className="space-y-3">
        {sorted.map((e) => (
          <li key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{e.title}</p>
                <p className="text-sm text-soft">
                  {e.category} · {e.childIds.map((c) => childById(c).name).join(', ')}
                </p>
              </div>
              <span className="text-lg font-bold">{formatCents(e.amountCents)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <ParentBadge {...parentById(e.paidBy)} />
              <StatusPill status={e.status} />
            </div>
          </li>
        ))}
      </ul>

      <BottomNav active="/app/depenses" />
    </main>
  );
}
