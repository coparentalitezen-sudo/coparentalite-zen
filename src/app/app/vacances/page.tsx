'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import {
  listerPropositionsVacances, creerException, modifierException, supprimerException,
  type PropositionVacances,
} from '@/lib/actions';

/** Les vacances scolaires d'une année, dans l'ordre où elles arrivent. */
function jourFr(iso: string) {
  return new Date(iso.length > 10 ? iso : `${iso}T12:00:00`)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}
/** ISO vers valeur d'un champ date (heure locale). */
function versChampDate(iso: string) {
  return iso.slice(0, 10);
}
/** Une date seule devient un horodatage : début de journée, ou fin de journée. */
function auDebut(jour: string) { return new Date(`${jour}T00:00:00`).toISOString(); }
function aLaFin(jour: string) { return new Date(`${jour}T23:59:00`).toISOString(); }

function ContenuVacances() {
  const { ctx, recharger } = useContexte();
  const [liste, setListe] = useState<PropositionVacances[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [parentId, setParentId] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const nom = (id: string | null) =>
    membres.find((m) => m.profileId === id)?.nom ?? 'Non défini';

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    listerPropositionsVacances(ctx.contexte.foyer.id).then((r) => {
      if (r.status === 'ok') { setListe(r.data); setErreur(null); }
      // Le détail technique est affiché : un message générique oblige à
      // chercher la cause en base, ce qui coûte plusieurs allers-retours.
      else if (r.status === 'error') {
        setListe([]);
        setErreur(r.details ? `${r.message} — ${r.details}` : r.message);
      }
    });
  }, [ctx]);
  useEffect(charger, [charger]);

  function ouvrir(p: PropositionVacances) {
    setOuvert(p.holidayId);
    setParentId(p.parentId ?? membres[0]?.profileId ?? '');
    // Les dates officielles ne sont qu'une proposition : elles s'affichent
    // pré-remplies, et restent entièrement modifiables.
    setDebut(versChampDate(p.debutRetenu ?? p.debutOfficiel));
    setFin(versChampDate(p.finRetenue ?? p.finOfficielle));
    setErreurForm(null);
  }

  async function enregistrer(p: PropositionVacances, householdId: string) {
    setErreurForm(null); setMsg(null);
    if (!parentId) { setErreurForm('Indiquez chez quel parent sont les enfants.'); return; }
    if (!debut || !fin) { setErreurForm('Indiquez les dates.'); return; }
    if (fin < debut) { setErreurForm('La fin doit être postérieure au début.'); return; }
    if (enfants.length === 0) { setErreurForm('Ajoutez d’abord un enfant.'); return; }

    setBusy(true);
    const r = p.exceptionId
      ? await modifierException({
          id: p.exceptionId, parentId,
          debut: auDebut(debut), fin: aLaFin(fin), titre: p.libelle,
        })
      : await creerException({
          householdId, type: 'holiday', enfantIds: enfants.map((e) => e.id),
          parentId, debut: auDebut(debut), fin: aLaFin(fin),
          titre: p.libelle, anneeScolaire: p.anneeScolaire,
          periodeOfficielleId: p.holidayId,
        });
    setBusy(false);

    if (r.status === 'ok') {
      setMsg(`${p.libelle} : les enfants sont chez ${nom(parentId)}.`);
      setOuvert(null); charger();
    } else if (r.status === 'error') setErreurForm(r.message);
    else setErreurForm('Session non authentifiée. Reconnectez-vous.');
  }

  async function retirer(p: PropositionVacances) {
    if (!p.exceptionId) return;
    if (!confirm(`Retirer la décision pour ${p.libelle} ? Le rythme habituel reprendra sur ces dates.`)) return;
    const r = await supprimerException(p.exceptionId);
    if (r.status === 'ok') { setMsg(`${p.libelle} : retour au rythme habituel.`); charger(); }
    else if (r.status === 'error') setErreur(r.message);
  }

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">Vacances</h1>
        <Link href="/app/planning" className="text-[13px] font-semibold text-soft/85">Planning</Link>
      </div>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour organiser les vacances." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-soft">
            Les dates officielles sont une proposition : ajustez-les librement.
            Une fois le parent choisi, la période remplace le rythme habituel —
            qui reprend ensuite exactement où il en était.
          </p>

          {membres.length < 2 ? (
            <Vide titre="Invitez le second parent"
                  texte="Les périodes de vacances se répartissent entre les deux parents."
                  action={{ href: '/app/foyer', label: 'Inviter le second parent' }} />
          ) : liste === null ? (
            <Chargement />
          ) : liste.length === 0 ? (
            <Vide titre="Calendrier scolaire non disponible"
                  texte="Indiquez votre zone dans les paramètres du foyer : les périodes de vacances apparaîtront automatiquement."
                  action={{ href: '/app/foyer', label: 'Renseigner ma zone' }} />
          ) : (
            <section className="card px-4 py-4">
              <ul className="divide-y divide-line-soft">
                {liste.map((p) => {
                  const decide = Boolean(p.exceptionId);
                  const modifie = decide
                    && (versChampDate(p.debutRetenu ?? '') !== p.debutOfficiel
                      || versChampDate(p.finRetenue ?? '') !== p.finOfficielle);
                  const parent = membres.find((m) => m.profileId === p.parentId);

                  return (
                    <li key={p.holidayId} className="py-3">
                      <button type="button"
                        onClick={() => (ouvert === p.holidayId ? setOuvert(null) : ouvrir(p))}
                        aria-expanded={ouvert === p.holidayId}
                        className="flex w-full items-center gap-3 text-left">
                        <span aria-hidden
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] ${
                            decide ? 'bg-[#FBF3D9] text-[#8A6A1F]' : 'bg-muted text-soft'}`}>
                          🌴
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold leading-snug">{p.libelle}</span>
                          <span className="block text-[13px] leading-snug text-soft/85">
                            {decide
                              ? `Chez ${nom(p.parentId)} · du ${jourFr(p.debutRetenu!)} au ${jourFr(p.finRetenue!)}`
                              : `Officiel : du ${jourFr(p.debutOfficiel)} au ${jourFr(p.finOfficielle)}`}
                          </span>
                        </span>
                        {decide && parent && (
                          <span aria-label={`chez ${parent.nom}`}
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                              parent.couleur === 'coral' ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text'}`}>
                            {parent.initiale}
                          </span>
                        )}
                        <span aria-hidden className={`shrink-0 text-soft/60 transition-transform ${
                          ouvert === p.holidayId ? 'rotate-90' : ''}`}>
                          <Icone nom="chevron" taille={16} />
                        </span>
                      </button>

                      {modifie && (
                        <p className="mt-1 pl-12 text-[11px] text-soft/85">
                          Dates ajustées par rapport au calendrier officiel.
                        </p>
                      )}

                      {ouvert === p.holidayId && (
                        <div className="mt-3 space-y-3 pl-12 pr-1">
                          <fieldset>
                            <legend className="mb-1.5 text-sm font-bold">Chez quel parent ?</legend>
                            <div className="flex flex-wrap gap-2">
                              {membres.map((m) => (
                                <button key={m.profileId} type="button"
                                  aria-pressed={parentId === m.profileId}
                                  onClick={() => setParentId(m.profileId)}
                                  className={`btn flex-1 ${parentId === m.profileId ? 'btn-primary' : 'btn-ghost'}`}>
                                  {m.initiale} · {m.nom}
                                </button>
                              ))}
                            </div>
                          </fieldset>

                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="mb-1 block text-sm font-bold">Début</span>
                              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-bold">Fin</span>
                              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
                            </label>
                          </div>

                          {(debut !== p.debutOfficiel || fin !== p.finOfficielle) && (
                            <button type="button"
                              className="text-[12px] font-bold text-navy-text underline"
                              onClick={() => {
                                setDebut(p.debutOfficiel); setFin(p.finOfficielle);
                              }}>
                              Revenir aux dates officielles
                            </button>
                          )}

                          {erreurForm && (
                            <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                              {erreurForm}
                            </p>
                          )}

                          <button className="btn btn-primary w-full" disabled={busy}
                            onClick={() => enregistrer(p, ctx.contexte.foyer.id)}>
                            {busy ? 'Enregistrement…' : decide ? 'Mettre à jour' : 'Valider cette période'}
                          </button>
                          {decide && (
                            <button type="button" className="text-[13px] font-bold text-err underline"
                                    onClick={() => retirer(p)}>
                              Retirer cette décision
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="px-1 text-center text-[11px] leading-snug text-soft/85">
            Pour un échange ponctuel, un voyage ou une absence, utilisez{' '}
            <Link href="/app/exceptions" className="underline">Vacances et changements</Link>.
          </p>
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}

/** Frontière Suspense : immunise la page contre l'échec de génération statique. */
export default function Vacances() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuVacances />
    </Suspense>
  );
}
