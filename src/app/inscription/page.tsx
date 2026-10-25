'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { origineMemorisee } from '@/components/suivi-origine';
import { apercuRythmeSuggere } from '@/lib/quiz';
import { modele } from '@/lib/rythmes';

export default function Inscription() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  // Rythme trouvé dans le questionnaire, lu après le montage : le stockage du
  // navigateur n'existe pas au rendu serveur.
  const [rythme, setRythme] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    const pattern = apercuRythmeSuggere();
    setRythme(pattern ? modele(pattern)?.nom ?? null : null);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!legalAccepted) {
      setError('Vous devez accepter les conditions générales et la politique de confidentialité.');
      return;
    }
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
        data: {
          display_name: name,
          terms_accepted: true,
          terms_version: '2026-08-02',
          privacy_accepted: true,
          privacy_version: '2026-08-02',
          // Le contenu qui a fait connaître l'application, s'il est connu.
          // Lu au moment de l'envoi : une inscription ne doit jamais échouer
          // parce que cette information manque.
          ...origineMemorisee(),
        },
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
      <Image src="/logo-complet.png" alt="Coparentalité Zen" width={96} height={96} priority />
      {sent ? (
        <div className="card mt-6 w-full space-y-3 p-5 text-center">
          <h1 className="font-display text-xl font-semibold">Vérifiez votre boîte mail</h1>
          <p className="text-sm text-soft">
            Un e-mail de confirmation vient d’être envoyé à <strong>{email}</strong>. Cliquez sur le lien
            qu’il contient : vous arriverez directement dans votre espace.
          </p>
          {/* Le lien s'échange contre une session grâce à une clé gardée par ce
              navigateur : ouvert sur un autre appareil, il échoue. */}
          <p className="text-xs leading-relaxed text-soft">
            Ouvrez-le <strong>sur cet appareil</strong>, dans ce navigateur. Rien reçu d’ici
            quelques minutes ? Regardez dans les courriers indésirables.
          </p>
          <Link href="/connexion" className="btn btn-primary w-full">Retour à la connexion</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 w-full space-y-4 p-5">
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold">Créer mon planning gratuit</h1>
            <p className="text-xs text-soft">3 mois gratuits · Aucune carte bancaire · Sans engagement</p>
          </div>
          {rythme && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-navy-text">
              Votre rythme <strong>{rythme}</strong> sera déjà sélectionné.
            </p>
          )}
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
          <label className="flex items-start gap-2 text-xs leading-relaxed text-soft">
            <input type="checkbox" required checked={legalAccepted} onChange={(e) => setLegalAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>J’accepte les <Link className="font-bold underline" href="/cgu" target="_blank">conditions générales</Link> et la <Link className="font-bold underline" href="/confidentialite" target="_blank">politique de confidentialité</Link>.</span>
          </label>
          <button className="btn btn-primary w-full" disabled={loading || !legalAccepted}>
            {loading ? 'Création…' : 'Créer mon planning'}
          </button>
          <p className="text-sm">
            Déjà un compte ? <Link className="font-bold text-navy-text underline" href="/connexion">Se connecter</Link>
          </p>
        </form>
      )}
    </main>
  );
}
