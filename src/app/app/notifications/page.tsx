'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import {
  listerNotifications, marquerLue, marquerToutLu,
  type Notification,
} from '@/lib/actions';

/** « il y a 3 heures », « hier », « le 12 mars ». */
function quand(iso: string): string {
  const d = new Date(iso);
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function ContenuNotifications() {
  const { ctx, recharger } = useContexte();
  const [liste, setListe] = useState<Notification[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    listerNotifications(ctx.contexte.foyer.id, 60).then((r) => {
      if (r.status === 'ok') { setListe(r.data); setErreur(null); }
      else if (r.status === 'error') {
        setListe([]);
        setErreur(r.details ? `${r.message} — ${r.details}` : r.message);
      }
    });
  }, [ctx]);
  useEffect(charger, [charger]);

  const nonLues = (liste ?? []).filter((n) => !n.lueLe).length;

  async function ouvrir(n: Notification) {
    if (!n.lueLe) {
      await marquerLue(n.id);
      setListe((l) => (l ?? []).map((x) =>
        x.id === n.id ? { ...x, lueLe: new Date().toISOString() } : x));
    }
  }

  async function toutMarquer() {
    if (ctx.etat !== 'pret' || busy) return;
    setBusy(true);
    const r = await marquerToutLu(ctx.contexte.foyer.id);
    setBusy(false);
    if (r.status === 'ok') charger();
  }

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">Notifications</h1>
        <Link href="/app/notifications/reglages" className="text-[13px] font-semibold text-soft/85">
          Réglages
        </Link>
      </div>

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour voir vos notifications." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && liste !== null && (
        liste.length === 0 ? (
          <Vide titre="Aucune notification"
                texte="Vous serez prévenu ici des ajouts, modifications et changements de garde."
                action={{ href: '/app/notifications/reglages', label: 'Choisir mes notifications' }} />
        ) : (
          <>
            {nonLues > 0 && (
              <button type="button" className="btn btn-ghost w-full" disabled={busy}
                      onClick={toutMarquer}>
                {busy ? '…' : `Tout marquer comme lu (${nonLues})`}
              </button>
            )}

            <section className="card overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {liste.map((n) => {
                  const contenu = (
                    <>
                      <span aria-hidden
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          n.lueLe ? 'bg-transparent' : 'bg-[#22A15B]'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block leading-snug ${n.lueLe ? 'font-semibold text-soft' : 'font-bold'}`}>
                          {n.titre}
                        </span>
                        {n.corps && (
                          <span className="mt-0.5 block text-[13px] leading-snug text-soft">
                            {n.corps}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-soft/85">
                          {quand(n.programmeeLe)}
                          {n.auteur && ` · ${n.auteur}`}
                        </span>
                      </span>
                      {n.href && (
                        <span aria-hidden className="mt-1 shrink-0 text-soft/60">
                          <Icone nom="chevron" taille={16} />
                        </span>
                      )}
                    </>
                  );

                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link href={n.href} onClick={() => ouvrir(n)}
                              className="flex items-start gap-2.5 px-4 py-3 active:bg-muted">
                          {contenu}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => ouvrir(n)}
                                className="flex w-full items-start gap-2.5 px-4 py-3 text-left active:bg-muted">
                          {contenu}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )
      )}

      <BottomNav active="/app/accueil" />
    </main>
  );
}

/** Frontière Suspense : immunise la page contre l'échec de génération statique. */
export default function Notifications() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuNotifications />
    </Suspense>
  );
}
