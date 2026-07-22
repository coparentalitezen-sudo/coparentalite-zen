'use client';

import { useMemo, useState } from 'react';
import { BottomNav } from '@/components/ui';
import { DEMO } from '@/lib/demo-data';
import { splitAmount, formatCents } from '@/lib/money';
import { createExpense, getMyHousehold } from '@/lib/actions';
import { checkFile, formatBytes, MAX_JUSTIFICATIF_BYTES } from '@/lib/files';

const CATEGORIES = ['École','Cantine','Santé','Pharmacie','Vêtements','Chaussures','Sport','Loisirs','Garde','Transport','Vacances','Cadeau','Autre'];
const SPLITS = [
  { label: '50 / 50', p1: 5000 }, { label: '60 / 40', p1: 6000 },
  { label: '70 / 30', p1: 7000 }, { label: '100 / 0', p1: 10000 },
];

export default function Ajouter() {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('École');
  const [paidBy, setPaidBy] = useState('p1');
  const [split, setSplit] = useState(5000);
  const [childIds, setChildIds] = useState<string[]>(['c1']);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Saisie en euros → centimes entiers, sans jamais passer par un flottant
  const amountCents = useMemo(() => {
    const clean = amount.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    const [e, c = ''] = clean.split('.');
    return Number(e) * 100 + Number((c + '00').slice(0, 2));
  }, [amount]);

  const preview = useMemo(() => {
    if (!amountCents || amountCents <= 0) return null;
    return splitAmount(amountCents, [
      { kind: 'percentage', parentId: 'p1', basisPoints: split },
      { kind: 'percentage', parentId: 'p2', basisPoints: 10000 - split },
    ]);
  }, [amountCents, split]);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Indiquez un titre pour la dépense.');
    if (!amountCents || amountCents <= 0) return setError('Indiquez un montant valide, par exemple 24,90.');
    if (childIds.length === 0) return setError('Sélectionnez au moins un enfant concerné.');
    if (file) {
      const c = checkFile(file, MAX_JUSTIFICATIF_BYTES);
      if (!c.ok) return setError(c.message);
    }
    setBusy(true);
    const foyer = await getMyHousehold();
    if (foyer.status === 'demo') { setBusy(false); setSaved(true); return; }
    if (foyer.status !== 'ok' || !foyer.data) {
      setBusy(false);
      return setError('Créez d’abord votre foyer dans « Plus → Paramètres du foyer ».');
    }
    const r = await createExpense({
      householdId: foyer.data.id,
      title, amountCents, spentOn: new Date().toISOString().slice(0, 10),
      category, paidBy, childIds,
      shareRules: [
        { kind: 'percentage', parentId: 'p1', basisPoints: split },
        { kind: 'percentage', parentId: 'p2', basisPoints: 10000 - split },
      ],
      attachment: file,
    });
    setBusy(false);
    if (r.status === 'ok' || r.status === 'demo') setSaved(true);
    else setError(r.message);
  }

  if (saved) {
    return (
      <main className="space-y-4 px-4 py-4">
        <section className="card p-6 text-center">
          <p className="text-3xl" aria-hidden>✓</p>
          <h1 className="mt-2 font-display text-xl font-semibold">Dépense enregistrée</h1>
          <p className="mt-1 text-sm text-soft">
            En version démo, rien n’est conservé. Dans l’application complète, l’autre parent
            reçoit une notification et peut valider la dépense.
          </p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => { setSaved(false); setTitle(''); setAmount(''); }}>
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

      <div className="card space-y-4 p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cantine, pharmacie…" />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold">Montant (€)</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="24,90" />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold">Catégorie</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">Enfants concernés</legend>
          <div className="flex gap-2">
            {DEMO.children.map((c) => {
              const on = childIds.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on}
                  onClick={() => setChildIds(on ? childIds.filter((x) => x !== c.id) : [...childIds, c.id])}
                  className={`btn flex-1 ${on ? 'btn-primary' : 'btn-ghost'}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">Payé par</legend>
          <div className="flex gap-2">
            {DEMO.parents.map((p) => (
              <button key={p.id} type="button" aria-pressed={paidBy === p.id}
                onClick={() => setPaidBy(p.id)}
                className={`btn flex-1 ${paidBy === p.id ? 'btn-primary' : 'btn-ghost'}`}>
                {p.initial} · {p.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">Répartition ({DEMO.parents[0].name} / {DEMO.parents[1].name})</legend>
          <div className="grid grid-cols-4 gap-2">
            {SPLITS.map((s) => (
              <button key={s.p1} type="button" aria-pressed={split === s.p1}
                onClick={() => setSplit(s.p1)}
                className={`btn ${split === s.p1 ? 'btn-primary' : 'btn-ghost'} px-0 text-sm`}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-bold">Justificatif (facultatif)</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) {
                const c = checkFile(f, MAX_JUSTIFICATIF_BYTES);
                setError(c.ok ? null : c.message);
              }
            }}
          />
          {file && <span className="mt-1 block text-xs text-soft">{file.name} · {formatBytes(file.size)} — stocké en privé, accessible uniquement à votre foyer.</span>}
        </label>

        {preview && (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm" aria-live="polite">
            {DEMO.parents[0].name} : <strong>{formatCents(preview[0].owedCents)}</strong> ·{' '}
            {DEMO.parents[1].name} : <strong>{formatCents(preview[1].owedCents)}</strong>
          </p>
        )}
        {error && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>}

        <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}
        </button>
        <p className="text-center text-xs text-soft">
          Événements, demandes de modification, remboursements, documents et notes : dans la version complète.
        </p>
      </div>

      <BottomNav active="/app/ajouter" />
    </main>
  );
}
