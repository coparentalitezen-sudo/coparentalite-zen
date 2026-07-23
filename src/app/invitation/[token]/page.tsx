'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptInvitation } from '@/lib/actions';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const tokenValide = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) { setConnected(true); return; } // démo
    supabase.auth.getUser().then(({ data }) => setConnected(!!data.user));
  }, []);

  async function onAccept() {
    setState('busy');
    const r = await acceptInvitation(token);
    // après acceptation : direction les paramètres du foyer, où le résultat réel est visible
    if (r.status === 'ok' || r.status === 'demo') { router.push('/app/foyer'); return; }
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
          Cette invitation est nominative : elle ne peut être acceptée que depuis le compte
          dont l’adresse e-mail correspond à celle invitée.
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
            <button className="btn btn-primary w-full" onClick={onAccept} disabled={state === 'busy' || connected === null || !tokenValide}>
              {state === 'busy' ? 'Vérification…' : 'Accepter l’invitation'}
            </button>
            <Link href="/" className="block text-sm font-bold text-navy-text underline">Non merci</Link>
          </>
        )}
      </div>
    </main>
  );
}
