'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import {
  listerExceptions, creerException, modifierException, supprimerException,
  type ExceptionGarde, type TypeException,
} from '@/lib/actions';

/** Fenêtre couverte par l'écran : large, pour ne rien masquer. */
const DU = () => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const AU = () => new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);

/** ISO complet vers valeur d'un champ datetime-local (heure locale). */
function versChamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dateHeure(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Exceptions() {
  const { ctx, recharger } = useContexte();
  const [liste, setListe] = useState<ExceptionGarde[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [formOuvert, setFormOuvert] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [type, setType] = useState<TypeException>('swap');
  const [enfantIds, setEnfantIds] = useState<string[]>([]);
  const [parentId, setParentId] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [titre, setTitre] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const nom = (id: string) => membres.find((m) => m.profileId === id)?.nom ?? 'Parent';

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    listerExceptions(ctx.contexte.foyer.id, DU(), AU()).then((r) => {
      if (r.status === 'ok') { setListe(r.data); setErreur(null); }
      else if (r.status === 'error') setErreur(r.message);
    });
  }, [ctx]);
  useEffect(charger, [charger]);

  function ouvrirCreation() {
    setEditId(null); setType('swap'); setEnfantIds(enfants.map((e) => e.id));
    setParentId(membres[0]?.profileId ?? '');
    const j = new Date(); j.setHours(18, 0, 0, 0);
    const f = new Date(j.getTime() + 2 * 86400000); f.setHours(9, 0, 0, 0);
    setDebut(versChamp(j.toISOString())); setFin(versChamp(f.toISOString()));
    setTitre(''); setNote(''); setErreurForm(null); setFormOuvert(true);
  }

  function ouvrirEdition(e: ExceptionGarde) {
    setEditId(e.id); setType(e.type); setEnfantIds([e.enfantId]);
    setParentId(e.parentId); setDebut(versChamp(e.debut)); setFin(versChamp(e.fin));
    setTitre(e.titre ?? ''); setNote(e.note ?? ''); setErreurForm(null); setFormOuvert(true);
  }

  async function enregistrer(householdId: string) {
    setErreurForm(null); setMsg(null);
    if (!debut || !fin) { setErreurForm('Indiquez les dates de début et de fin.'); return; }
    if (new Date(fin) <= new Date(debut)) { setErreurForm('La fin doit être postérieure au début.'); return; }
    if (!parentId) { setErreurForm('Indiquez quel parent a les enfants.'); return; }
    if (!editId && enfantIds.length === 0) { setErreurForm('Sélectionnez au moins un enfant.'); return; }

    setBusy(true);
    const r = editId
      ? await modifierException({ id: editId, parentId, debut: new Date(debut).toISOString(),
          fin: new Date(fin).toISOString(), titre, note })
      : await creerException({ householdId, type, enfantIds, parentId,
          debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(), titre, note });
    setBusy(false);

    if (r.status === 'ok') {
      setMsg(editId ? 'Période modifiée.' : 'Période enregistrée. Le planning est à jour.');
      setFormOuvert(false); setEditId(null); charger();
    } else if (r.status === 'error') setErreurForm(r.message);
    else setErreurForm('Session non authentifiée. Reconnectez-vous.');
  }

  async function supprimer(e: ExceptionGarde) {
    if (!confirm(`Supprimer cette période pour ${e.enfantPrenom} ? Le rythme habituel reprendra sur ces dates.`)) return;
    const r = await supprimerException(e.id);
    if (r.status === 'ok') { setMsg('Période supprimée.'); charger(); }
    else if (r.status === 'error') setErreur(r.message);
  }

  const vacances = (liste ?? []).filter((e) => e.type === 'holiday');
  const ponctuels = (liste ?? []).filter((e) => e.type === 'swap');

  function bloc(titreBloc: string, items: ExceptionGarde[], icone: 'vacances' | 'echange', foyerId: string) {
    return (
      <section className="card px-4 py-5">
        <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
          {icone === 'vacances' ? <span aria-hidden>🌴</span> : <Icone nom="echange" taille={17} />}
          {titreBloc}
          {items.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-soft">
              {items.length}
            </span>
          )}
        </h2>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-soft/85">Aucune période enregistrée.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line-soft">
            {items.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold leading-snug">
                      {e.titre ?? (e.type === 'holiday' ? 'Vacances' : 'Changement ponctuel')}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-soft/85">
                      {e.enfantPrenom} · du {dateHeure(e.debut)} au {dateHeure(e.fin)}
                    </p>
                    {e.note && <p className="mt-0.5 text-[13px] text-soft/85">{e.note}</p>}
                  </div>
                  <span className="shrink-0 text-[13px] font-bold">{nom(e.parentId)}</span>
                </div>
                <div className="mt-1.5 flex gap-4">
                  <button type="button" className="text-[13px] font-bold text-navy-text underline"
                          onClick={() => ouvrirEdition(e)}>Modifier</button>
                  <button type="button" className="text-[13px] font-bold text-err underline"
                          onClick={() => supprimer(e)}>Supprimer</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {icone === 'echange' && (
          <button className="btn btn-primary mt-3 w-full" onClick={ouvrirCreation}>
            Ajouter une période
          </button>
        )}
        <span className="hidden">{foyerId}</span>
      </section>
    );
  }

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">
          Vacances et changements
        </h1>
        <Link href="/app/planning" className="text-[13px] font-semibold text-soft/85">Planning</Link>
      </div>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour gérer votre planning." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-soft">
            Ces périodes remplacent temporairement le rythme habituel. À leur terme,
            le rythme reprend exactement où il en était, sans décalage.
            Les vacances sont prioritaires sur les changements ponctuels.
          </p>

          {enfants.length === 0 ? (
            <Vide titre="Ajoutez d’abord un enfant"
                  texte="Une période de garde concerne toujours au moins un enfant."
                  action={{ href: '/app/enfants', label: 'Ajouter un enfant' }} />
          ) : membres.length < 2 ? (
            <Vide titre="Invitez le second parent"
                  texte="Les périodes de garde se définissent entre les deux parents."
                  action={{ href: '/app/foyer', label: 'Inviter le second parent' }} />
          ) : (
            <>
              {liste === null && <Chargement />}
              {liste !== null && (
                <>
                  {bloc('Vacances', vacances, 'vacances', ctx.contexte.foyer.id)}
                  {bloc('Changements ponctuels', ponctuels, 'echange', ctx.contexte.foyer.id)}
                </>
              )}

              {formOuvert && (
                <section className="card space-y-3 px-4 py-5">
                  <h2 className="font-display text-[17px] font-semibold tracking-tight">
                    {editId ? 'Modifier la période' : 'Nouvelle période'}
                  </h2>

                  {!editId && (
                    <fieldset>
                      <legend className="mb-1 text-sm font-bold">Type</legend>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" aria-pressed={type === 'holiday'}
                          onClick={() => setType('holiday')}
                          className={`btn ${type === 'holiday' ? 'btn-primary' : 'btn-ghost'}`}>
                          🌴 Vacances
                        </button>
                        <button type="button" aria-pressed={type === 'swap'}
                          onClick={() => setType('swap')}
                          className={`btn ${type === 'swap' ? 'btn-primary' : 'btn-ghost'}`}>
                          ↔ Ponctuel
                        </button>
                      </div>
                    </fieldset>
                  )}

                  {!editId && (
                    <fieldset>
                      <legend className="mb-1 text-sm font-bold">Enfants concernés</legend>
                      <div className="flex flex-wrap gap-2">
                        {enfants.map((c) => {
                          const on = enfantIds.includes(c.id);
                          return (
                            <button key={c.id} type="button" aria-pressed={on}
                              onClick={() => setEnfantIds(on ? enfantIds.filter((x) => x !== c.id) : [...enfantIds, c.id])}
                              className={`btn flex-1 ${on ? 'btn-primary' : 'btn-ghost'}`}>
                              {c.prenom}
                            </button>
                          );
                        })}
                      </div>
                      {enfants.length > 1 && (
                        <button type="button" className="mt-1.5 text-[13px] font-bold text-navy-text underline"
                          onClick={() => setEnfantIds(enfants.map((e) => e.id))}>
                          Tous les enfants
                        </button>
                      )}
                    </fieldset>
                  )}

                  <fieldset>
                    <legend className="mb-1 text-sm font-bold">Chez quel parent ?</legend>
                    <div className="flex flex-wrap gap-2">
                      {membres.map((m) => (
                        <button key={m.profileId} type="button" aria-pressed={parentId === m.profileId}
                          onClick={() => setParentId(m.profileId)}
                          className={`btn flex-1 ${parentId === m.profileId ? 'btn-primary' : 'btn-ghost'}`}>
                          {m.initiale} · {m.nom}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Début</span>
                    <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Fin</span>
                    <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Motif (facultatif)</span>
                    <input value={titre} onChange={(e) => setTitre(e.target.value)}
                           placeholder="Vacances d’été, déplacement…" maxLength={80} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Note (facultatif)</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)}
                           placeholder="Lieu de récupération, précision…" maxLength={200} />
                  </label>

                  {erreurForm && (
                    <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                      {erreurForm}
                    </p>
                  )}

                  <button className="btn btn-primary w-full" disabled={busy}
                          onClick={() => enregistrer(ctx.contexte.foyer.id)}>
                    {busy ? 'Enregistrement…' : editId ? 'Enregistrer les modifications' : 'Enregistrer la période'}
                  </button>
                  <button className="btn btn-ghost w-full" onClick={() => { setFormOuvert(false); setEditId(null); }}>
                    Annuler
                  </button>
                </section>
              )}

            </>
          )}
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}
