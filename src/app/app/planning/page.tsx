import { BottomNav, ParentBadge } from '@/components/ui';
import { DEMO, demoSchedule, parentById } from '@/lib/demo-data';
import { addDays } from '@/lib/custody';

const MONTH_START = '2026-07-01';
const MONTH_END = '2026-07-31';
const TODAY = '2026-07-22';

export default function Planning() {
  const periods = demoSchedule(MONTH_START, MONTH_END);
  const dayParent = new Map<string, string>();
  for (const p of periods) {
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) dayParent.set(d, p.parentId);
  }
  // grille : juillet 2026 commence un mercredi (colonne 2 en semaine lundi-dimanche)
  const firstDow = (new Date(MONTH_START + 'T12:00:00').getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: 31 }, (_, i) => addDays(MONTH_START, i)),
  ];

  return (
    <main className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Juillet 2026</h1>
        <div className="flex gap-1.5">
          {DEMO.parents.map((p) => <ParentBadge key={p.id} {...p} compact />)}
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-muted text-center text-xs font-bold text-soft">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square" />;
            const pid = dayParent.get(d);
            const parent = pid ? parentById(pid) : null;
            const isToday = d === TODAY;
            const bg = parent?.colorKey === 'navy' ? 'bg-p1-bg' : 'bg-p2-bg';
            const fg = parent?.colorKey === 'navy' ? 'text-navy-text' : 'text-coral-text';
            return (
              <div key={d}
                className={`aspect-square border-b border-r border-line p-1 ${bg} ${isToday ? 'ring-2 ring-inset ring-navy' : ''}`}>
                <div className="text-xs font-bold">{Number(d.slice(8))}</div>
                {parent && (
                  <div aria-label={`Chez ${parent.name}`} className={`mt-0.5 text-[10px] font-black ${fg}`}>
                    {parent.initial}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-soft">Vacances d’été</h2>
        <p className="mt-1 text-sm">
          Du 4 juillet au 31 août : première moitié chez <strong className="text-navy-text">Camille</strong>,
          seconde moitié chez <strong className="text-coral-text">Julien</strong>. Ces règles remplacent le
          rythme habituel pendant les vacances.
        </p>
      </section>

      <p className="text-center text-xs text-soft">
        Vues semaine, année, liste et par enfant : prévues dans la version complète.
      </p>

      <BottomNav active="/app/planning" />
    </main>
  );
}
