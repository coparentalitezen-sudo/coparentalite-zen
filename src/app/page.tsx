import Image from 'next/image';
import Link from 'next/link';

const problems = [
  ['Ne plus se tromper sur les jours de garde', 'Le planning affiche en un regard où sont les enfants aujourd’hui et le prochain changement.'],
  ['Savoir qui a payé quoi', 'Chaque dépense est enregistrée avec sa catégorie, son justificatif et le parent qui a payé.'],
  ['Régulariser sans calculs manuels', 'Les montants à régulariser sont calculés automatiquement, au centime près, selon vos règles de partage.'],
  ['Garder un historique fiable', 'Justificatifs, validations et échanges restent horodatés et consultables.'],
];

const faq = [
  ['L’application remplace-t-elle une convention parentale ?', 'Non. Coparentalité Zen est un outil d’organisation et de suivi. Il ne remplace ni une décision judiciaire, ni une convention parentale, ni un conseil juridique professionnel.'],
  ['Puis-je l’utiliser seul, sans l’autre parent ?', 'Oui. Vous pouvez tenir le planning et les dépenses de votre côté, puis inviter l’autre parent quand vous le souhaitez.'],
  ['Mes données sont-elles protégées ?', 'Chaque foyer est strictement isolé, les justificatifs sont stockés en privé et vous pouvez exporter ou supprimer vos données à tout moment.'],
  ['Sur quels appareils fonctionne-t-elle ?', 'Dans le navigateur, et installable sur iPhone, Android, tablette et ordinateur (application web progressive).'],
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-md px-6 pb-16">
      <header className="flex flex-col items-center pt-10 text-center">
        <Image src="/logo-complet.png" alt="Coparentalité Zen — S’organiser, coopérer, avancer, pour le bien de nos enfants" width={260} height={260} priority />
        <h1 className="mt-6 font-display text-2xl font-semibold leading-snug">
          Le planning de garde et le budget partagé, réunis dans une seule application apaisante.
        </h1>
        <p className="mt-3 text-soft">
          Pour les parents séparés qui veulent moins de messages, moins d’oublis, moins de tensions —
          et plus de clarté pour leurs enfants.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Link href="/app/accueil" className="btn btn-primary">Essayer la démonstration</Link>
          <Link href="/inscription" className="btn btn-ghost">Créer un compte</Link>
        </div>
      </header>

      <section className="mt-12 space-y-3">
        <h2 className="font-display text-xl font-semibold">Quatre problèmes résolus</h2>
        {problems.map(([t, d]) => (
          <div key={t} className="card p-4">
            <h3 className="font-bold">{t}</h3>
            <p className="mt-1 text-sm text-soft">{d}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Des tarifs simples</h2>
        <div className="mt-3 space-y-3">
          <div className="card p-4">
            <div className="flex items-baseline justify-between"><h3 className="font-bold">Gratuit</h3><span className="font-bold">0 €</span></div>
            <p className="mt-1 text-sm text-soft">Un foyer, deux parents, trois enfants, planning et dépenses simples, solde automatique.</p>
          </div>
          <div className="card border-navy p-4">
            <div className="flex items-baseline justify-between"><h3 className="font-bold text-navy-text">Premium</h3><span className="font-bold">4,99 €/mois</span></div>
            <p className="mt-1 text-sm text-soft">Dépenses illimitées, justificatifs, exports PDF et Excel, dépenses récurrentes, demandes de modification, rappels.</p>
          </div>
          <div className="card p-4">
            <div className="flex items-baseline justify-between"><h3 className="font-bold">Professionnel</h3><span className="font-bold">14,99 €/mois</span></div>
            <p className="mt-1 text-sm text-soft">Pour les médiateurs : plusieurs foyers en lecture seule, rapports détaillés, journal d’activité.</p>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-3">
        <h2 className="font-display text-xl font-semibold">Questions fréquentes</h2>
        {faq.map(([q, a]) => (
          <details key={q} className="card p-4">
            <summary className="cursor-pointer font-bold">{q}</summary>
            <p className="mt-2 text-sm text-soft">{a}</p>
          </details>
        ))}
      </section>

      <footer className="mt-12 space-y-2 border-t border-line pt-6 text-center text-xs text-soft">
        <p>
          Coparentalité Zen est un outil d’organisation et de suivi. Il ne remplace ni une décision
          judiciaire, ni une convention parentale, ni un conseil juridique professionnel.
        </p>
        <p>Politique de confidentialité · Conditions générales · Contact — textes en cours de validation juridique.</p>
        <p>© 2026 ParentZenFrance</p>
      </footer>
    </main>
  );
}
