'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui';
import {
  getMyHousehold, createHousehold, inviteParent,
  exportMyData, deleteMyAccount, deleteHousehold,
} from '@/lib/actions';

type Household = { id: string; name: string; role: string } | null;

export default function Foyer() {
  const router = useRouter();
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState<Household>(null);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'none' | 'household' | 'account'>('none');

  useEffect(() => {
    getMyHousehold().then((r) => {
      if (r.status === 'demo') { setDemo(true); setHousehold({ id: 'demo', name: 'Famille Démo', role: 'owner' }); }
      else if (r.status === 'ok') setHousehold(r.data);
      else setMsg({ kind: 'err', text: r.message });
      setLoading(false);
    });
  }, []);

  async function onCreate() {
    if (!name.trim()) return setMsg({ kind: 'err', text: 'Indiquez un nom pour votre foyer.' });
    const r = await createHousehold(name);
    if (r.status === 'ok') { setHousehold({ id: r.data, name, role: 'owner' }); setMsg({ kind: 'ok', text: 'Foyer créé.' }); }
    else if (r.status === 'demo') setMsg({ kind: 'ok', text: 'Mode démo : le foyer serait créé en version complète.' });
    else setMsg({ kind: 'err', text: r.message });
  }

  async function onInvite() {
    if (!household) return;
    const r = await inviteParent(household.id, inviteEmail);
    if (r.status === 'ok') {
      setInviteLink(`${window.location.origin}/invitation/${r.data}`);
      setMsg({ kind: 'ok', text: 'Invitation créée (valable 7 jours). Copiez le lien ci-dessous et envoyez-le vous-même au second parent (SMS, WhatsApp, e-mail) — l’envoi automatique arrivera dans une prochaine version.' });
    } else if (r.status === 'demo') {
      setMsg({ kind: 'ok', text: 'Mode démo : l’invitation serait envoyée en version complète.' });
    } else setMsg({ kind: 'err', text: r.message });
  }

  async function onExport() {
    const r = await exportMyData();
    if (r.status === 'ok') {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'coparentalite-zen-mes-donnees.json'; a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: 'ok', text: 'Votre export est téléchargé (format JSON lisible).' });
    } else if (r.status === 'demo') setMsg({ kind: 'ok', text: 'Mode démo : l’export contiendrait toutes vos données réelles.' });
    else setMsg({ kind: 'err', text: r.message });
  }

  async function onDeleteHousehold() {
    if (!household) return;
    const r = await deleteHousehold(household.id);
    if (r.status === 'ok') { setHousehold(null); setConfirmDelete('none'); setMsg({ kind: 'ok', text: 'Le foyer a été supprimé.' }); }
    else if (r.status === 'demo') { setConfirmDelete('none'); setMsg({ kind: 'ok', text: 'Mode démo : le foyer serait supprimé en version complète.' }); }
    else setMsg({ kind: 'err', text: r.message });
  }

  async function onDeleteAccount() {
    const r = await deleteMyAccount();
    if (r.status === 'ok') router.push('/');
    else if (r.status === 'demo') { setConfirmDelete('none'); setMsg({ kind: 'ok', text: 'Mode démo : le compte serait supprimé définitivement en version complète.' }); }
    else setMsg({ kind: 'err', text: r.message });
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Paramètres du foyer</h1>
      <p className="text-xs text-soft">Version bêta 0.4</p>

      {msg && (
        <p role={msg.kind === 'err' ? 'alert' : 'status'}
           className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.kind === 'err' ? 'bg-err-bg text-err' : 'bg-ok-bg text-ok'}`}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="text-soft">Chargement…</p>
      ) : !household ? (
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">Créer votre foyer</h2>
          <p className="text-sm text-soft">Un foyer regroupe vos enfants, votre planning et vos dépenses partagées.</p>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Nom du foyer</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Famille Dupont-Martin" />
          </label>
          <button className="btn btn-primary w-full" onClick={onCreate}>Créer le foyer</button>
        </section>
      ) : (
        <>
          <section className="card space-y-1 p-4">
            <h2 className="font-bold">{household.name}</h2>
            <p className="text-sm text-soft">Votre rôle : {household.role === 'owner' ? 'propriétaire' : household.role}</p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Inviter le second parent</h2>
            <p className="text-sm text-soft">
              L’invitation est valable 7 jours et peut être révoquée. L’autre parent verra les mêmes
              plannings et dépenses que vous. Un lien à lui transmettre s’affichera ici — aucun e-mail
              automatique n’est envoyé pour le moment.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Son adresse e-mail</span>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="parent@exemple.fr" />
            </label>
            <button className="btn btn-primary w-full" onClick={onInvite}>Créer l’invitation</button>
            {inviteLink && (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Lien d’invitation</span>
                  <input
                    id="lien-invitation"
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                </label>
                <button type="button" className="btn btn-primary w-full"
                  onClick={async () => {
                    const champ = document.getElementById('lien-invitation') as HTMLInputElement | null;
                    champ?.select();
                    champ?.setSelectionRange(0, inviteLink.length);
                    try {
                      await navigator.clipboard.writeText(inviteLink);
                      setMsg({ kind: 'ok', text: 'Lien d’invitation copié. Collez-le dans la barre d’adresse du navigateur du second parent.' });
                    } catch {
                      setMsg({ kind: 'err', text: 'Copie automatique refusée par le navigateur : le lien est sélectionné ci-dessus, touchez « Copier ».' });
                    }
                  }}>
                  Copier le lien d’invitation
                </button>
                <p className="text-xs text-soft">
                  Ce lien doit être ouvert par le second parent une fois qu’il est connecté à son compte.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Vos données (RGPD)</h2>
        <p className="text-sm text-soft">
          Téléchargez à tout moment l’ensemble de vos données dans un format lisible.
        </p>
        <button className="btn btn-ghost w-full" onClick={onExport}>Exporter mes données</button>
      </section>

      <section className="card space-y-3 border-err-bg p-4">
        <h2 className="font-bold text-err">Zone sensible</h2>
        {confirmDelete === 'none' && (
          <div className="space-y-2">
            {household && household.role === 'owner' && (
              <button className="btn w-full bg-err-bg text-err" onClick={() => setConfirmDelete('household')}>
                Supprimer le foyer
              </button>
            )}
            <button className="btn w-full bg-err-bg text-err" onClick={() => setConfirmDelete('account')}>
              Supprimer mon compte
            </button>
          </div>
        )}
        {confirmDelete === 'household' && (
          <div className="space-y-2">
            <p className="text-sm">
              Le foyer, ses plannings, dépenses et documents seront supprimés pour tous ses membres.
              Cette action est définitive. Confirmer ?
            </p>
            <button className="btn w-full bg-err text-white" onClick={onDeleteHousehold}>Oui, supprimer le foyer</button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirmDelete('none')}>Annuler</button>
          </div>
        )}
        {confirmDelete === 'account' && (
          <div className="space-y-2">
            <p className="text-sm">
              Votre compte sera supprimé et votre adresse e-mail anonymisée. Si vous êtes le dernier
              membre d’un foyer, ce foyer sera supprimé avec vous. Pensez à exporter vos données avant.
              Cette action est définitive. Confirmer ?
            </p>
            <button className="btn w-full bg-err text-white" onClick={onDeleteAccount}>Oui, supprimer mon compte</button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirmDelete('none')}>Annuler</button>
          </div>
        )}
      </section>

      <BottomNav active="/app/plus" />
    </main>
  );
}
