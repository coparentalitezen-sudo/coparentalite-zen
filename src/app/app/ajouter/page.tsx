'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import { creerDepense } from '@/lib/actions';
import { splitAmount, formatCents } from '@/lib/money';
import { checkFile, formatBytes, MAX_JUSTIFICATIF_BYTES } from '@/lib/files';

const REPARTITIONS = [
  { label: '50 / 50', p1: 5000 }, { label: '60 / 40', p1: 6000 },
  { label: '70 / 30', p1: 7000 }, { label: '100 / 0', p1: 10000 },
];

export default function Ajouter() {
  const router = useRouter();
  const { ctx, recharger } = useContexte();

  const [titre, setTitre] = useState('');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categorieId, setCategorieId] = useState<string>('');
  const [payePar, setPayePar] = useState<string>('');
  const [enfantIds, setEnfantIds] = useState<string[]>([]);
  const [split, setSplit] = useState(5000);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  // euros saisis → centimes entiers, sans jamais passer par un flottant
  const montantCents = useMemo(() => {
    const clean = montant.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    const [e, c = ''] = clean.split('.');
    return Number(e) * 100 + Number((c + '00').slice(0, 2));
  }, [montant]);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const parent1 = membres[0];
  const parent2 = membres[1];

  const apercu = useMemo(() => {
    if (!montantCents || montantCents <= 0 || !parent1) return null;
    const regles = parent2
      ? [{ kind: 'percentage' as const, parentId: parent1.profileId, basisPoints: split },
         { kind: 'percentage' as const, parentId: parent2.profileId, basisPoints: 10000 - split }]
      : [{ kind: 'percentage' as const, parentId: parent1.profileId, basisPoints: 10000 }];
    try { return splitAmount(montantCents, regles); } catch { return null; }
  }, [montantCents, split, parent1, parent2]);

  async function envoyer(householdId: string) {
    setErreur(null);
    if (!titre.trim()) { setErreur('Indiquez un titre pour la dépense.'); return; }
    if (!montantCents || montantCents <= 0) { setErreur('Indiquez un montant valide, par exemple 24,90.'); return; }
    if (enfantIds.length === 0) { setErreur('Sélectionnez au moins un enfant concerné.'); return; }
    if (!payePar) { setErreur('Indiquez qui a payé.'); return; }
    if (fichier) {
      const c = checkFile(fichier, MAX_JUSTIFICATIF_BYTES);
      if (!c.ok) { setErreur(c.message); return; }
    }
    if (!parent1) { setErreur('Aucun parent actif n’est disponible dans ce foyer.'); return; }
    const regles = parent2
      ? [{ kind: 'percentage' as const, parentId: parent1.profileId, basisPoints: split },
         { kind: 'percentage' as const, parentId: parent2.profileId, basisPoints: 10000 - split }]
      : [{ kind: 'percentage' as const, parentId: parent1.profileId, basisPoints: 10000 }];

    setBusy(true);
    const r = await creerDepense({
      householdId, titre, montantCents, date,
      categorieId: categorieId || null, payePar, enfantIds, regles,
      justificatif: fichier,
    });
    setBusy(false);
    if (r.status === 'ok') setFait(true);
    else if (r.status === 'demo') setFait(true);
    else setErreur(r.message);
  }

  if (fait) {
    return (
      <main className="space-y-4 px-4 py-4">
        <section className="card p-6 text-center">
          <p className="text-3xl" aria-hidden>✓</p>
          <h1 className="mt-2 font-display text-xl font-semibold">Dépense enregistrée</h1>
          <p className="mt-1 text-sm text-soft">
            {parent2
              ? 'L’autre parent pourra la consulter et la valider depuis l’onglet Dépenses.'
              : 'Elle est enregistrée. Invitez l’autre parent pour qu’il puisse la valider.'}
          </p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => router.push('/app/depenses')}>
            Voir les dépenses
          </button>
          <button className="btn btn-ghost mt-2 w-full"
            onClick={() => { setFait(false); setTitre(''); setMontant(''); setFichier(null); setEnfantIds([]); recharger(); }}>
            Ajouter une autre dépense
          </button>
        </section>
        <BottomNav active="/app/ajouter" />
      </main>
    );
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Ajouter une dépense</h1>

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && (
        <Vide titre="Mode démonstration"
              texte="Connectez-vous à un compte réel pour enregistrer de vraies dépenses." />
      )}

      {ctx.etat === 'pret' && ctx.contexte.enfants.length === 0 && (
        <Vide titre="Ajoutez d’abord un enfant"
              texte="Une dépense est toujours rattachée à au moins un enfant."
              action={{ href: '/app/enfants', label: 'Ajouter un enfant' }} />
      )}

      {ctx.etat === 'pret' && ctx.contexte.enfants.length > 0 && (
        <div className="card space-y-4 p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Titre</span>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Cantine, pharmacie…" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold">Montant (€)</span>
            <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="24,90" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-bold">Catégorie</span>
            <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
              <option value="">Sans catégorie</option>
              {ctx.contexte.categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>

          <fieldset>
            <legend className="mb-1 text-sm font-bold">Enfants concernés</legend>
            <div className="flex flex-wrap gap-2">
              {ctx.contexte.enfants.map((c) => {
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
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-bold">Payé par</legend>
            <div className="flex flex-wrap gap-2">
              {membres.map((m) => (
                <button key={m.profileId} type="button" aria-pressed={payePar === m.profileId}
                  onClick={() => setPayePar(m.profileId)}
                  className={`btn flex-1 ${payePar === m.profileId ? 'btn-primary' : 'btn-ghost'}`}>
                  {m.initiale} · {m.nom}
                </button>
              ))}
            </div>
          </fieldset>

          {parent2 && (
            <fieldset>
              <legend className="mb-1 text-sm font-bold">Répartition ({parent1.nom} / {parent2.nom})</legend>
              <div className="grid grid-cols-4 gap-2">
                {REPARTITIONS.map((s) => (
                  <button key={s.p1} type="button" aria-pressed={split === s.p1}
                    onClick={() => setSplit(s.p1)}
                    className={`btn ${split === s.p1 ? 'btn-primary' : 'btn-ghost'} px-0 text-sm`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-bold">Justificatif (facultatif)</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFichier(f);
                if (f) { const c = checkFile(f, MAX_JUSTIFICATIF_BYTES); setErreur(c.ok ? null : c.message); }
              }} />
            {fichier && (
              <span className="mt-1 block text-xs text-soft">
                {fichier.name} · {formatBytes(fichier.size)} — stocké en privé, accessible à votre foyer uniquement.
              </span>
            )}
          </label>

          {apercu && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm" aria-live="polite">
              {membres.map((m, i) => (
                <span key={m.profileId}>
                  {i > 0 && ' · '}{m.nom} : <strong>{formatCents(apercu[i]?.owedCents ?? 0)}</strong>
                </span>
              ))}
            </p>
          )}
          {erreur && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{erreur}</p>}

          <button className="btn btn-primary w-full" disabled={busy}
            onClick={() => envoyer(ctx.contexte.foyer.id)}>
            {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}
          </button>
        </div>
      )}

      <BottomNav active="/app/ajouter" />
    </main>
  );
}
