'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabase) { setSent(true); return; } // démo
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?suite=/reinitialisation`,
    });
    if (error) { setError('L’envoi n’a pas abouti. Vérifiez l’adresse saisie et réessayez.'); return; }
    setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <Image src="/logo-complet.png" alt="Coparentalité Zen" width={180} height={180} priority />
      <div className="card mt-6 w-full space-y-4 p-5">
        <h1 className="font-display text-xl font-semibold">Mot de passe oublié</h1>
        {sent ? (
          <>
            <p className="text-sm text-soft">
              Si un compte existe pour <strong>{email || 'cette adresse'}</strong>, un e-mail contenant
              un lien de réinitialisation vient d’être envoyé (valable 1 heure).
            </p>
            <Link href="/connexion" className="btn btn-primary w-full">Retour à la connexion</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Adresse e-mail</span>
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>}
            <button className="btn btn-primary w-full">Envoyer le lien</button>
            <Link href="/connexion" className="block text-center text-sm font-bold text-navy-text underline">Retour</Link>
          </form>
        )}
      </div>
    </main>
  );
}
