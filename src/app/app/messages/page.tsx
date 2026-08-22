'use client';

/**
 * Messages entre parents.
 *
 * Liste et fil dans le même écran plutôt que deux routes : un foyer compte
 * deux parents et quelques conversations, et un retour arrière qui recharge
 * la liste depuis le serveur serait pénible sur un téléphone. L'état suffit.
 *
 * Le fil se lit de haut en bas, du plus ancien au plus récent, comme une
 * conversation ordinaire. La zone d'écriture reste au bas de l'écran.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useContexte } from '@/lib/use-contexte';
import {
  listerConversations, creerConversation, listerMessages, envoyerMessage,
  marquerConversationLue, LONGUEUR_MAX_MESSAGE,
  type Conversation, type Message,
} from '@/lib/actions';
import { BottomNav } from '@/components/ui';
import { Chargement, Vide } from '@/components/etats';

function quand(iso: string) {
  const date = new Date(iso);
  const aujourdhui = new Date();
  const memeJour = date.toDateString() === aujourdhui.toDateString();
  return memeJour
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function MessagesPage() {
  const { ctx } = useContexte();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouverte, setOuverte] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chargementFil, setChargementFil] = useState(false);

  const [nouveauSujet, setNouveauSujet] = useState('');
  const [ouvertNouvelle, setOuvertNouvelle] = useState(false);
  const [erreurNouvelle, setErreurNouvelle] = useState<string | null>(null);

  const [brouillon, setBrouillon] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);

  const basDuFil = useRef<HTMLDivElement | null>(null);

  const foyerId = ctx.etat === 'pret' ? ctx.contexte.foyer.id : null;
  const moi = ctx.etat === 'pret' ? ctx.contexte.moi : null;
  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const nomDe = (id: string) =>
    membres.find((m) => m.profileId === id)?.nom ?? 'Parent';

  const charger = useCallback(async (id: string) => {
    setChargement(true);
    const r = await listerConversations(id);
    setChargement(false);
    if (r.status === 'ok') setConversations(r.data);
    else if (r.status === 'error') setErreur(r.message);
  }, []);

  useEffect(() => { if (foyerId) charger(foyerId); }, [foyerId, charger]);

  // Le fil s'ouvre sur son dernier message, comme toute messagerie.
  useEffect(() => {
    if (ouverte && messages.length > 0) {
      basDuFil.current?.scrollIntoView({ block: 'end' });
    }
  }, [ouverte, messages.length]);

  async function ouvrir(conversation: Conversation) {
    setOuverte(conversation); setMessages([]); setErreurEnvoi(null);
    setChargementFil(true);
    const r = await listerMessages(conversation.id);
    setChargementFil(false);
    if (r.status === 'ok') {
      setMessages(r.data);
      // La lecture est enregistrée sans bloquer l'affichage : un échec ici
      // ne doit pas empêcher de lire ce qui est déjà à l'écran.
      void marquerConversationLue(conversation.id);
      setConversations((liste) => liste.map((c) =>
        c.id === conversation.id ? { ...c, nonLus: 0 } : c));
    } else if (r.status === 'error') setErreurEnvoi(r.message);
  }

  async function creer() {
    if (!foyerId) return;
    setErreurNouvelle(null);
    const autres = membres.map((m) => m.profileId);
    const r = await creerConversation(foyerId, nouveauSujet, autres);
    if (r.status === 'ok') {
      setNouveauSujet(''); setOuvertNouvelle(false);
      const rafraichi = await listerConversations(foyerId);
      if (rafraichi.status === 'ok') {
        setConversations(rafraichi.data);
        const creee = rafraichi.data.find((c) => c.id === r.data);
        if (creee) ouvrir(creee);
      }
    } else if (r.status === 'error') setErreurNouvelle(r.message);
  }

  async function envoyer() {
    if (!ouverte) return;
    setEnvoi(true); setErreurEnvoi(null);
    const r = await envoyerMessage(ouverte.id, brouillon);
    setEnvoi(false);
    if (r.status === 'ok') {
      setMessages((liste) => [...liste, r.data]);
      setBrouillon('');
      setConversations((liste) => liste.map((c) => c.id === ouverte.id
        ? { ...c, dernierMessageLe: r.data.envoyeLe, dernierMessageExtrait: r.data.texte.slice(0, 120) }
        : c));
    } else if (r.status === 'error') setErreurEnvoi(r.message);
  }

  if (ouverte) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-28 pt-6">
        <button type="button" onClick={() => setOuverte(null)}
                className="self-start text-sm font-bold text-navy-text underline">
          ← Toutes les conversations
        </button>

        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">
          {ouverte.sujet}
        </h1>

        <section className="mt-4 flex-1 space-y-3">
          {chargementFil && <Chargement />}

          {!chargementFil && messages.length === 0 && (
            <p className="rounded-xl bg-muted px-3 py-3 text-sm text-soft">
              Aucun message. Écrivez le premier ci-dessous.
            </p>
          )}

          {messages.map((m) => {
            const deMoi = m.auteurId === moi;
            return (
              <article key={m.id}
                       className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                         deMoi ? 'ml-auto bg-p1-bg' : 'bg-muted'}`}>
                <p className="text-[11px] font-bold text-soft">
                  {deMoi ? 'Vous' : nomDe(m.auteurId)} · {quand(m.envoyeLe)}
                  {m.modifieLe && ' · modifié'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {m.texte}
                </p>
              </article>
            );
          })}
          <div ref={basDuFil} />
        </section>

        <section className="mt-4 space-y-2">
          {erreurEnvoi && (
            <p className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
              {erreurEnvoi}
            </p>
          )}
          <textarea value={brouillon} rows={3} maxLength={LONGUEUR_MAX_MESSAGE}
                    placeholder="Votre message"
                    onChange={(e) => setBrouillon(e.target.value)} />
          <button type="button" className="btn btn-primary w-full"
                  disabled={envoi || brouillon.trim().length === 0}
                  onClick={envoyer}>
            {envoi ? 'Envoi…' : 'Envoyer'}
          </button>
        </section>

        <BottomNav active="plus" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 pb-28 pt-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-1 text-sm leading-relaxed text-soft">
        Les échanges sur l’organisation, réunis au même endroit et conservés.
      </p>

      {erreur && (
        <p className="mt-4 rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
          {erreur}
        </p>
      )}

      <section className="mt-5">
        {!ouvertNouvelle ? (
          <button type="button" className="btn btn-primary w-full"
                  onClick={() => { setOuvertNouvelle(true); setErreurNouvelle(null); }}>
            Nouvelle conversation
          </button>
        ) : (
          <div className="card space-y-3 p-4">
            <label className="block text-sm font-bold text-ink" htmlFor="sujet">
              Sujet
            </label>
            <input id="sujet" value={nouveauSujet} maxLength={120}
                   placeholder="Rentrée scolaire"
                   onChange={(e) => setNouveauSujet(e.target.value)} />
            {erreurNouvelle && (
              <p className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                {erreurNouvelle}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={creer}>
                Ouvrir
              </button>
              <button type="button" className="btn btn-ghost flex-1"
                      onClick={() => { setOuvertNouvelle(false); setErreurNouvelle(null); }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-5 space-y-2">
        {chargement && <Chargement />}

        {!chargement && conversations.length === 0 && (
          <Vide titre="Aucune conversation"
                texte="Ouvrez une conversation par sujet : rentrée scolaire, vacances, santé. Les échanges restent rattachés au sujet plutôt que noyés dans une discussion unique." />
        )}

        {conversations.map((c) => (
          <button key={c.id} type="button" onClick={() => ouvrir(c)}
                  className="card w-full space-y-1 p-4 text-left active:scale-[.99]">
            <span className="flex items-center justify-between gap-3">
              <span className="truncate font-bold text-ink">{c.sujet}</span>
              {c.nonLus > 0 && (
                <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[#B3423A] px-1 text-[10px] font-black text-white">
                  {c.nonLus > 9 ? '9+' : c.nonLus}
                </span>
              )}
            </span>
            {c.dernierMessageExtrait ? (
              <span className="block truncate text-[13px] text-soft">
                {c.dernierMessageExtrait}
              </span>
            ) : (
              <span className="block text-[13px] text-soft">Aucun message</span>
            )}
            {c.dernierMessageLe && (
              <span className="block text-[11px] text-soft/80">
                {quand(c.dernierMessageLe)}
              </span>
            )}
          </button>
        ))}
      </section>

      <BottomNav active="plus" />
    </main>
  );
}
