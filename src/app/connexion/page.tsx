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
  const [info, setInfo] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setNeedsConfirm(false);
    if (!supabase) { router.push('/app/accueil'); return; } // mode démo
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const m = (error.message || '').toLowerCase();
        if (m.includes('confirm')) {
          setNeedsConfirm(true);
          setError('Votre adresse e-mail n’est pas encore confirmée. Ouvrez l’e-mail de confirmation reçu à l’inscription (vérifiez les indésirables), ou renvoyez-le ci-dessous.');
        } else if (m.includes('invalid login credentials')) {
          setError('Adresse e-mail ou mot de passe non reconnus. Vérifiez votre saisie et réessayez.');
        } else {
          setError(`Connexion impossible : ${error.message}`);
        }
        return;
      }
      router.push('/app/accueil');
      router.refresh();
    } catch (err) {
      setError(`Erreur inattendue : ${err instanceof Error ? err.message : String(err)}. Réessayez ou signalez ce message.`);
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!supabase || !email) { setError('Saisissez d’abord votre adresse e-mail ci-dessus.'); return; }
    setLoading(true); setError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(`L’envoi n’a pas abouti : ${error.message}`);
      else { setNeedsConfirm(false); setInfo(`E-mail de confirmation renvoyé à ${email}. Ouvrez-le puis revenez vous connecter.`); }
    } finally {
      setLoading(false);
    }
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
        {info && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{info}</p>}
        {needsConfirm && (
          <button type="button" className="btn btn-ghost w-full" onClick={resendConfirmation} disabled={loading}>
            Renvoyer l’e-mail de confirmation
          </button>
        )}
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
          <Link className="text-soft underline" href="/mot-de-passe-oublie">Mot de passe oublié</Link>
        </div>
      </form>
    </main>
  );
}
