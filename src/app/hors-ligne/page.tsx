import Image from 'next/image';
import Link from 'next/link';

export const metadata = { title: 'Hors ligne — Coparentalité Zen' };

export default function HorsLigne() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8 text-center">
      <Image src="/symbole.png" alt="" width={92} height={92} priority />
      <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">
        Connexion indisponible
      </h1>
      <p className="mt-2 text-sm text-soft">
        Vos plannings et vos dépenses sont conservés en sécurité. Ils réapparaîtront
        dès le retour du réseau — rien n’est perdu.
      </p>
      <Link href="/app/accueil" className="btn btn-primary mt-6 w-full">Réessayer</Link>
    </main>
  );
}
