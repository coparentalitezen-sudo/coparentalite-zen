'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Inscription() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Choisissez un mot de passe d’au moins 8 caractères.');
      return;
    }
    if (!supabase) {
      router.push('/app/accueil');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError('La création du compte n’a pas abouti. Vérifiez l’adresse e-mail saisie et réessayez.');
      return;
    }
    setSent(true); // vérification de l'adresse par e-mail (Supabase Auth)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <Image src="/logo-complet.png" alt="Coparentalité Zen" width={200} height={200} priority />
      {sent ? (
        <div className="card mt-6 w-full space-y-3 p-5 text-center">
          <h1 className="font-display text-xl font-semibold">Vérifiez votre boîte mail</h1>
          <p className="text-sm text-soft">
            Un e-mail de confirmation vient d’être envoyé à <strong>{email}</strong>. Cliquez sur le lien
            qu’il contient pour activer votre compte, puis connectez-vous.
          </p>
          <Link href="/connexion" className="btn btn-primary w-full">Retour à la connexion</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 w-full space-y-4 p-5">
          <h1 className="font-display text-xl font-semibold">Créer un compte</h1>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Prénom</span>
            <input autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Adresse e-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Mot de passe</span>
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="mt-1 block text-xs text-soft">8 caractères minimum.</span>
          </label>
          {error && <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
          <p className="text-xs text-soft">
            En créant un compte, vous acceptez les conditions générales et la politique de confidentialité.
          </p>
          <p className="text-sm">
            Déjà un compte ? <Link className="font-bold text-navy-text underline" href="/connexion">Se connecter</Link>
          </p>
        </form>
      )}
    </main>
  );
}
