'use client';

import { use, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptInvitation } from '@/lib/actions';

export default function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onAccept() {
    setState('busy');
    const r = await acceptInvitation(token);
    if (r.status === 'ok') { router.push('/app/accueil'); return; }
    if (r.status === 'demo') { router.push('/app/accueil'); return; }
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
        {state === 'error' && (
          <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>
        )}
        <button className="btn btn-primary w-full" onClick={onAccept} disabled={state === 'busy'}>
          {state === 'busy' ? 'Vérification…' : 'Accepter l’invitation'}
        </button>
        <Link href="/" className="block text-sm font-bold text-navy-text underline">Non merci</Link>
        <p className="text-xs text-soft">
          Un compte est nécessaire : si vous n’en avez pas encore, vous serez d’abord invité·e à en créer un.
        </p>
      </div>
    </main>
  );
}
