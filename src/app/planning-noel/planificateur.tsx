'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { DecoupageNoel } from '@/lib/noel';
import {
  FORMULES, bornes, planningNoel, type FormuleNoel, type Parent, type PeriodeNoel,
} from '@/lib/planning-noel';

/**
 * Le planning de Noël en trois choix, sans inscription.
 *
 * Tout se passe dans le navigateur : les prénoms tapés ne sont envoyés nulle
 * part, l'image est dessinée sur place. Le seul appel réseau compte « un
 * planning fait » (aucune donnée personnelle), une fois par session.
 */

const COULEUR = { moi: '#4E6381', autre: '#A85548', aucun: '#8A8F98' } as const;

function nomDe(p: Parent | null, prenoms: { moi: string; autre: string }): string {
  if (p === null) return 'Rythme habituel';
  const saisi = prenoms[p].trim();
  if (saisi) return saisi;
  return p === 'moi' ? 'Toi' : 'L’autre parent';
}

/** Les jours sans fête désignée n'ont pas besoin de répéter « rythme habituel ». */
function detail(p: PeriodeNoel): string {
  const quand = bornes(p);
  return p.parent === null ? quand.charAt(0).toUpperCase() + quand.slice(1) : `${p.libelle} · ${quand}`;
}

function dessiner(
  canvas: HTMLCanvasElement, annee: string, periodes: PeriodeNoel[],
  prenoms: { moi: string; autre: string },
) {
  const L = 1080, H = 1350;
  canvas.width = L; canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return;
  const police = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  c.fillStyle = '#FCF9F6'; c.fillRect(0, 0, L, H);
  c.fillStyle = '#101B2C';
  c.font = `700 76px ${police}`;
  c.fillText(`Noël ${annee}`, 80, 170);
  c.fillStyle = '#4A5568';
  c.font = `400 36px ${police}`;
  c.fillText('Qui a les enfants, et quand', 80, 230);

  const hauteur = Math.min(170, (H - 500) / periodes.length - 20);
  /** Réduit la police tant que le texte dépasse la carte. */
  const ajuste = (texte: string, poids: number, taille: number, largeur: number) => {
    let t = taille;
    do { c.font = `${poids} ${t}px ${police}`; t -= 2; } while (c.measureText(texte).width > largeur && t > 18);
  };
  periodes.forEach((p, i) => {
    const y = 300 + i * (hauteur + 20);
    const couleur = p.parent ? COULEUR[p.parent] : COULEUR.aucun;
    c.fillStyle = '#FFFFFF';
    c.strokeStyle = '#E3DED8'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(80, y, L - 160, hauteur, 28); c.fill(); c.stroke();
    c.fillStyle = couleur;
    c.beginPath(); c.roundRect(80, y, 22, hauteur, [28, 0, 0, 28]); c.fill();
    c.fillStyle = couleur;
    ajuste(nomDe(p.parent, prenoms), 700, 44, L - 260);
    c.fillText(nomDe(p.parent, prenoms), 136, y + hauteur / 2 - 6);
    c.fillStyle = '#101B2C';
    const ligne = detail(p);
    ajuste(ligne, 400, 32, L - 260);
    c.fillText(ligne, 136, y + hauteur / 2 + 42);
  });

  c.fillStyle = '#4A5568';
  c.font = `400 28px ${police}`;
  c.fillText('Proposition à convenir entre parents.', 80, H - 110);
  c.fillStyle = '#3D4F68';
  c.font = `700 30px ${police}`;
  c.fillText('coparentalitezen.fr', 80, H - 60);
}

export function Planificateur({ noel }: { noel: DecoupageNoel }) {
  const annee = noel.premierJour.slice(0, 4);
  const [formule, setFormule] = useState<FormuleNoel | null>(null);
  const [choisi, setChoisi] = useState<Parent | null>(null);
  const [prenoms, setPrenoms] = useState({ moi: '', autre: '' });
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const resultat = useRef<HTMLDivElement>(null);

  const periodes = useMemo(
    () => (formule && choisi ? planningNoel(noel, formule, choisi) : null),
    [noel, formule, choisi],
  );
  const question = FORMULES.find((f) => f.id === formule)?.question;

  useEffect(() => {
    if (!periodes) return;
    resultat.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      if (window.sessionStorage.getItem('czen_planning_noel')) return;
      window.sessionStorage.setItem('czen_planning_noel', '1');
    } catch {
      return;
    }
    void fetch('/api/marketing/visite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'site', campagne: 'planning-noel', contenu: 'planning-fait' }),
      keepalive: true,
    }).catch(() => { /* une mesure perdue ne casse rien */ });
  }, [periodes]);

  async function enregistrer() {
    if (!periodes || !canvas.current) return;
    dessiner(canvas.current, annee, periodes, prenoms);
    const blob = await new Promise<Blob | null>((ok) => canvas.current!.toBlob(ok, 'image/png'));
    if (!blob) { setMessage('L’image n’a pas pu être créée sur ce navigateur.'); return; }
    const fichier = new File([blob], `planning-noel-${annee}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: `Planning de Noël ${annee}` });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = fichier.name;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 10_000);
    setMessage('Image enregistrée dans tes téléchargements.');
  }

  const bouton = (actif: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-left transition ${
      actif ? 'border-navy-text bg-navy-text text-white' : 'border-line bg-white text-ink'}`;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">1. Comment vous partagez Noël ?</h2>
        {FORMULES.map((f) => (
          <button key={f.id} type="button" className={bouton(formule === f.id)}
            onClick={() => { setFormule(f.id); setChoisi(null); }}>
            <span className="block font-bold">{f.nom}</span>
            <span className={`block text-sm ${formule === f.id ? 'text-white/85' : 'text-soft'}`}>{f.detail}</span>
          </button>
        ))}
      </section>

      {formule && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">2. {question}</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={bouton(choisi === 'moi')} onClick={() => setChoisi('moi')}>
              <span className="block text-center font-bold">Moi</span>
            </button>
            <button type="button" className={bouton(choisi === 'autre')} onClick={() => setChoisi('autre')}>
              <span className="block text-center font-bold">L’autre parent</span>
            </button>
          </div>
        </section>
      )}

      {periodes && (
        <section ref={resultat} className="space-y-4 scroll-mt-4">
          <h2 className="font-display text-xl font-semibold">3. Ton planning de Noël {annee}</h2>
          <details className="text-sm text-soft">
            <summary className="cursor-pointer font-bold text-navy-text">Ajouter les prénoms (facultatif)</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <input aria-label="Ton prénom" placeholder="Ton prénom" maxLength={20}
                className="rounded-lg border border-line px-3 py-2 text-ink"
                value={prenoms.moi} onChange={(e) => setPrenoms({ ...prenoms, moi: e.target.value })} />
              <input aria-label="Prénom de l’autre parent" placeholder="Autre parent" maxLength={20}
                className="rounded-lg border border-line px-3 py-2 text-ink"
                value={prenoms.autre} onChange={(e) => setPrenoms({ ...prenoms, autre: e.target.value })} />
            </div>
            <p className="mt-2">Les prénoms restent sur ton téléphone : ils ne sont envoyés nulle part.</p>
          </details>

          <ul className="space-y-2">
            {periodes.map((p) => (
              <li key={p.debut} className="card flex items-stretch overflow-hidden p-0">
                <span aria-hidden className="w-2 shrink-0"
                  style={{ background: p.parent ? COULEUR[p.parent] : COULEUR.aucun }} />
                <div className="p-4">
                  <p className="font-bold" style={{ color: p.parent ? COULEUR[p.parent] : COULEUR.aucun }}>
                    {nomDe(p.parent, prenoms)}
                  </p>
                  <p className="text-sm text-ink">{detail(p)}</p>
                </div>
              </li>
            ))}
          </ul>

          <button type="button" onClick={enregistrer}
            className="w-full rounded-xl bg-navy-text px-5 py-3 font-bold text-white">
            Enregistrer ou envoyer l’image
          </button>
          {message && <p className="text-sm text-soft" role="status">{message}</p>}
          <canvas ref={canvas} className="hidden" aria-hidden />

          <div className="card space-y-3 p-5">
            <p className="font-bold">Garde ce planning au même endroit que tout le reste</p>
            <p className="text-sm leading-relaxed text-soft">
              Dans l’application, les vacances de ta zone sont déjà placées, un rappel prévient
              chacun avant son tour, et les dépenses des fêtes se notent au même endroit.
              L’autre parent n’a rien à installer.
            </p>
            <Link href="/inscription?utm_source=site&utm_medium=organic_social&utm_campaign=planning-noel&utm_content=planning-fait"
              className="block rounded-xl border border-navy-text px-5 py-3 text-center font-bold text-navy-text">
              Créer mon espace — 3 mois gratuits, sans carte
            </Link>
          </div>
          <p className="text-xs leading-relaxed text-soft">
            Proposition à convenir entre parents. Si un jugement ou une convention homologuée
            fixe le partage des vacances, c’est lui qui s’applique.
          </p>
        </section>
      )}
    </div>
  );
}
