'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      // Mode démo : aucun backend configuré → accès direct à la démo
      router.push('/app/accueil');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Adresse e-mail ou mot de passe non reconnus. Vérifiez votre saisie et réessayez.');
      return;
    }
    router.push('/app/accueil');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <Image src="/logo-complet.png" alt="Coparentalité Zen — S’organiser, coopérer, avancer, pour le bien de nos enfants" width={220} height={220} priority />
      <form onSubmit={submit} className="card mt-6 w-full space-y-4 p-5">
        <h1 className="font-display text-xl font-semibold">Connexion</h1>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Adresse e-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Mot de passe</span>
          <input type="password" autoComplete="current-password" required={!!supabase} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        {!supabase && (
          <p className="rounded-xl bg-wait-bg px-3 py-2 text-xs font-bold text-wait">
            Mode démonstration : la connexion ouvre directement l’aperçu avec des données fictives.
          </p>
        )}
        <div className="flex justify-between text-sm">
          <Link className="font-bold text-navy-text underline" href="/inscription">Créer un compte</Link>
          <button type="button" className="text-soft underline">Mot de passe oublié</button>
        </div>
      </form>
    </main>
  );
}
