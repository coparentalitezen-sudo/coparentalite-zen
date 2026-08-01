'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { ReglagePush } from '@/components/push';
import { useContexte } from '@/lib/use-contexte';
import {
  listerPreferences, definirPreference, getDelaiRappel, setDelaiRappel,
  DELAIS_RAPPEL, type PreferenceNotification,
} from '@/lib/actions';

const CATEGORIES: Record<string, string> = {
  planning: 'Planning et garde',
  depenses: 'Dépenses',
  foyer: 'Foyer',
};

function ContenuReglages() {
  const { ctx, recharger } = useContexte();
  const [prefs, setPrefs] = useState<PreferenceNotification[] | null>(null);
  const [delai, setDelai] = useState(60);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    listerPreferences(hid).then((r) => {
      if (r.status === 'ok') { setPrefs(r.data); setErreur(null); }
      else if (r.status === 'error') {
        setPrefs([]);
        setErreur(r.details ? `${r.message} — ${r.details}` : r.message);
      }
    });
    getDelaiRappel(hid).then((r) => { if (r.status === 'ok') setDelai(r.data); });
  }, [ctx]);
  useEffect(charger, [charger]);

  async function basculer(p: PreferenceNotification) {
    if (ctx.etat !== 'pret' || !p.canalActif) return;
    const suivant = !p.active;
    setPrefs((l) => (l ?? []).map((x) =>
      x.type === p.type && x.canal === p.canal ? { ...x, active: suivant } : x));
    const r = await definirPreference(ctx.contexte.foyer.id, p.type, p.canal, suivant);
    if (r.status === 'error') { setErreur(r.message); charger(); }
  }

  async function changerDelai(minutes: number) {
    if (ctx.etat !== 'pret') return;
    setDelai(minutes);
    const r = await setDelaiRappel(ctx.contexte.foyer.id, minutes);
    if (r.status === 'ok') setMsg('Délai de rappel enregistré.');
    else if (r.status === 'error') setErreur(r.message);
  }

  // Seul le canal « application » est actif : on n'affiche que lui, les autres
  // sont annoncés comme à venir plutôt que présentés comme réglables.
  const parCategorie = (prefs ?? [])
    .filter((p) => p.canal === 'in_app')
    .reduce<Record<string, PreferenceNotification[]>>((acc, p) => {
      (acc[p.categorie] ??= []).push(p);
      return acc;
    }, {});

  const canauxAVenir = [...new Set(
    (prefs ?? []).filter((p) => !p.canalActif).map((p) => p.canalLibelle),
  )];

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">
          Réglages des notifications
        </h1>
        <Link href="/app/notifications" className="text-[13px] font-semibold text-soft/85">
          Retour
        </Link>
      </div>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour régler vos notifications." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && prefs !== null && (
        <>
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-soft">
            Ces réglages ne concernent que vous. L’autre parent choisit les siens
            de son côté.
          </p>

          <ReglagePush clePublique={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />

          {Object.entries(parCategorie).map(([cat, liste]) => (
            <section key={cat} className="card px-4 py-4">
              <h2 className="font-bold">{CATEGORIES[cat] ?? cat}</h2>
              <ul className="mt-2 divide-y divide-line-soft">
                {liste.sort((a, b) => a.ordre - b.ordre).map((p) => (
                  <li key={`${p.type}-${p.canal}`} className="flex items-start gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{p.typeLibelle}</span>
                      {p.description && (
                        <span className="mt-0.5 block text-[13px] leading-snug text-soft/85">
                          {p.description}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.active}
                      aria-label={`${p.typeLibelle} : ${p.active ? 'activé' : 'désactivé'}`}
                      onClick={() => basculer(p)}
                      className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
                        p.active ? 'bg-[#22A15B]' : 'bg-line'}`}
                    >
                      <span aria-hidden
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-[left] ${
                          p.active ? 'left-6' : 'left-1'}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* Un seul délai : plusieurs rappels pour un même événement finiraient
              par être ignorés. */}
          <section className="card px-4 py-4">
            <h2 className="font-bold">Délai des rappels</h2>
            <p className="mt-1 text-[13px] leading-snug text-soft">
              S’applique aux changements de garde et aux débuts de vacances.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DELAIS_RAPPEL.map((d) => (
                <button key={d.minutes} type="button"
                  aria-pressed={delai === d.minutes}
                  onClick={() => changerDelai(d.minutes)}
                  className={`btn ${delai === d.minutes ? 'btn-primary' : 'btn-ghost'}`}>
                  {d.libelle}
                </button>
              ))}
            </div>
          </section>

          {canauxAVenir.length > 0 && (
            <p className="px-1 text-center text-[11px] leading-snug text-soft/85">
              {canauxAVenir.join(' et ')} : bientôt disponibles. Vos réglages
              ci-dessus s’y appliqueront automatiquement.
            </p>
          )}
        </>
      )}

      <BottomNav active="/app/accueil" />
    </main>
  );
}

/** Frontière Suspense : immunise la page contre l'échec de génération statique. */
export default function ReglagesNotifications() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuReglages />
    </Suspense>
  );
}
