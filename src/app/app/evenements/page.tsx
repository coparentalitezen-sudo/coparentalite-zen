'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  creerEvenement, listerEvenements, modifierEvenement, supprimerEvenement,
  type EvenementPlanning, type TypeEvenement,
} from '@/lib/actions';

const TYPES: { code: TypeEvenement; label: string }[] = [
  { code: 'school', label: 'École' },
  { code: 'medical', label: 'Santé / médecin' },
  { code: 'activity', label: 'Activité / sport' },
  { code: 'birthday', label: 'Anniversaire' },
  { code: 'handover', label: 'Passage de garde' },
  { code: 'other', label: 'Autre' },
];

const RAPPELS = [
  { value: 5, label: '5 min avant' },
  { value: 15, label: '15 min avant' },
  { value: 30, label: '30 min avant' },
  { value: 60, label: '1 h avant' },
  { value: 180, label: '3 h avant' },
  { value: 1440, label: 'La veille' },
  { value: 2880, label: '2 jours avant' },
];

function localInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function versIso(local: string): string {
  return new Date(local).toISOString();
}

function dateLisible(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default function EvenementsPage() {
  const { ctx, recharger } = useContexte();
  const params = useSearchParams();
  const jourParam = params.get('jour');
  const debutInitial = useMemo(() => {
    const d = jourParam ? new Date(`${jourParam}T17:00:00`) : new Date(Date.now() + 3600000);
    d.setMinutes(0, 0, 0);
    return localInput(d);
  }, [jourParam]);

  const [evenements, setEvenements] = useState<EvenementPlanning[]>([]);
  const [chargement, setChargement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<EvenementPlanning | null>(null);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeEvenement>('school');
  const [enfantId, setEnfantId] = useState('');
  const [debut, setDebut] = useState(debutInitial);
  const [fin, setFin] = useState('');
  const [lieu, setLieu] = useState('');
  const [description, setDescription] = useState('');
  const [texteRappel, setTexteRappel] = useState('N’oublie pas son cartable et les affaires nécessaires.');
  const [rappels, setRappels] = useState<number[]>([60]);
  const [jourEntier, setJourEntier] = useState(false);

  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];

  const charger = useCallback(async () => {
    if (ctx.etat !== 'pret') return;
    const maintenant = new Date();
    const from = new Date(maintenant.getFullYear() - 1, 0, 1).toISOString();
    const to = new Date(maintenant.getFullYear() + 2, 11, 31, 23, 59, 59).toISOString();
    const r = await listerEvenements(ctx.contexte.foyer.id, from, to);
    if (r.status === 'ok') setEvenements(r.data);
    else if (r.status === 'error') setErreur(r.message);
  }, [ctx]);

  useEffect(() => { void charger(); }, [charger]);

  function reset() {
    setEdition(null); setTitre(''); setType('school'); setEnfantId('');
    setDebut(debutInitial); setFin(''); setLieu(''); setDescription('');
    setTexteRappel('N’oublie pas son cartable et les affaires nécessaires.');
    setRappels([60]); setJourEntier(false);
  }

  function ouvrirEdition(e: EvenementPlanning) {
    setEdition(e); setTitre(e.titre); setType(e.type); setEnfantId(e.enfantId ?? '');
    setDebut(localInput(new Date(e.debut)));
    setFin(e.fin ? localInput(new Date(e.fin)) : '');
    setLieu(e.lieu ?? ''); setDescription(e.description ?? '');
    setTexteRappel(e.texteRappel ?? ''); setRappels(e.rappels); setJourEntier(e.jourEntier);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleRappel(v: number) {
    setRappels((actuels) => actuels.includes(v)
      ? actuels.filter((x) => x !== v)
      : [...actuels, v].sort((a, b) => a - b));
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (ctx.etat !== 'pret') return;
    setChargement(true); setErreur(null); setMessage(null);
    const saisie = {
      enfantId: enfantId || null,
      type, titre: titre.trim(),
      description: description.trim() || null,
      lieu: lieu.trim() || null,
      debut: versIso(debut),
      fin: fin ? versIso(fin) : null,
      jourEntier,
      rappels,
      texteRappel: texteRappel.trim() || null,
    };
    const r = edition
      ? await modifierEvenement(edition.id, saisie)
      : await creerEvenement({ householdId: ctx.contexte.foyer.id, ...saisie });
    setChargement(false);
    if (r.status === 'error') { setErreur(r.message); return; }
    setMessage(edition ? 'Rendez-vous modifié.' : 'Rendez-vous ajouté au planning.');
    reset(); await charger();
  }

  async function supprimer(e: EvenementPlanning) {
    if (!window.confirm(`Supprimer « ${e.titre} » ?`)) return;
    const r = await supprimerEvenement(e.id);
    if (r.status === 'error') setErreur(r.message);
    else { setMessage('Rendez-vous supprimé.'); if (edition?.id === e.id) reset(); await charger(); }
  }

  return (
    <main className="space-y-4 px-4 pb-28 pt-3">
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour gérer les rendez-vous." />}

      {ctx.etat === 'pret' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-soft">Planning partagé</p>
              <h1 className="font-display text-2xl font-semibold">Rendez-vous et rappels</h1>
            </div>
            <Link href="/app/planning" className="btn btn-ghost">Planning</Link>
          </div>

          {erreur && <Erreur message={erreur} />}
          {message && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{message}</p>}

          <form onSubmit={enregistrer} className="card space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{edition ? 'Modifier le rendez-vous' : 'Ajouter un rendez-vous'}</h2>
              {edition && <button type="button" onClick={reset} className="text-sm font-bold text-soft">Annuler</button>}
            </div>

            <label className="block text-sm font-bold">Titre
              <input className="input mt-1 w-full" required maxLength={120} value={titre}
                onChange={(e) => setTitre(e.target.value)} placeholder="Dentiste, réunion d’école, entraînement…" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold">Type
                <select className="input mt-1 w-full" value={type} onChange={(e) => setType(e.target.value as TypeEvenement)}>
                  {TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold">Enfant
                <select className="input mt-1 w-full" value={enfantId} onChange={(e) => setEnfantId(e.target.value)}>
                  <option value="">Tous / foyer</option>
                  {enfants.map((c) => <option key={c.id} value={c.id}>{c.prenom}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">Début
                <input type="datetime-local" className="input mt-1 w-full" required value={debut} onChange={(e) => setDebut(e.target.value)} />
              </label>
              <label className="block text-sm font-bold">Fin facultative
                <input type="datetime-local" className="input mt-1 w-full" value={fin} onChange={(e) => setFin(e.target.value)} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={jourEntier} onChange={(e) => setJourEntier(e.target.checked)} /> Journée entière
            </label>

            <label className="block text-sm font-bold">Lieu
              <input className="input mt-1 w-full" value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="École, cabinet, gymnase…" />
            </label>
            <label className="block text-sm font-bold">Informations
              <textarea className="input mt-1 min-h-20 w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Documents à apporter, nom du professionnel…" />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold">Rappels dans l’application</legend>
              <div className="flex flex-wrap gap-2">
                {RAPPELS.map((r) => (
                  <label key={r.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${rappels.includes(r.value) ? 'border-ink bg-ink text-white' : 'border-line bg-card text-soft'}`}>
                    <input type="checkbox" className="sr-only" checked={rappels.includes(r.value)} onChange={() => toggleRappel(r.value)} />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm font-bold">Message du rappel
              <textarea className="input mt-1 min-h-20 w-full" value={texteRappel}
                onChange={(e) => setTexteRappel(e.target.value)}
                placeholder="N’oublie pas son cartable, sa carte Vitale, sa tenue de sport…" />
            </label>

            <button disabled={chargement} className="btn btn-primary w-full">
              {chargement ? 'Enregistrement…' : edition ? 'Enregistrer les modifications' : 'Ajouter au planning'}
            </button>
          </form>

          <section className="card divide-y divide-line-soft overflow-hidden">
            <div className="p-4"><h2 className="font-display text-lg font-semibold">Rendez-vous enregistrés</h2></div>
            {evenements.length === 0 && <p className="p-4 text-sm text-soft">Aucun rendez-vous pour le moment.</p>}
            {evenements.map((ev) => (
              <article key={ev.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{ev.titre}</h3>
                    <p className="text-sm text-soft">{dateLisible(ev.debut)}{ev.enfantPrenom ? ` · ${ev.enfantPrenom}` : ''}</p>
                    {ev.lieu && <p className="text-sm">📍 {ev.lieu}</p>}
                    {ev.texteRappel && <p className="mt-1 rounded-lg bg-muted px-2 py-1.5 text-xs text-soft">🔔 {ev.texteRappel}</p>}
                  </div>
                  <span className="rounded-full bg-p1-bg px-2 py-1 text-[11px] font-bold text-navy-text">{TYPES.find((t) => t.code === ev.type)?.label ?? 'Rendez-vous'}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => ouvrirEdition(ev)} className="btn btn-ghost flex-1">Modifier</button>
                  <button type="button" onClick={() => void supprimer(ev)} className="btn btn-ghost flex-1 text-err">Supprimer</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      <BottomNav active="/app/planning" />
    </main>
  );
}
