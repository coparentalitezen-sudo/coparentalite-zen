'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import {
  listerRendezVous, listerCategoriesRdv, creerRendezVous, supprimerRendezVous,
  modifierRendezVous, cocherAffaire, ajouterAffaire,
  type RendezVous, type CategorieRdv,
} from '@/lib/actions';

function jourFr(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
function heureFr(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
/** Champ datetime-local vers ISO. */
function versISO(valeur: string) {
  return new Date(valeur).toISOString();
}
/**
 * ISO vers champ datetime-local.
 *
 * toISOString() ramènerait à UTC et décalerait l'heure affichée : un
 * rendez-vous de 18:00 se rouvrirait à 16:00 en heure d'été. On compose donc
 * la valeur à partir des composantes locales.
 */
function versChampLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ContenuRendezVous() {
  const { ctx, recharger } = useContexte();
  const [liste, setListe] = useState<RendezVous[] | null>(null);
  const [categories, setCategories] = useState<CategorieRdv[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [formOuvert, setFormOuvert] = useState(false);
  const [categorie, setCategorie] = useState('sante');
  const [titre, setTitre] = useState('');
  const [debut, setDebut] = useState('');
  const [lieu, setLieu] = useState('');
  const [accompagnant, setAccompagnant] = useState('');
  const [enfantsChoisis, setEnfantsChoisis] = useState<string[]>([]);
  const [affaires, setAffaires] = useState<string[]>([]);
  const [nouvelleAffaire, setNouvelleAffaire] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  /** Rendez-vous en cours de modification, et champs modifiables. */
  const [enEdition, setEnEdition] = useState<RendezVous | null>(null);
  const [editTitre, setEditTitre] = useState('');
  const [editDebut, setEditDebut] = useState('');
  const [editLieu, setEditLieu] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAccompagnant, setEditAccompagnant] = useState('');
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const dans90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    listerRendezVous(hid, aujourdhui, dans90).then((r) => {
      if (r.status === 'ok') { setListe(r.data); setErreur(null); }
      else if (r.status === 'error') {
        setListe([]);
        setErreur(r.details ? `${r.message} — ${r.details}` : r.message);
      }
    });
    listerCategoriesRdv().then((r) => { if (r.status === 'ok') setCategories(r.data); });
  }, [ctx]);
  useEffect(charger, [charger]);

  const cat = categories.find((c) => c.code === categorie);

  function reinitialiser() {
    setTitre(''); setDebut(''); setLieu(''); setAccompagnant('');
    setEnfantsChoisis(enfants.length === 1 ? [enfants[0].id] : []);
    setAffaires([]); setNouvelleAffaire(''); setErreurForm(null);
  }

  async function enregistrer() {
    if (ctx.etat !== 'pret') return;
    setErreurForm(null);
    if (!titre.trim()) { setErreurForm('Donnez un intitulé au rendez-vous.'); return; }
    if (!debut) { setErreurForm('Indiquez la date et l’heure.'); return; }
    if (enfantsChoisis.length === 0) { setErreurForm('Indiquez quel enfant est concerné.'); return; }

    setBusy(true);
    const r = await creerRendezVous({
      householdId: ctx.contexte.foyer.id,
      categorie, titre, debut: versISO(debut),
      lieu: lieu || null,
      accompagnant: accompagnant || null,
      enfantIds: enfantsChoisis,
      affaires,
    });
    setBusy(false);
    if (r.status === 'ok') {
      setMsg('Rendez-vous ajouté. L’autre parent en est informé.');
      setFormOuvert(false); reinitialiser(); charger();
    } else if (r.status === 'error') setErreurForm(r.message);
  }

  function ouvrirEdition(r: RendezVous) {
    // Tous les champs modifiables sont pré-remplis, y compris ceux qui ne
    // seront pas touchés : la mise à jour remplace l'enregistrement entier,
    // si bien qu'un champ laissé vide effacerait la valeur existante.
    setEnEdition(r);
    setEditTitre(r.titre);
    setEditDebut(versChampLocal(r.debut));
    setEditLieu(r.lieu ?? '');
    setEditNote(r.note ?? '');
    setEditAccompagnant(r.accompagnant ?? '');
    setErreurEdition(null);
  }

  async function enregistrerEdition() {
    if (!enEdition) return;
    setErreurEdition(null);
    if (!editTitre.trim()) { setErreurEdition('Donnez un intitulé au rendez-vous.'); return; }
    if (!editDebut) { setErreurEdition('Indiquez la date et l’heure.'); return; }

    setBusy(true);
    const res = await modifierRendezVous({
      id: enEdition.id,
      titre: editTitre,
      debut: versISO(editDebut),
      lieu: editLieu || null,
      note: editNote || null,
      accompagnant: editAccompagnant || null,
    });
    setBusy(false);
    if (res.status === 'ok') {
      setMsg('Rendez-vous modifié. L’autre parent en est informé.');
      setEnEdition(null); charger();
    } else if (res.status === 'error') setErreurEdition(res.message);
  }

  async function retirer(r: RendezVous) {
    if (!confirm(`Annuler « ${r.titre} » ?`)) return;
    const res = await supprimerRendezVous(r.id);
    if (res.status === 'ok') { setMsg('Rendez-vous annulé.'); charger(); }
    else if (res.status === 'error') setErreur(res.message);
  }

  // Regroupement par jour : un parent pense en journées, pas en liste plate
  const parJour = (liste ?? []).reduce<Record<string, RendezVous[]>>((acc, r) => {
    (acc[r.debut.slice(0, 10)] ??= []).push(r);
    return acc;
  }, {});

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">Rendez-vous</h1>
        <Link href="/app/planning" className="text-[13px] font-semibold text-soft/85">Planning</Link>
      </div>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour gérer les rendez-vous." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          {enfants.length === 0 ? (
            <Vide titre="Ajoutez d’abord un enfant"
                  texte="Un rendez-vous concerne toujours un enfant."
                  action={{ href: '/app/enfants', label: 'Ajouter un enfant' }} />
          ) : !formOuvert ? (
            <button className="btn btn-primary w-full"
                    onClick={() => { reinitialiser(); setFormOuvert(true); }}>
              Ajouter un rendez-vous
            </button>
          ) : (
            <section className="card space-y-3 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">Nouveau rendez-vous</h2>
                <button type="button" className="text-[13px] font-semibold text-soft/85"
                        onClick={() => setFormOuvert(false)}>Annuler</button>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">Type</legend>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button key={c.code} type="button" aria-pressed={categorie === c.code}
                      onClick={() => setCategorie(c.code)}
                      className={`btn px-3 py-2 text-[13px] ${
                        categorie === c.code ? 'btn-primary' : 'btn-ghost'}`}>
                      {c.libelle}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1 block text-sm font-bold">Intitulé</span>
                <input type="text" maxLength={80} value={titre}
                       placeholder="Dentiste, réunion, match…"
                       onChange={(e) => setTitre(e.target.value)} />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold">Date et heure</span>
                <input type="datetime-local" value={debut}
                       onChange={(e) => setDebut(e.target.value)} />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold">
                  Lieu <span className="font-normal text-soft">(facultatif)</span>
                </span>
                <input type="text" maxLength={80} value={lieu}
                       onChange={(e) => setLieu(e.target.value)} />
              </label>

              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">Enfant concerné</legend>
                <div className="flex flex-wrap gap-2">
                  {enfants.map((e) => {
                    const choisi = enfantsChoisis.includes(e.id);
                    return (
                      <button key={e.id} type="button" aria-pressed={choisi}
                        onClick={() => setEnfantsChoisis((l) =>
                          choisi ? l.filter((x) => x !== e.id) : [...l, e.id])}
                        className={`btn px-3 py-2 text-[13px] ${choisi ? 'btn-primary' : 'btn-ghost'}`}>
                        {e.prenom}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* L'accompagnant n'est pas forcément le parent gardien : un
                  parent peut emmener l'enfant chez le médecin un jour où il
                  n'est pas chez lui. */}
              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">
                  Qui accompagne <span className="font-normal text-soft">(facultatif)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={accompagnant === ''}
                    onClick={() => setAccompagnant('')}
                    className={`btn px-3 py-2 text-[13px] ${accompagnant === '' ? 'btn-primary' : 'btn-ghost'}`}>
                    Le parent de garde
                  </button>
                  {membres.filter((m) => !m.provisoire || true).map((m) => (
                    <button key={m.profileId} type="button" aria-pressed={accompagnant === m.profileId}
                      onClick={() => setAccompagnant(m.profileId)}
                      className={`btn px-3 py-2 text-[13px] ${
                        accompagnant === m.profileId ? 'btn-primary' : 'btn-ghost'}`}>
                      {m.nom}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Affaires à prévoir : le cœur de la demande. */}
              <div>
                <p className="mb-1.5 text-sm font-bold">À ne pas oublier</p>
                {cat && cat.suggestions.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {cat.suggestions.filter((s) => !affaires.includes(s)).map((s) => (
                      <button key={s} type="button"
                        onClick={() => setAffaires((l) => [...l, s])}
                        className="rounded-full bg-muted px-2.5 py-1.5 text-[12px] font-semibold text-soft">
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
                {affaires.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {affaires.map((a, i) => (
                      <li key={`${a}-${i}`} className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
                        <span className="flex-1 text-[13px] font-semibold">{a}</span>
                        <button type="button" aria-label={`Retirer ${a}`}
                          onClick={() => setAffaires((l) => l.filter((_, j) => j !== i))}
                          className="text-[12px] font-bold text-err">Retirer</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input type="text" maxLength={60} value={nouvelleAffaire}
                         placeholder="Cartable, maillot, goûter…"
                         onChange={(e) => setNouvelleAffaire(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && nouvelleAffaire.trim()) {
                             e.preventDefault();
                             setAffaires((l) => [...l, nouvelleAffaire.trim()]);
                             setNouvelleAffaire('');
                           }
                         }} />
                  <button type="button" className="btn btn-ghost shrink-0 px-4"
                          disabled={!nouvelleAffaire.trim()}
                          onClick={() => {
                            setAffaires((l) => [...l, nouvelleAffaire.trim()]);
                            setNouvelleAffaire('');
                          }}>
                    Ajouter
                  </button>
                </div>
              </div>

              {erreurForm && (
                <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                  {erreurForm}
                </p>
              )}

              <button className="btn btn-primary w-full" disabled={busy} onClick={enregistrer}>
                {busy ? 'Enregistrement…' : 'Enregistrer le rendez-vous'}
              </button>
            </section>
          )}

          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-soft">
            Les rendez-vous s’ajoutent au planning sans modifier la garde :
            noter une consultation ne déplace aucun enfant.
          </p>

          {liste !== null && (
            liste.length === 0 ? (
              <Vide titre="Aucun rendez-vous à venir"
                    texte="Ajoutez les consultations, réunions et activités des enfants." />
            ) : (
              Object.entries(parJour).map(([jour, rdvs]) => (
                <section key={jour} className="card px-4 py-4">
                  <h2 className="font-display text-[15px] font-semibold capitalize tracking-tight">
                    {jourFr(jour + 'T12:00:00')}
                  </h2>
                  <ul className="mt-2 divide-y divide-line-soft">
                    {rdvs.map((r) => (
                      <li key={r.id} className="py-3">
                        <button type="button"
                          onClick={() => {
                            const ferme = ouvert === r.id;
                            setOuvert(ferme ? null : r.id);
                            // Replier la carte doit abandonner l'édition :
                            // la rouvrir afficherait sinon des champs saisis
                            // mais jamais enregistrés.
                            if (ferme || enEdition?.id !== r.id) setEnEdition(null);
                          }}
                          aria-expanded={ouvert === r.id}
                          className="flex w-full items-start gap-3 text-left">
                          <span aria-hidden
                            className="mt-0.5 h-9 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: r.couleur ?? '#4E6381' }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold leading-snug">{r.titre}</span>
                            <span className="block text-[13px] leading-snug text-soft/85">
                              {r.journeeEntiere ? 'Toute la journée' : heureFr(r.debut)}
                              {r.enfants && ` · ${r.enfants}`}
                              {r.lieu && ` · ${r.lieu}`}
                            </span>
                            {r.affairesTotal > 0 && (
                              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                r.affairesCochees === r.affairesTotal
                                  ? 'bg-ok-bg text-ok' : 'bg-wait-bg text-wait'}`}>
                                {r.affairesCochees}/{r.affairesTotal} préparé
                              </span>
                            )}
                          </span>
                          <span aria-hidden className={`mt-1 shrink-0 text-soft/60 transition-transform ${
                            ouvert === r.id ? 'rotate-90' : ''}`}>
                            <Icone nom="chevron" taille={16} />
                          </span>
                        </button>

                        {ouvert === r.id && (
                          enEdition?.id === r.id ? (
                            <div className="mt-2.5 space-y-3 pl-4">
                              <label className="block">
                                <span className="mb-1 block text-sm font-bold">Intitulé</span>
                                <input type="text" maxLength={80} value={editTitre}
                                       onChange={(e) => setEditTitre(e.target.value)} />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-sm font-bold">Date et heure</span>
                                <input type="datetime-local" value={editDebut}
                                       onChange={(e) => setEditDebut(e.target.value)} />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-sm font-bold">
                                  Lieu <span className="font-normal text-soft">(facultatif)</span>
                                </span>
                                <input type="text" maxLength={80} value={editLieu}
                                       onChange={(e) => setEditLieu(e.target.value)} />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-sm font-bold">
                                  Note <span className="font-normal text-soft">(facultatif)</span>
                                </span>
                                <input type="text" maxLength={200} value={editNote}
                                       onChange={(e) => setEditNote(e.target.value)} />
                              </label>

                              <fieldset>
                                <legend className="mb-1.5 text-sm font-bold">Qui accompagne</legend>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" aria-pressed={editAccompagnant === ''}
                                    onClick={() => setEditAccompagnant('')}
                                    className={`btn px-3 py-2 text-[13px] ${
                                      editAccompagnant === '' ? 'btn-primary' : 'btn-ghost'}`}>
                                    Le parent de garde
                                  </button>
                                  {membres.map((m) => (
                                    <button key={m.profileId} type="button"
                                      aria-pressed={editAccompagnant === m.profileId}
                                      onClick={() => setEditAccompagnant(m.profileId)}
                                      className={`btn px-3 py-2 text-[13px] ${
                                        editAccompagnant === m.profileId ? 'btn-primary' : 'btn-ghost'}`}>
                                      {m.nom}
                                    </button>
                                  ))}
                                </div>
                              </fieldset>

                              {/* Le type, les enfants et les affaires ne sont pas
                                  modifiables : la fonction de mise à jour ne les
                                  touche pas. Les afficher ici laisserait croire
                                  qu'ils ont été enregistrés. */}
                              <p className="rounded-xl bg-muted px-3 py-2 text-[12px] leading-snug text-soft">
                                Pour changer le type, les enfants concernés ou les
                                affaires à prévoir, annulez ce rendez-vous et
                                recréez-le.
                              </p>

                              {erreurEdition && (
                                <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                                  {erreurEdition}
                                </p>
                              )}

                              <div className="flex gap-2">
                                <button type="button" className="btn btn-primary flex-1"
                                        disabled={busy} onClick={enregistrerEdition}>
                                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                                <button type="button" className="btn btn-ghost shrink-0 px-4"
                                        onClick={() => setEnEdition(null)}>
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                          <div className="mt-2.5 space-y-2 pl-4">
                            {r.accompagnantNom && (
                              <p className="text-[13px]">
                                Accompagné par <strong>{r.accompagnantNom}</strong>
                              </p>
                            )}
                            {r.note && <p className="text-[13px] text-soft">{r.note}</p>}
                            {r.affaires.length > 0 && (
                              <div>
                                <p className="text-[13px] font-bold">À ne pas oublier</p>
                                <ul className="mt-1 space-y-1">
                                  {r.affaires.map((a) => (
                                    <li key={a} className="text-[13px] text-soft">· {a}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-4">
                              <button type="button" className="text-[13px] font-bold underline"
                                      onClick={() => ouvrirEdition(r)}>
                                Modifier ce rendez-vous
                              </button>
                              <button type="button" className="text-[13px] font-bold text-err underline"
                                      onClick={() => retirer(r)}>
                                Annuler ce rendez-vous
                              </button>
                            </div>
                          </div>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )
          )}
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}

/** Frontière Suspense : immunise la page contre l'échec de génération statique. */
export default function PageRendezVous() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuRendezVous />
    </Suspense>
  );
}
