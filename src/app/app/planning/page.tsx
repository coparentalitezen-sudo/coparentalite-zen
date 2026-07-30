'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { BandeauHorizon, dansHorizon } from '@/components/premium';
import { useContexte } from '@/lib/use-contexte';
import {
  getRegleGarde, listerExceptions, getOffre,
  type RegleGarde, type ExceptionGarde, type Offre,
} from '@/lib/actions';
import { buildDayMap, addDays, type Source, type HolidayOverride, type ExceptionOverride } from '@/lib/custody';

const MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre'];

const jourDe = (iso: string) => iso.slice(0, 10);

function heureCourte(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function dateHeure(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heureCourte(iso)}`;
}

export default function Planning() {
  const { ctx, recharger } = useContexte();
  const [regle, setRegle] = useState<RegleGarde | null | 'inconnu'>('inconnu');
  const [exceptions, setExceptions] = useState<ExceptionGarde[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decalage, setDecalage] = useState(0);
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const [offre, setOffre] = useState<Offre | null>(null);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const today = new Date().toISOString().slice(0, 10);

  const { premierJour, nbJours, titre, dernierJour } = useMemo(() => {
    const base = new Date();
    const d = new Date(Date.UTC(base.getFullYear(), base.getMonth() + decalage, 1));
    const annee = d.getUTCFullYear(); const mois = d.getUTCMonth();
    const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    const premier = `${annee}-${String(mois + 1).padStart(2, '0')}-01`;
    return { premierJour: premier, nbJours: nb, titre: `${MOIS[mois]} ${annee}`,
             dernierJour: addDays(premier, nb - 1) };
  }, [decalage]);

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    getRegleGarde(hid).then((r) => {
      if (r.status === 'ok') setRegle(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
    listerExceptions(hid, premierJour, dernierJour).then((r) => {
      if (r.status === 'ok') setExceptions(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
    getOffre(hid).then((r) => { if (r.status === 'ok') setOffre(r.data); });
  }, [ctx, premierJour, dernierJour]);

  useEffect(charger, [charger]);

  /** Carte des jours : rythme, changements ponctuels, puis vacances. */
  const parJour = useMemo(() => {
    if (!regle || regle === 'inconnu' || !regle.parent2) {
      return new Map<string, { parentId: string; source: Source }>();
    }
    const vacances: HolidayOverride[] = [];
    const ponctuels: ExceptionOverride[] = [];
    for (const e of exceptions) {
      const cible = { startsOn: jourDe(e.debut), endsOn: jourDe(e.fin), parentId: e.parentId };
      if (e.type === 'holiday') {
        vacances.push({ ...cible, firstHalf: e.parentId, secondHalf: e.parentId });
      } else {
        ponctuels.push({ ...cible, source: 'exception' });
      }
    }
    try {
      const m = buildDayMap(
        { pattern: regle.pattern, startDate: regle.startDate, parent1: regle.parent1, parent2: regle.parent2 },
        regle.startDate < premierJour ? regle.startDate : premierJour,
        dernierJour, vacances, ponctuels,
      );
      const out = new Map<string, { parentId: string; source: Source }>();
      for (const [d, a] of m) out.set(d, { parentId: a.parentId, source: a.source });
      return out;
    } catch {
      return new Map<string, { parentId: string; source: Source }>();
    }
  }, [regle, exceptions, premierJour, dernierJour]);

  const membre = (id: string) => membres.find((m) => m.profileId === id);
  const nom = (id: string) => membre(id)?.nom ?? 'Parent';

  /** Exceptions couvrant un jour donné, pour le détail. */
  const exceptionsDuJour = (jour: string) =>
    exceptions.filter((e) => jourDe(e.debut) <= jour && jour <= jourDe(e.fin));

  const decalageDebut = (new Date(premierJour + 'T12:00:00').getDay() + 6) % 7;
  const cases: (string | null)[] = [
    ...Array.from({ length: decalageDebut }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => addDays(premierJour, i)),
  ];

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour voir votre planning réel." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          <div className="flex items-center justify-between">
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage - 1)} aria-label="Mois précédent">‹</button>
            <h1 className="font-display text-[19px] font-semibold tracking-tight">{titre}</h1>
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage + 1)} aria-label="Mois suivant">›</button>
          </div>

          <BandeauHorizon offre={offre} />

          {regle === null && (
            <Vide titre="Aucun rythme de garde défini"
                  texte="Choisissez votre rythme pour générer le planning."
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
                    const couvert = dansHorizon(offre, d);
                    const a = couvert ? parJour.get(d) : undefined;
                    const m = a ? membre(a.parentId) : undefined;
                    const estAujourdhui = d === today;
                    const coral = m?.couleur === 'coral';
                    const fond = m ? (coral ? 'bg-p2-bg' : 'bg-p1-bg') : '';
                    const texte = m ? (coral ? 'text-coral-text' : 'text-navy-text') : '';
                    const vacances = a?.source === 'holiday';
                    const ponctuel = a?.source === 'exception' || a?.source === 'exchange';
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setJourOuvert(jourOuvert === d ? null : d)}
                        aria-label={m
                          ? `${d}, chez ${m.nom}${vacances ? ', vacances' : ponctuel ? ', changement ponctuel' : ''}`
                          : couvert ? d : `${d}, au-delà de votre offre`}
                        className={`relative aspect-square border-b border-r border-line p-1 text-left ${fond}
                          ${!couvert ? 'bg-muted/60' : ''}
                          ${estAujourdhui ? 'ring-2 ring-inset ring-navy' : ''}
                          ${ponctuel ? 'border-2 border-dashed border-ink/40' : ''}
                          ${jourOuvert === d ? 'ring-2 ring-inset ring-ink' : ''}`}
                      >
                        <span className="text-xs font-bold">{Number(d.slice(8))}</span>
                        {m && (
                          <span className={`mt-0.5 block text-[10px] font-black ${texte}`}>{m.initiale}</span>
                        )}
                        {vacances && (
                          <span aria-hidden className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">🌴</span>
                        )}
                        {ponctuel && (
                          <span aria-hidden className="absolute bottom-0.5 right-0.5 leading-none text-soft">
                            <Icone nom="echange" taille={9} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Légende */}
              <section className="card space-y-2 p-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-soft/80">Légende</h2>
                <ul className="space-y-1.5 text-[13px]">
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="h-5 w-5 shrink-0 rounded-md bg-p1-bg" />
                    Garde habituelle — couleur pleine du parent
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 rounded-md bg-p2-bg text-[8px] leading-5">
                      <span className="absolute inset-0 grid place-items-center">🌴</span>
                    </span>
                    Vacances — prioritaire sur tout
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-dashed border-ink/40 bg-p1-bg text-soft">
                      <Icone nom="echange" taille={9} />
                    </span>
                    Changement ponctuel — bordure pointillée
                  </li>
                </ul>
              </section>

              {/* Détail du jour sélectionné */}
              {jourOuvert && (
                <section className="card space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-[17px] font-semibold tracking-tight">
                      {new Date(jourOuvert + 'T12:00:00').toLocaleDateString('fr-FR',
                        { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h2>
                    <button type="button" className="text-sm font-bold text-soft" onClick={() => setJourOuvert(null)}>
                      Fermer
                    </button>
                  </div>

                  {(() => {
                    if (!dansHorizon(offre, jourOuvert)) {
                      return (
                        <div className="rounded-xl bg-wait-bg px-3 py-3">
                          <p className="text-sm font-bold text-wait">Au-delà de votre offre</p>
                          <p className="mt-1 text-[13px] leading-snug text-soft">
                            Ce jour dépasse la période couverte. Ajoutez des mois ou
                            passez à Zen Plus pour planifier plus loin.
                          </p>
                          <Link href="/app/offre" className="btn btn-primary mt-2.5 w-full">
                            Voir les options
                          </Link>
                        </div>
                      );
                    }
                    const a = parJour.get(jourOuvert);
                    if (!a) return <p className="text-sm text-soft">Aucune information pour ce jour.</p>;
                    const m = membre(a.parentId);
                    const libelle = a.source === 'holiday' ? 'Vacances'
                      : a.source === 'exception' || a.source === 'exchange' ? 'Changement ponctuel'
                      : 'Garde habituelle';
                    return (
                      <>
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">Chez {nom(a.parentId)}</span>
                          {m && <ParentBadge name={m.nom} initial={m.initiale}
                                  colorKey={m.couleur === 'coral' ? 'coral' : 'navy'} compact />}
                        </p>
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] font-bold text-soft">
                          {a.source === 'holiday' && <span aria-hidden>🌴</span>}
                          {(a.source === 'exception' || a.source === 'exchange') && <Icone nom="echange" taille={12} />}
                          {libelle}
                        </p>
                      </>
                    );
                  })()}

                  {exceptionsDuJour(jourOuvert).length > 0 && (
                    <ul className="divide-y divide-line-soft border-t border-line-soft pt-1">
                      {exceptionsDuJour(jourOuvert).map((e) => (
                        <li key={e.id} className="py-2.5">
                          <p className="text-sm font-bold">
                            {e.type === 'holiday' ? '🌴 Vacances' : '↔ Changement ponctuel'} — {e.enfantPrenom}
                          </p>
                          {e.titre && <p className="text-[13px]">{e.titre}</p>}
                          <p className="text-[13px] text-soft/85">
                            Du {dateHeure(e.debut)} au {dateHeure(e.fin)} · chez {nom(e.parentId)}
                          </p>
                          {e.note && <p className="mt-0.5 text-[13px] text-soft/85">{e.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link href="/app/exceptions" className="btn btn-ghost w-full">
                    Gérer vacances et changements
                  </Link>
                </section>
              )}

              <div className="flex flex-col gap-2">
                <Link href="/app/exceptions" className="btn btn-primary w-full">
                  Vacances et changements ponctuels
                </Link>
                <p className="text-center text-xs text-soft">
                  Généré depuis votre rythme de garde.{' '}
                  <Link href="/app/foyer" className="underline">Le modifier</Link>
                  {enfants.length > 1 && <><br />Le calendrier affiche la garde commune ; le détail précise chaque enfant.</>}
                </p>
              </div>
            </>
          )}
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}
