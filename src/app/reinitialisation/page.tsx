'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Reinitialisation() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Choisissez un mot de passe d’au moins 8 caractères.');
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    if (!supabase) { router.push('/app/accueil'); return; } // démo
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError('Le changement n’a pas abouti. Le lien a peut-être expiré — refaites une demande.'); return; }
    router.push('/app/accueil');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <Image src="/logo-complet.png" alt="Coparentalité Zen" width={180} height={180} priority />
      <form onSubmit={submit} className="card mt-6 w-full space-y-4 p-5">
        <h1 className="font-display text-xl font-semibold">Nouveau mot de passe</h1>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Nouveau mot de passe</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Confirmez le mot de passe</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>}
        <button className="btn btn-primary w-full">Enregistrer</button>
      </form>
    </main>
  );
}
