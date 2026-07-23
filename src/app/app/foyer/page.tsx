'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  createHousehold, inviteParent, exportMyData, deleteMyAccount, deleteHousehold,
  getRegleGarde, setRegleGarde, type RegleGarde,
} from '@/lib/actions';
import type { CustodyPattern } from '@/lib/custody';

const RYTHMES: { valeur: CustodyPattern; libelle: string }[] = [
  { valeur: 'alternating_weeks', libelle: 'Une semaine sur deux' },
  { valeur: 'even_weeks', libelle: 'Semaines paires' },
  { valeur: 'odd_weeks', libelle: 'Semaines impaires' },
  { valeur: 'alternating_weekends', libelle: 'Un week-end sur deux' },
  { valeur: 'p2233', libelle: '2-2-3' },
  { valeur: 'p2255', libelle: '2-2-5-5' },
];

export default function Foyer() {
  const router = useRouter();
  const { ctx, recharger } = useContexte();
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [lien, setLien] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmer, setConfirmer] = useState<'aucun' | 'foyer' | 'compte'>('aucun');

  const [rythme, setRythme] = useState<CustodyPattern>('alternating_weeks');
  const [debut, setDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [regleActuelle, setRegleActuelle] = useState<RegleGarde | null>(null);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    getRegleGarde(ctx.contexte.foyer.id).then((r) => {
      if (r.status === 'ok' && r.data) {
        setRegleActuelle(r.data);
        setRythme(r.data.pattern);
        setDebut(r.data.startDate);
      }
    });
  }, [ctx]);

  async function creerFoyer() {
    setMsg(null);
    if (!nom.trim()) { setMsg({ kind: 'err', text: 'Indiquez un nom pour votre foyer.' }); return; }
    setBusy(true);
    const r = await createHousehold(nom);
    setBusy(false);
    if (r.status === 'ok') { setMsg({ kind: 'ok', text: 'Foyer créé.' }); recharger(); }
    else if (r.status === 'demo') setMsg({ kind: 'ok', text: 'Mode démo : le foyer serait créé.' });
    else setMsg({ kind: 'err', text: r.message });
  }

  async function inviter(householdId: string) {
    setMsg(null);
    if (!email.includes('@')) { setMsg({ kind: 'err', text: 'Saisissez une adresse e-mail valide.' }); return; }
    setBusy(true);
    const r = await inviteParent(householdId, email);
    setBusy(false);
    if (r.status === 'ok') {
      setLien(`${window.location.origin}/invitation/${r.data}`);
      setMsg({ kind: 'ok', text: 'Invitation créée (valable 7 jours). Envoyez le lien vous-même au second parent.' });
    } else if (r.status === 'demo') setMsg({ kind: 'ok', text: 'Mode démo.' });
    else setMsg({ kind: 'err', text: r.message });
  }

  async function enregistrerRythme(householdId: string, p1: string, p2: string) {
    setMsg(null); setBusy(true);
    const r = await setRegleGarde(householdId, rythme, debut, p1, p2);
    setBusy(false);
    if (r.status === 'ok') {
      setRegleActuelle({ pattern: rythme, startDate: debut, parent1: p1, parent2: p2 });
      setMsg({ kind: 'ok', text: 'Rythme de garde enregistré. Le planning est à jour.' });
    } else if (r.status === 'error') setMsg({ kind: 'err', text: r.message });
  }

  async function exporter() {
    setMsg(null);
    const r = await exportMyData();
    if (r.status === 'ok') {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'coparentalite-zen-mes-donnees.json'; a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: 'ok', text: 'Votre export a été téléchargé (format JSON lisible).' });
    } else if (r.status === 'demo') setMsg({ kind: 'ok', text: 'Mode démo.' });
    else setMsg({ kind: 'err', text: r.message });
  }

  async function supprimerFoyer(id: string) {
    const r = await deleteHousehold(id);
    setConfirmer('aucun');
    if (r.status === 'ok') { setMsg({ kind: 'ok', text: 'Le foyer a été supprimé.' }); recharger(); }
    else if (r.status === 'error') setMsg({ kind: 'err', text: r.message });
  }

  async function supprimerCompte() {
    const r = await deleteMyAccount();
    if (r.status === 'ok') router.push('/');
    else if (r.status === 'error') { setConfirmer('aucun'); setMsg({ kind: 'err', text: r.message }); }
    else setConfirmer('aucun');
  }

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const p1 = membres[0]; const p2 = membres[1];

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Paramètres du foyer</h1>

      {msg && (
        <p role={msg.kind === 'err' ? 'alert' : 'status'}
           className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.kind === 'err' ? 'bg-err-bg text-err' : 'bg-ok-bg text-ok'}`}>
          {msg.text}
        </p>
      )}

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}

      {(ctx.etat === 'sans-foyer' || ctx.etat === 'demo') && (
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">Créer votre foyer</h2>
          <p className="text-sm text-soft">Un foyer regroupe vos enfants, votre planning et vos dépenses partagées.</p>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Nom du foyer</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Famille Dupont-Martin" />
          </label>
          <button className="btn btn-primary w-full" onClick={creerFoyer} disabled={busy}>
            {busy ? 'Création…' : 'Créer le foyer'}
          </button>
        </section>
      )}

      {ctx.etat === 'pret' && (
        <>
          <section className="card space-y-2 p-4">
            <h2 className="font-bold">{ctx.contexte.foyer.nom}</h2>
            <p className="text-sm text-soft">
              Votre rôle : {ctx.contexte.foyer.role === 'owner' ? 'propriétaire' : ctx.contexte.foyer.role}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {membres.map((m) => (
                <ParentBadge key={m.profileId} name={m.nom} initial={m.initiale}
                  colorKey={m.couleur === 'coral' ? 'coral' : 'navy'} />
              ))}
            </div>
            <Link href="/app/enfants" className="btn btn-ghost mt-2 w-full">
              Gérer les enfants ({ctx.contexte.enfants.length})
            </Link>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Rythme de garde</h2>
            {!p2 ? (
              <p className="text-sm text-soft">
                Le rythme se définit à deux : invitez d’abord le second parent ci-dessous.
              </p>
            ) : (
              <>
                {regleActuelle && (
                  <p className="rounded-xl bg-muted px-3 py-2 text-sm">
                    Actuel : <strong>{RYTHMES.find((r) => r.valeur === regleActuelle.pattern)?.libelle}</strong>,
                    depuis le {new Date(regleActuelle.startDate + 'T12:00:00').toLocaleDateString('fr-FR')}.
                  </p>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Rythme</span>
                  <select value={rythme} onChange={(e) => setRythme(e.target.value as CustodyPattern)}>
                    {RYTHMES.map((r) => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Date de début du cycle</span>
                  <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
                  <span className="mt-1 block text-xs text-soft">
                    Le cycle démarre chez {p1.nom} à cette date.
                  </span>
                </label>
                <button className="btn btn-primary w-full" disabled={busy}
                  onClick={() => enregistrerRythme(ctx.contexte.foyer.id, p1.profileId, p2.profileId)}>
                  {busy ? 'Enregistrement…' : 'Enregistrer le rythme'}
                </button>
              </>
            )}
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Inviter le second parent</h2>
            <p className="text-sm text-soft">
              L’invitation est valable 7 jours. Aucun e-mail automatique n’est envoyé pour le moment :
              copiez le lien et transmettez-le vous-même.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Son adresse e-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@exemple.fr" />
            </label>
            <button className="btn btn-ghost w-full" onClick={() => inviter(ctx.contexte.foyer.id)} disabled={busy}>
              {busy ? 'Création…' : 'Créer l’invitation'}
            </button>
            {lien && (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Lien d’invitation</span>
                  <input id="lien-invitation" readOnly value={lien}
                    onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                </label>
                <button type="button" className="btn btn-primary w-full"
                  onClick={async () => {
                    const champ = document.getElementById('lien-invitation') as HTMLInputElement | null;
                    champ?.select(); champ?.setSelectionRange(0, lien.length);
                    try {
                      await navigator.clipboard.writeText(lien);
                      setMsg({ kind: 'ok', text: 'Lien copié. Le second parent doit se connecter à son compte avant de l’ouvrir.' });
                    } catch {
                      setMsg({ kind: 'err', text: 'Copie automatique refusée : le lien est sélectionné ci-dessus, touchez « Copier ».' });
                    }
                  }}>
                  Copier le lien d’invitation
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Vos données (RGPD)</h2>
        <p className="text-sm text-soft">Téléchargez à tout moment l’ensemble de vos données dans un format lisible.</p>
        <button className="btn btn-ghost w-full" onClick={exporter}>Exporter mes données</button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold text-err">Zone sensible</h2>
        {confirmer === 'aucun' && (
          <div className="space-y-2">
            {ctx.etat === 'pret' && ctx.contexte.foyer.role === 'owner' && (
              <button className="btn w-full bg-err-bg text-err" onClick={() => setConfirmer('foyer')}>
                Supprimer le foyer
              </button>
            )}
            <button className="btn w-full bg-err-bg text-err" onClick={() => setConfirmer('compte')}>
              Supprimer mon compte
            </button>
          </div>
        )}
        {confirmer === 'foyer' && ctx.etat === 'pret' && (
          <div className="space-y-2">
            <p className="text-sm">
              Le foyer, ses plannings, dépenses et documents seront supprimés pour tous ses membres.
              Cette action est définitive. Confirmer ?
            </p>
            <button className="btn w-full bg-err text-white" onClick={() => supprimerFoyer(ctx.contexte.foyer.id)}>
              Oui, supprimer le foyer
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirmer('aucun')}>Annuler</button>
          </div>
        )}
        {confirmer === 'compte' && (
          <div className="space-y-2">
            <p className="text-sm">
              Votre compte sera supprimé et votre adresse e-mail anonymisée. Si vous êtes le dernier membre
              d’un foyer, ce foyer sera supprimé avec vous. Pensez à exporter vos données avant.
              Cette action est définitive. Confirmer ?
            </p>
            <button className="btn w-full bg-err text-white" onClick={supprimerCompte}>Oui, supprimer mon compte</button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirmer('aucun')}>Annuler</button>
          </div>
        )}
      </section>

      <BottomNav active="/app/plus" />
    </main>
  );
}
