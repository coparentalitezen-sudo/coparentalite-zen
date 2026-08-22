'use client';

/**
 * Documents du foyer.
 *
 * Ce que l'écran résout : une ordonnance photographiée par un parent doit
 * être lisible par l'autre le soir même, sans passer par un message qui se
 * perd. D'où le classement par type et par enfant plutôt qu'un simple dépôt
 * de fichiers — retrouver « l'ordonnance de Léa » six mois plus tard est le
 * cas d'usage réel, pas « le fichier déposé en mars ».
 *
 * Le dépôt est replié par défaut : on vient ici pour consulter bien plus
 * souvent que pour ajouter.
 */
import { useCallback, useEffect, useState } from 'react';
import { useContexte } from '@/lib/use-contexte';
import {
  listerDocuments, deposerDocument, urlDocument, retirerDocument,
  TYPES_DOCUMENT, libelleType, type Document, type TypeDocument,
} from '@/lib/actions';
import { BottomNav } from '@/components/ui';
import { Chargement, Vide } from '@/components/etats';

function dateCourte(iso: string) {
  return new Date(iso.length > 10 ? iso : `${iso}T12:00:00`)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DocumentsPage() {
  const { ctx } = useContexte();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [ouvertDepot, setOuvertDepot] = useState(false);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeDocument>('prescription');
  const [enfantId, setEnfantId] = useState('');
  const [expireLe, setExpireLe] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreurDepot, setErreurDepot] = useState<string | null>(null);

  /** Filtre de consultation : tout, ou un type précis. */
  const [filtre, setFiltre] = useState<'tous' | TypeDocument>('tous');

  const foyerId = ctx.etat === 'pret' ? ctx.contexte.foyer.id : null;
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const nomMembre = (id: string) =>
    membres.find((m) => m.profileId === id)?.nom ?? 'Parent';
  const nomEnfant = (id: string | null) =>
    id ? (enfants.find((e) => e.id === id)?.prenom ?? null) : null;

  const charger = useCallback(async (id: string) => {
    setChargement(true);
    const r = await listerDocuments(id);
    setChargement(false);
    if (r.status === 'ok') setDocuments(r.data);
    else if (r.status === 'error') setErreur(r.message);
  }, []);

  useEffect(() => { if (foyerId) charger(foyerId); }, [foyerId, charger]);

  async function deposer() {
    if (!foyerId || !fichier) { setErreurDepot('Choisissez un fichier.'); return; }
    setEnCours(true); setErreurDepot(null);
    const r = await deposerDocument(foyerId, {
      titre, type, enfantId: enfantId || null, expireLe: expireLe || null, fichier,
    });
    setEnCours(false);
    if (r.status === 'ok') {
      setMessage('Document ajouté. L’autre parent y a accès.');
      setTitre(''); setEnfantId(''); setExpireLe(''); setFichier(null);
      setOuvertDepot(false);
      charger(foyerId);
    } else if (r.status === 'error') {
      // À l'endroit de l'action, pas en haut de page
      setErreurDepot(r.message);
    }
  }

  async function ouvrir(id: string) {
    const r = await urlDocument(id);
    if (r.status === 'ok') window.open(r.data, '_blank');
    else if (r.status === 'error') setErreur(r.message);
  }

  async function retirer(doc: Document) {
    if (!foyerId) return;
    if (!confirm(`Retirer « ${doc.titre} » ? L’autre parent n’y aura plus accès.`)) return;
    const r = await retirerDocument(doc.id);
    if (r.status === 'ok') {
      setDocuments((liste) => liste.filter((d) => d.id !== doc.id));
      setMessage('Document retiré.');
    } else if (r.status === 'error') setErreur(r.message);
  }

  const affiches = filtre === 'tous'
    ? documents
    : documents.filter((d) => d.type === filtre);

  /** Types réellement présents : proposer un filtre vide n'aide personne. */
  const typesPresents = TYPES_DOCUMENT.filter((t) =>
    documents.some((d) => d.type === t.code));

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 pb-28 pt-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Documents</h1>
      <p className="mt-1 text-sm leading-relaxed text-soft">
        Ordonnances, attestations, papiers scolaires. Les deux parents y ont accès,
        à tout moment.
      </p>

      {message && (
        <p className="mt-4 rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">
          {message}
        </p>
      )}
      {erreur && (
        <p className="mt-4 rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
          {erreur}
        </p>
      )}

      <section className="mt-5">
        {!ouvertDepot ? (
          <button type="button" className="btn btn-primary w-full"
                  onClick={() => { setOuvertDepot(true); setErreurDepot(null); }}>
            Ajouter un document
          </button>
        ) : (
          <div className="card space-y-3 p-4">
            <label className="block text-sm font-bold text-ink" htmlFor="titre">
              Titre
            </label>
            <input id="titre" value={titre} maxLength={120}
                   placeholder="Ordonnance antibiotiques"
                   onChange={(e) => setTitre(e.target.value)} />

            <label className="block text-sm font-bold text-ink" htmlFor="type">
              Type
            </label>
            <select id="type" value={type}
                    onChange={(e) => setType(e.target.value as TypeDocument)}>
              {TYPES_DOCUMENT.map((t) => (
                <option key={t.code} value={t.code}>{t.libelle}</option>
              ))}
            </select>

            {enfants.length > 0 && (
              <>
                <label className="block text-sm font-bold text-ink" htmlFor="enfant">
                  Enfant concerné <span className="font-normal text-soft">(facultatif)</span>
                </label>
                <select id="enfant" value={enfantId}
                        onChange={(e) => setEnfantId(e.target.value)}>
                  <option value="">Tous les enfants</option>
                  {enfants.map((e) => (
                    <option key={e.id} value={e.id}>{e.prenom}</option>
                  ))}
                </select>
              </>
            )}

            <label className="block text-sm font-bold text-ink" htmlFor="expire">
              Date de fin de validité <span className="font-normal text-soft">(facultatif)</span>
            </label>
            <input id="expire" type="date" value={expireLe}
                   onChange={(e) => setExpireLe(e.target.value)} />

            <label className="block text-sm font-bold text-ink" htmlFor="fichier">
              Fichier
            </label>
            <input id="fichier" type="file"
                   accept="application/pdf,image/jpeg,image/png,image/heic"
                   onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-soft">
              Photo ou scan, PDF ou image, 10 Mo maximum.
            </p>

            {erreurDepot && (
              <p className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                {erreurDepot}
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" className="btn btn-primary flex-1"
                      disabled={enCours} onClick={deposer}>
                {enCours ? 'Envoi…' : 'Ajouter'}
              </button>
              <button type="button" className="btn btn-ghost flex-1" disabled={enCours}
                      onClick={() => { setOuvertDepot(false); setErreurDepot(null); }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {typesPresents.length > 1 && (
        <section className="mt-5 flex flex-wrap gap-2" aria-label="Filtrer par type">
          <button type="button" onClick={() => setFiltre('tous')}
                  aria-pressed={filtre === 'tous'}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${
                    filtre === 'tous' ? 'bg-navy text-white' : 'bg-muted text-soft'}`}>
            Tous
          </button>
          {typesPresents.map((t) => (
            <button key={t.code} type="button" onClick={() => setFiltre(t.code)}
                    aria-pressed={filtre === t.code}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${
                      filtre === t.code ? 'bg-navy text-white' : 'bg-muted text-soft'}`}>
              {t.libelle}
            </button>
          ))}
        </section>
      )}

      <section className="mt-5 space-y-2">
        {chargement && <Chargement />}

        {!chargement && documents.length === 0 && (
          <Vide titre="Aucun document"
                texte="Déposez une ordonnance, une attestation ou un papier scolaire : l’autre parent y aura accès immédiatement." />
        )}

        {!chargement && documents.length > 0 && affiches.length === 0 && (
          <p className="rounded-xl bg-muted px-3 py-3 text-sm text-soft">
            Aucun document de ce type.
          </p>
        )}

        {affiches.map((d) => {
          const enfant = nomEnfant(d.enfantId);
          const perime = d.expireLe
            ? new Date(`${d.expireLe}T12:00:00`) < new Date() : false;
          return (
            <article key={d.id} className="card space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-ink">{d.titre}</h2>
                  <p className="mt-0.5 text-[13px] text-soft">
                    {libelleType(d.type)}
                    {enfant && ` · ${enfant}`}
                    {` · ${dateCourte(d.deposeLe)} par ${nomMembre(d.deposePar)}`}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-soft">
                  {Math.max(1, Math.round(d.taille / 1024))} Ko
                </span>
              </div>

              {d.expireLe && (
                <p className={`text-[13px] font-bold ${perime ? 'text-err' : 'text-soft'}`}>
                  {perime ? 'Expiré le ' : 'Valable jusqu’au '}{dateCourte(d.expireLe)}
                </p>
              )}

              <div className="flex gap-3">
                <button type="button"
                        className="text-[13px] font-bold text-navy-text underline"
                        onClick={() => ouvrir(d.id)}>
                  Ouvrir
                </button>
                <button type="button"
                        className="text-[13px] font-bold text-err underline"
                        onClick={() => retirer(d)}>
                  Retirer
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <BottomNav active="plus" />
    </main>
  );
}
