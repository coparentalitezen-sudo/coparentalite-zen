'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  getEtatScolarite, listerCreneaux, importerPhotoEdt, enregistrerImportEdt,
  type EtatScolarite, type CreneauEdt,
} from '@/lib/actions';
import { anneeScolaireDe } from '@/lib/scolarite/edt';
import { checkFile, formatBytes } from '@/lib/files';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
// Filtre grossier avant même de tenter de charger l'image — la vraie limite
// vient de comprimerPhoto ci-dessous.
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
// Les fonctions serverless Vercel refusent une requête au-delà d'environ
// 4,5 Mo. Une photo d'iPhone dépasse déjà cette taille en JPEG brut, avant
// même l'inflation d'environ 33 % du passage en base64 — sans compression,
// l'envoi échoue avant même d'atteindre la route, avec un message d'erreur
// réseau trompeur (vécu en test réel le 2026-09-03).
const CIBLE_BASE64_OCTETS = 3.2 * 1024 * 1024;

/**
 * Redimensionne et réencode la photo en JPEG côté navigateur avant l'envoi.
 * Réduit la qualité par paliers jusqu'à tenir sous la limite de taille de
 * requête serverless — un emploi du temps est du texte structuré, la perte
 * de qualité à ce niveau reste sans effet sur la lisibilité.
 */
function comprimerPhoto(file: File, maxCote = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const echelle = Math.min(1, maxCote / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * echelle);
      canvas.height = Math.round(image.height * echelle);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Compression impossible sur cet appareil')); return; }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      let qualite = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', qualite);
      while (dataUrl.length > CIBLE_BASE64_OCTETS && qualite > 0.4) {
        qualite -= 0.15;
        dataUrl = canvas.toDataURL('image/jpeg', qualite);
      }
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Lecture de la photo impossible')); };
    image.src = url;
  });
}

function ContenuScolarite() {
  const { ctx } = useContexte();
  const params = useSearchParams();
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const anneeScolaire = useMemo(() => anneeScolaireDe(new Date()), []);

  const [enfantId, setEnfantId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatScolarite | null>(null);
  const [creneauxExistants, setCreneauxExistants] = useState<CreneauEdt[]>([]);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const [analyse, setAnalyse] = useState(false);

  const [relecture, setRelecture] = useState<CreneauEdt[] | null>(null);
  const [semaineAbActive, setSemaineAbActive] = useState(false);
  const [dateAncrage, setDateAncrage] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  useEffect(() => {
    if (enfantId || enfants.length === 0) return;
    const depuisLien = params.get('enfant');
    setEnfantId(enfants.find((e) => e.id === depuisLien)?.id ?? enfants[0].id);
  }, [enfants, enfantId, params]);

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret' || !enfantId) return;
    setErreurChargement(null);
    getEtatScolarite(ctx.contexte.foyer.id, enfantId, anneeScolaire).then((r) => {
      if (r.status === 'ok') {
        setEtat(r.data);
        setSemaineAbActive(r.data.semaineAbActive);
        setDateAncrage(r.data.dateAncrageSemaineA ?? '');
      } else if (r.status === 'error') setErreurChargement(r.message);
    });
    listerCreneaux(enfantId, anneeScolaire).then((r) => {
      if (r.status === 'ok') setCreneauxExistants(r.data);
    });
  }, [ctx, enfantId, anneeScolaire]);

  useEffect(charger, [charger]);

  async function onChoisirPhoto(f: File | null) {
    setPhoto(null); setErreurPhoto(null); setSucces(null);
    if (!f) return;
    if (f.type !== 'image/jpeg' && f.type !== 'image/png') {
      setErreurPhoto('Choisissez une photo au format JPEG ou PNG.');
      return;
    }
    const c = checkFile(f, MAX_PHOTO_BYTES);
    if (!c.ok) { setErreurPhoto(c.message); return; }
    setPhoto(f);
  }

  async function onAnalyser() {
    if (!photo || !enfantId) return;
    setErreurPhoto(null);
    setAnalyse(true);
    try {
      const base64 = await comprimerPhoto(photo);
      const r = await importerPhotoEdt(enfantId, base64, 'image/jpeg', anneeScolaire);
      if (r.status === 'ok') {
        if (r.data.creneaux.length === 0) {
          setErreurPhoto('Aucun créneau n’a été reconnu sur cette photo. Reprenez-la, si possible bien à plat et lisible.');
        } else {
          setRelecture(r.data.creneaux);
        }
      } else if (r.status === 'error') {
        setErreurPhoto(r.message);
      }
    } catch {
      setErreurPhoto('La compression ou la lecture de la photo a échoué. Réessayez, avec une photo moins volumineuse si possible.');
    } finally {
      setAnalyse(false);
    }
  }

  function modifierCreneau(i: number, patch: Partial<CreneauEdt>) {
    if (!relecture) return;
    setRelecture(relecture.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function supprimerCreneau(i: number) {
    if (!relecture) return;
    setRelecture(relecture.filter((_, idx) => idx !== i));
  }

  async function onValider() {
    if (!relecture || !enfantId || ctx.etat !== 'pret') return;
    setErreurEnregistrement(null);
    if (semaineAbActive && !dateAncrage) {
      setErreurEnregistrement('Indiquez le lundi de départ de la semaine A pour activer l’alternance.');
      return;
    }
    setEnregistrement(true);
    const r = await enregistrerImportEdt(
      ctx.contexte.foyer.id, enfantId, anneeScolaire,
      semaineAbActive, semaineAbActive ? dateAncrage : null, relecture,
    );
    setEnregistrement(false);
    if (r.status === 'ok') {
      setSucces('Emploi du temps enregistré. Il apparaît désormais dans le planning.');
      setRelecture(null);
      setPhoto(null);
      charger();
    } else if (r.status === 'error') {
      setErreurEnregistrement(r.message);
    } else {
      setSucces('Mode démo : l’emploi du temps serait enregistré.');
      setRelecture(null);
    }
  }

  const enfant = enfants.find((e) => e.id === enfantId);

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Emploi du temps scolaire</h1>

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}

      {ctx.etat === 'pret' && enfants.length === 0 && (
        <Vide titre="Aucun enfant enregistré"
              texte="Ajoutez un enfant pour pouvoir importer son emploi du temps."
              action={{ href: '/app/enfants', label: 'Ajouter un enfant' }} />
      )}

      {ctx.etat === 'pret' && enfants.length > 0 && (
        <>
          {enfants.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {enfants.map((e) => (
                <button key={e.id} type="button" aria-pressed={enfantId === e.id}
                  onClick={() => { setEnfantId(e.id); setRelecture(null); setSucces(null); }}
                  className={`btn flex-1 ${enfantId === e.id ? 'btn-primary' : 'btn-ghost'}`}>
                  {e.prenom}
                </button>
              ))}
            </div>
          )}

          {erreurChargement && <Erreur message={erreurChargement} onReessayer={charger} />}

          {etat && !etat.actif && (
            <div className="card space-y-2 p-4">
              <p className="text-sm font-bold text-wait">
                L’emploi du temps scolaire n’est pas inclus dans votre offre actuelle.
              </p>
              <p className="text-[13px] leading-snug text-soft">
                Cette fonctionnalité est réservée à l’offre Zen Plus.
              </p>
              <Link href="/app/offre" className="btn btn-primary w-full">Voir les options</Link>
            </div>
          )}

          {etat && etat.actif && enfant && !relecture && (
            <>
              <section className="card space-y-3 p-4">
                <h2 className="font-bold">Importer l’emploi du temps de {enfant.prenom}</h2>
                <p className="text-[13px] leading-snug text-soft">
                  Prenez en photo ou choisissez l’emploi du temps ({anneeScolaire}). La photo n’est jamais
                  conservée : seuls les créneaux que vous validez ensuite sont enregistrés.
                </p>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Photo (JPEG ou PNG)</span>
                  <input type="file" accept="image/jpeg,image/png"
                    onChange={(e) => onChoisirPhoto(e.target.files?.[0] ?? null)} />
                  {photo && (
                    <span className="mt-1 block text-xs text-soft">
                      {photo.name} · {formatBytes(photo.size)}
                    </span>
                  )}
                </label>
                {erreurPhoto && (
                  <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{erreurPhoto}</p>
                )}
                <button className="btn btn-primary w-full" disabled={!photo || analyse}
                  onClick={onAnalyser}>
                  {analyse ? 'Lecture en cours…' : 'Analyser la photo'}
                </button>
                <p className="text-xs text-soft">
                  {etat.importsUtilises} import{etat.importsUtilises > 1 ? 's' : ''} sur {etat.importsMax} utilisé{etat.importsUtilises > 1 ? 's' : ''} cette année scolaire.
                </p>
              </section>

              {succes && (
                <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{succes}</p>
              )}

              {creneauxExistants.length > 0 && (
                <section className="card space-y-2 p-4">
                  <h2 className="font-bold">Emploi du temps actuel</h2>
                  <ul className="divide-y divide-line-soft">
                    {creneauxExistants.map((c) => (
                      <li key={c.id} className="py-2 text-[13px] leading-snug">
                        <span className="font-bold">{JOURS[c.jourSemaine - 1]} {c.heureDebut}–{c.heureFin}</span>
                        {c.matiere && <span> · {c.matiere}</span>}
                        {c.salle && <span className="text-soft"> · salle {c.salle}</span>}
                        {c.semaineAb && <span className="text-soft"> · semaine {c.semaineAb}</span>}
                        {c.source === 'manuel' && <span className="text-soft"> · ajouté à la main</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {relecture && (
            <section className="card space-y-3 p-4">
              <h2 className="font-bold">Relisez avant d’enregistrer</h2>
              <p className="text-[13px] leading-snug text-soft">
                Corrigez ou supprimez les créneaux mal lus. Rien n’est enregistré tant que vous n’avez pas validé.
              </p>

              <ul className="space-y-3">
                {relecture.map((c, i) => (
                  <li key={i} className="space-y-2 rounded-xl border border-line p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold">Jour</span>
                        <select value={c.jourSemaine}
                          onChange={(e) => modifierCreneau(i, { jourSemaine: Number(e.target.value) })}>
                          {JOURS.map((j, idx) => <option key={j} value={idx + 1}>{j}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold">Début</span>
                        <input type="time" value={c.heureDebut}
                          onChange={(e) => modifierCreneau(i, { heureDebut: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold">Fin</span>
                        <input type="time" value={c.heureFin}
                          onChange={(e) => modifierCreneau(i, { heureFin: e.target.value })} />
                      </label>
                    </div>
                    <input placeholder="Matière" value={c.matiere ?? ''}
                      onChange={(e) => modifierCreneau(i, { matiere: e.target.value || null })} />
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Salle" value={c.salle ?? ''}
                        onChange={(e) => modifierCreneau(i, { salle: e.target.value || null })} />
                      <select value={c.semaineAb ?? ''}
                        onChange={(e) => modifierCreneau(i, { semaineAb: (e.target.value || null) as 'A' | 'B' | null })}>
                        <option value="">Chaque semaine</option>
                        <option value="A">Semaine A</option>
                        <option value="B">Semaine B</option>
                      </select>
                    </div>
                    <button type="button" className="text-sm font-bold text-err underline"
                      onClick={() => supprimerCreneau(i)}>
                      Supprimer ce créneau
                    </button>
                  </li>
                ))}
              </ul>

              {relecture.length === 0 && (
                <p className="text-sm text-soft">Tous les créneaux ont été supprimés.</p>
              )}

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={semaineAbActive}
                  onChange={(e) => setSemaineAbActive(e.target.checked)} />
                <span className="text-sm font-bold">Alternance semaine A / semaine B</span>
              </label>
              {semaineAbActive && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Lundi de départ de la semaine A</span>
                  <input type="date" value={dateAncrage} onChange={(e) => setDateAncrage(e.target.value)} />
                </label>
              )}

              {erreurEnregistrement && (
                <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{erreurEnregistrement}</p>
              )}

              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost flex-1"
                  onClick={() => { setRelecture(null); setErreurEnregistrement(null); }}>
                  Annuler
                </button>
                <button type="button" className="btn btn-primary flex-1" disabled={enregistrement || relecture.length === 0}
                  onClick={onValider}>
                  {enregistrement ? 'Enregistrement…' : 'Valider et enregistrer'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      <BottomNav active="/app/plus" />
    </main>
  );
}

export default function Scolarite() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuScolarite />
    </Suspense>
  );
}
