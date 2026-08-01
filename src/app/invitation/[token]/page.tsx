'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptInvitation, invitationExigeCode, tentativesRestantes } from '@/lib/actions';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const tokenValide = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [exigeCode, setExigeCode] = useState(false);
  const [code, setCode] = useState('');
  const [restantes, setRestantes] = useState<number | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) { setConnected(true); return; } // démo
    supabase.auth.getUser().then(({ data }) => setConnected(!!data.user));
  }, []);

  // Annoncé avant même la connexion : le destinataire doit savoir qu'un code
  // lui sera demandé, et pouvoir le réclamer avant de créer un compte.
  useEffect(() => {
    if (!tokenValide) return;
    invitationExigeCode(token).then((r) => {
      if (r.status === 'ok') setExigeCode(r.data);
    });
  }, [token, tokenValide]);

  async function onAccept() {
    setState('busy');
    const r = await acceptInvitation(token, exigeCode ? code : undefined);

    if (r.status === 'ok' || r.status === 'demo') { router.push('/app/foyer'); return; }

    // Un code erroné se signale par un refus sans exception : la base doit
    // pouvoir compter les tentatives, ce qu'une transaction annulée
    // empêcherait.
    if (r.status === 'error' && r.message.includes('CODE_INCORRECT')) {
      const t = await tentativesRestantes(token);
      const reste = t.status === 'ok' ? t.data : null;
      setRestantes(reste);
      setError(reste !== null && reste > 0
        ? `Code incorrect. Il reste ${reste} tentative${reste > 1 ? 's' : ''}.`
        : 'Code incorrect. Cette invitation a été révoquée par sécurité : demandez-en une nouvelle.');
      setState('error');
      return;
    }
    setError(r.message);
    setState('error');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <Image src="/logo-complet.png" alt="Coparentalité Zen" width={200} height={200} priority />
      <div className="card mt-6 w-full space-y-4 p-5 text-center">
        <h1 className="font-display text-xl font-semibold">Invitation à rejoindre un foyer</h1>
        <p className="text-sm text-soft">
          Vous avez été invité·e à rejoindre un foyer Coparentalité Zen pour organiser ensemble
          le planning de garde et les dépenses partagées. Vous resterez libre de quitter le foyer.
        </p>
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-soft">
          {exigeCode
            ? 'Cette invitation demande un code à six chiffres. La personne qui vous a invité vous l’a communiqué séparément du lien.'
            : 'Cette invitation est nominative : elle ne peut être acceptée que depuis le compte dont l’adresse e-mail correspond à celle invitée.'}
        </p>
        {!tokenValide && (
          <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
            Ce lien est incomplet : il manque une partie du code d’invitation. Demandez au premier
            parent d’utiliser le bouton « Copier le lien » et renvoyez-le en entier.
          </p>
        )}
        {state === 'error' && (
          <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>
        )}
        {connected === false ? (
          <>
            <p className="rounded-xl bg-wait-bg px-3 py-2 text-sm font-bold text-wait">
              Créez d’abord votre compte (ou connectez-vous), puis rouvrez ce lien d’invitation
              pour l’accepter.
            </p>
            <Link href="/inscription" className="btn btn-primary w-full">Créer mon compte</Link>
            <Link href="/connexion" className="btn btn-ghost w-full">J’ai déjà un compte</Link>
          </>
        ) : (
          <>
            {exigeCode && (
              <label className="block text-left">
                <span className="mb-1 block text-sm font-bold">Code de confirmation</span>
                <input type="text" inputMode="numeric" maxLength={6}
                       autoComplete="one-time-code"
                       value={code} placeholder="123456"
                       className="text-center font-mono text-[22px] tracking-[0.2em]"
                       onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                {restantes !== null && restantes > 0 && (
                  <span className="mt-1 block text-xs text-wait">
                    {restantes} tentative{restantes > 1 ? 's' : ''} restante{restantes > 1 ? 's' : ''}.
                  </span>
                )}
              </label>
            )}

            <button className="btn btn-primary w-full" onClick={onAccept}
                    disabled={state === 'busy' || connected === null || !tokenValide
                              || (exigeCode && code.length !== 6)}>
              {state === 'busy' ? 'Vérification…' : 'Accepter l’invitation'}
            </button>
            <Link href="/" className="block text-sm font-bold text-navy-text underline">Non merci</Link>
          </>
        )}
      </div>
    </main>
  );
}
