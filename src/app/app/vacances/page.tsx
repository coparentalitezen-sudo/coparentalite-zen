'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import {
  listerPropositionsVacances, creerException, modifierException,
  supprimerSegmentVacances,
  type PropositionVacances,
} from '@/lib/actions';

/** Les vacances scolaires d'une année, dans l'ordre où elles arrivent. */
function jourFr(iso: string) {
  return new Date(iso.length > 10 ? iso : `${iso}T12:00:00`)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}
/**
 * ISO vers la valeur d'un champ datetime-local, en heure locale.
 *
 * Le format attendu est « AAAA-MM-JJTHH:MM », sans fuseau : découper la chaîne
 * ISO donnerait l'heure UTC et décalerait l'affichage.
 */
function versChampDateHeure(iso: string, heureDefaut = '00:00') {
  if (iso.length <= 10) return `${iso}T${heureDefaut}`;
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    + `T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Jour seul, pour comparer aux dates officielles. */
function jourSeul(valeur: string) {
  return valeur.slice(0, 10);
}
/** Une date seule devient un horodatage : début de journée, ou fin de journée. */
/** Valeur d'un champ datetime-local vers un horodatage ISO. */
function horodatage(valeur: string) {
  return new Date(valeur).toISOString();
}

/** Heure lisible d'une valeur de champ, ou null si minuit ou fin de journée. */
function heureUtile(valeur: string): string | null {
  const h = valeur.slice(11, 16);
  return h && h !== '00:00' && h !== '23:59' ? h : null;
}

function ContenuVacances() {
  const { ctx, recharger } = useContexte();
  const [liste, setListe] = useState<PropositionVacances[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveauSegment, setNouveauSegment] = useState<PropositionVacances | null>(null);
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

  /** Un segment se distingue de ses voisins par son rang dans la période. */
  const cleDe = (p: PropositionVacances) => `${p.holidayId}#${p.exceptionId ?? 'libre'}`;

  function ouvrir(p: PropositionVacances) {
    setOuvert(cleDe(p));
    setParentId(p.parentId ?? membres[0]?.profileId ?? '');
    // Les dates officielles ne sont qu'une proposition : elles s'affichent
    // pré-remplies, et restent entièrement modifiables.
    setDebut(versChampDateHeure(p.debutRetenu ?? p.debutOfficiel, '00:00'));
    setFin(versChampDateHeure(p.finRetenue ?? p.finOfficielle, '23:59'));
    setErreurForm(null);
  }

  /**
   * Prépare un segment supplémentaire : il démarre le lendemain du précédent
   * et court jusqu'à la fin officielle, chez l'autre parent. Ce sont des
   * propositions, ajustables comme le reste.
   */
  function ajouterSegment(p: PropositionVacances) {
    const finPrecedente = p.finRetenue ? new Date(p.finRetenue) : new Date(p.finOfficielle);
    const lendemain = new Date(finPrecedente.getTime() + 86400000);
    const autre = membres.find((m) => m.profileId !== p.parentId) ?? membres[0];

    setOuvert(`${p.holidayId}#nouveau`);
    setParentId(autre?.profileId ?? '');
    setDebut(versChampDateHeure(lendemain.toISOString(), '00:00'));
    setFin(versChampDateHeure(`${p.finOfficielle}T23:59:00.000Z`, '23:59'));
    setErreurForm(null);
    setNouveauSegment(p);
  }

  async function enregistrer(p: PropositionVacances, householdId: string) {
    setErreurForm(null); setMsg(null);
    if (!parentId) { setErreurForm('Indiquez chez quel parent sont les enfants.'); return; }
    if (!debut || !fin) { setErreurForm('Indiquez les dates.'); return; }
    if (new Date(fin) <= new Date(debut)) {
      setErreurForm('La fin doit être postérieure au début.'); return;
    }
    if (enfants.length === 0) { setErreurForm('Ajoutez d’abord un enfant.'); return; }

    setBusy(true);
    const creation = nouveauSegment !== null;
    const r = (p.exceptionId && !creation)
      ? await modifierException({
          id: p.exceptionId, parentId,
          debut: horodatage(debut), fin: horodatage(fin),
          titre: p.libelle,
        })
      : await creerException({
          householdId, type: 'holiday', enfantIds: enfants.map((e) => e.id),
          parentId, debut: horodatage(debut), fin: horodatage(fin),
          titre: p.libelle, anneeScolaire: p.anneeScolaire,
          periodeOfficielleId: p.holidayId,
        });
    setBusy(false);

    if (r.status === 'ok') {
      const h = heureUtile(debut);
      setMsg(h
        ? `${p.libelle} : chez ${nom(parentId)} à partir de ${h}.`
        : `${p.libelle} : les enfants sont chez ${nom(parentId)}.`);
      setOuvert(null); setNouveauSegment(null); charger();
    } else if (r.status === 'error') {
      // Le détail technique accompagne le message : sans lui, un refus dû à
      // l'horizon de l'offre est indiscernable d'une erreur de saisie.
      setErreurForm(r.details ? `${r.message} (${r.details})` : r.message);
    }
    else setErreurForm('Session non authentifiée. Reconnectez-vous.');
  }

  async function retirer(p: PropositionVacances) {
    if (!p.exceptionId) return;
    const precision = p.segmentsTotal > 1
      ? ` (période ${p.segment} sur ${p.segmentsTotal})`
      : '';
    if (!confirm(
      `Retirer ${p.libelle}${precision} ?\n\n`
      + 'Le rythme habituel reprendra sur ces dates.',
    )) return;

    // Le segment part en entier : une exception par enfant, toutes ensemble.
    const r = await supprimerSegmentVacances(p.exceptionId);
    if (r.status === 'ok') {
      setMsg(`${p.libelle} : retour au rythme habituel sur ces dates.`);
      setOuvert(null); setNouveauSegment(null); charger();
    } else if (r.status === 'error') {
      setErreur(r.details ? `${r.message} — ${r.details}` : r.message);
    }
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
                    && (jourSeul(versChampDateHeure(p.debutRetenu ?? '')) !== p.debutOfficiel
                      || jourSeul(versChampDateHeure(p.finRetenue ?? '')) !== p.finOfficielle);
                  const parent = membres.find((m) => m.profileId === p.parentId);

                  return (
                    <li key={cleDe(p)} className="py-3">
                      <button type="button"
                        onClick={() => (ouvert === cleDe(p) ? setOuvert(null) : ouvrir(p))}
                        aria-expanded={ouvert === cleDe(p)}
                        className="flex w-full items-center gap-3 text-left">
                        <span aria-hidden
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] ${
                            decide ? 'bg-[#FBF3D9] text-[#8A6A1F]' : 'bg-muted text-soft'}`}>
                          🌴
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold leading-snug">
                            {p.libelle}
                            {p.segmentsTotal > 1 && (
                              <span className="ml-1.5 text-[12px] font-semibold text-soft/85">
                                {p.segment} sur {p.segmentsTotal}
                              </span>
                            )}
                          </span>
                          <span className="block text-[13px] leading-snug text-soft/85">
                            {decide
                              ? `Chez ${nom(p.parentId)} · du ${jourFr(p.debutRetenu!)}${
                                  heureUtile(versChampDateHeure(p.debutRetenu!))
                                    ? ` à ${heureUtile(versChampDateHeure(p.debutRetenu!))}` : ''
                                } au ${jourFr(p.finRetenue!)}${
                                  heureUtile(versChampDateHeure(p.finRetenue!))
                                    ? ` à ${heureUtile(versChampDateHeure(p.finRetenue!))}` : ''
                                }`
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
                          ouvert === cleDe(p) ? 'rotate-90' : ''}`}>
                          <Icone nom="chevron" taille={16} />
                        </span>
                      </button>

                      {modifie && (
                        <p className="mt-1 pl-[3.25rem] text-[11px] text-soft/85">
                          Dates ajustées par rapport au calendrier officiel.
                        </p>
                      )}

                      {/* Partager une période est le cas normal : huit jours
                          chez l'un, huit chez l'autre. Ce bouton n'apparaît
                          que sur le dernier segment, pour ne pas multiplier
                          les points d'entrée. */}
                      {decide && p.segment === p.segmentsTotal && (
                        <button type="button"
                          className="mt-2 text-[13px] font-bold text-navy-text underline"
                          onClick={() => ajouterSegment(p)}>
                          Partager cette période avec l’autre parent
                        </button>
                      )}

                      {(ouvert === cleDe(p)
                        || (ouvert === `${p.holidayId}#nouveau` && nouveauSegment?.holidayId === p.holidayId
                            && p.segment === p.segmentsTotal)) && (
                        <div className="mt-3 space-y-3">
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

                          {/* Un seul sélecteur par borne : le calendrier
                              natif propose la date ET l'heure, ce qui évite
                              deux champs à remplir séparément. */}
                          <div className="space-y-2">
                            <label className="block">
                              <span className="mb-1 block text-sm font-bold">
                                Début — date et heure
                              </span>
                              <input type="datetime-local" value={debut}
                                     onChange={(e) => setDebut(e.target.value)} />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-bold">
                                Fin — date et heure
                              </span>
                              <input type="datetime-local" value={fin}
                                     onChange={(e) => setFin(e.target.value)} />
                            </label>
                          </div>

                          {(heureUtile(debut) || heureUtile(fin)) && (
                            <p className="rounded-xl bg-muted px-3 py-2 text-[12px] leading-snug text-soft">
                              {heureUtile(debut)
                                && `Le ${jourFr(jourSeul(debut))}, les enfants passent chez ${nom(parentId)} à ${heureUtile(debut)}. `}
                              {heureUtile(fin)
                                && `Ils repartent le ${jourFr(jourSeul(fin))} à ${heureUtile(fin)}. `}
                              Ces journées apparaîtront coupées en deux dans le planning.
                            </p>
                          )}

                          {erreurForm && (
                            <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                              {erreurForm}
                            </p>
                          )}

                          <button className="btn btn-primary w-full" disabled={busy}
                            onClick={() => enregistrer(p, ctx.contexte.foyer.id)}>
                            {busy ? 'Enregistrement…'
                              : nouveauSegment ? 'Ajouter cette seconde période'
                              : decide ? 'Mettre à jour' : 'Valider cette période'}
                          </button>
                          {nouveauSegment && (
                            <button type="button"
                              className="text-[13px] font-bold text-soft underline"
                              onClick={() => { setNouveauSegment(null); setOuvert(null); }}>
                              Annuler l’ajout
                            </button>
                          )}
                          {decide && (
                            <button type="button" className="text-[13px] font-bold text-err underline"
                                    onClick={() => retirer(p)}>
                              {p.segmentsTotal > 1
                                ? `Retirer cette période (${p.segment} sur ${p.segmentsTotal})`
                                : 'Retirer cette décision'}
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

          {/* Le parcours de configuration passe par ici : il doit pouvoir
              reprendre où il en était. */}
          <Link href="/app/foyer" className="btn btn-ghost w-full">
            Terminer et revenir aux paramètres
          </Link>

          <p className="px-1 text-center text-[11px] leading-snug text-soft/85">
            Pour un échange ponctuel, un voyage ou une absence, utilisez{' '}
            <Link href="/app/exceptions" className="underline">Changements et exceptions</Link>.
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
