'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import { getRegleGarde, type RegleGarde } from '@/lib/actions';
import { buildSchedule, addDays } from '@/lib/custody';

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

export default function Planning() {
  const { ctx, recharger } = useContexte();
  const [regle, setRegle] = useState<RegleGarde | null | 'inconnu'>('inconnu');
  const [erreur, setErreur] = useState<string | null>(null);
  const [decalage, setDecalage] = useState(0); // mois affiché par rapport au mois courant

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    getRegleGarde(ctx.contexte.foyer.id).then((r) => {
      if (r.status === 'ok') setRegle(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
  }, [ctx]);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const today = new Date().toISOString().slice(0, 10);

  const { premierJour, nbJours, titre } = useMemo(() => {
    const base = new Date();
    const d = new Date(Date.UTC(base.getFullYear(), base.getMonth() + decalage, 1));
    const annee = d.getUTCFullYear(); const mois = d.getUTCMonth();
    const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    return {
      premierJour: `${annee}-${String(mois + 1).padStart(2, '0')}-01`,
      nbJours: nb,
      titre: `${MOIS[mois]} ${annee}`,
    };
  }, [decalage]);

  const parJour = useMemo(() => {
    const map = new Map<string, string>();
    if (!regle || regle === 'inconnu' || !regle.parent2) return map;
    try {
      const dernier = addDays(premierJour, nbJours - 1);
      const debut = regle.startDate < premierJour ? regle.startDate : premierJour;
      const periodes = buildSchedule(
        { pattern: regle.pattern, startDate: regle.startDate, parent1: regle.parent1, parent2: regle.parent2 },
        debut, dernier
      );
      for (const p of periodes) {
        for (let d = p.start; d <= p.end; d = addDays(d, 1)) map.set(d, p.parentId);
      }
    } catch { /* règle incohérente : grille vide plutôt qu'un planning faux */ }
    return map;
  }, [regle, premierJour, nbJours]);

  const decalageDebut = (new Date(premierJour + 'T12:00:00').getDay() + 6) % 7;
  const cases: (string | null)[] = [
    ...Array.from({ length: decalageDebut }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => addDays(premierJour, i)),
  ];
  const membre = (id: string) => membres.find((m) => m.profileId === id);

  return (
    <main className="space-y-4 px-4 py-4">
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour voir votre planning réel." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          <div className="flex items-center justify-between">
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage - 1)} aria-label="Mois précédent">‹</button>
            <h1 className="font-display text-xl font-semibold">{titre}</h1>
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage + 1)} aria-label="Mois suivant">›</button>
          </div>

          {regle === null && (
            <Vide titre="Aucun rythme de garde défini"
                  texte="Choisissez votre rythme (une semaine sur deux, 2-2-3, week-ends alternés…) pour générer le planning."
                  action={{ href: '/app/foyer', label: 'Définir le rythme de garde' }} />
          )}

          {regle && regle !== 'inconnu' && !regle.parent2 && (
            <p className="rounded-xl bg-wait-bg px-3 py-2 text-sm font-bold text-wait">
              Le planning s’affichera dès que le second parent aura rejoint le foyer.
            </p>
          )}

          {regle && regle !== 'inconnu' && regle.parent2 && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {membres.map((m) => (
                  <ParentBadge key={m.profileId} name={m.nom} initial={m.initiale}
                    colorKey={m.couleur === 'coral' ? 'coral' : 'navy'} />
                ))}
              </div>

              <section className="card overflow-hidden">
                <div className="grid grid-cols-7 border-b border-line bg-muted text-center text-xs font-bold text-soft">
                  {['L','M','M','J','V','S','D'].map((d, i) => <div key={i} className="py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {cases.map((d, i) => {
                    if (!d) return <div key={`vide-${i}`} className="aspect-square" />;
                    const pid = parJour.get(d);
                    const m = pid ? membre(pid) : undefined;
                    const estAujourdhui = d === today;
                    const fond = m ? (m.couleur === 'coral' ? 'bg-p2-bg' : 'bg-p1-bg') : '';
                    const texte = m ? (m.couleur === 'coral' ? 'text-coral-text' : 'text-navy-text') : '';
                    return (
                      <div key={d}
                        className={`aspect-square border-b border-r border-line p-1 ${fond} ${estAujourdhui ? 'ring-2 ring-inset ring-navy' : ''}`}>
                        <div className="text-xs font-bold">{Number(d.slice(8))}</div>
                        {m && (
                          <div aria-label={`Chez ${m.nom}`} className={`mt-0.5 text-[10px] font-black ${texte}`}>
                            {m.initiale}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <p className="text-center text-xs text-soft">
                Généré depuis votre rythme de garde.{' '}
                <Link href="/app/foyer" className="underline">Le modifier</Link>
                <br />Vacances scolaires et exceptions : prochaine version.
              </p>
            </>
          )}
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}
