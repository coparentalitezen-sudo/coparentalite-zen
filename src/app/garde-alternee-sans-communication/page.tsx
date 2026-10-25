import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur « garde alternée sans communication avec l'autre parent ».
 *
 * Une grande partie des parents qui cherchent un outil de garde alternée le
 * font parce que l'autre parent ne répond pas, ou refuse tout outil commun.
 * Le reste du site leur laissait croire qu'il fallait être deux. Cette page
 * leur répond directement, et présente l'usage seul de l'application.
 *
 * Ton volontairement neutre : il s'agit de s'organiser et de garder une trace
 * claire, jamais de « constituer un dossier » contre l'autre parent.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

const CHEMIN = '/garde-alternee-sans-communication';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const metadata: Metadata = {
  title: 'Garde alternée sans communication avec l’autre parent : s’organiser seul',
  description:
    'L’autre parent ne répond pas ou refuse tout outil commun ? Comment tenir le '
    + 'planning de garde et les frais des enfants seul, garder une trace claire et '
    + 'savoir quand se faire aider.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Garde alternée sans communication avec l’autre parent',
    description:
      'Tenir le planning et les frais seul, sans attendre l’autre parent, et garder '
      + 'une trace claire de chaque décision.',
    type: 'article',
    url: CANONIQUE,
  },
};

const FAQ = [
  {
    question: 'Peut-on gérer une garde alternée sans communiquer avec l’autre parent ?',
    reponse:
      'En grande partie, oui : le rythme fixé par le jugement ou la convention s’applique '
      + 'sans échange. Restent les informations importantes — école, santé, changements '
      + 'ponctuels — à transmettre par écrit, brièvement et sur un seul canal.',
  },
  {
    question: 'Comment suivre les frais des enfants si l’autre parent ne répond pas ?',
    reponse:
      'Notez chaque dépense le jour même, avec sa date, son montant, la part de chacun et '
      + 'le justificatif. Un relevé tenu au fil de l’eau est plus simple à transmettre, à '
      + 'un médiateur par exemple, qu’une pile de tickets retrouvés des mois plus tard.',
  },
  {
    question: 'Qui peut aider quand la communication est rompue ?',
    reponse:
      'Un médiateur familial, d’abord : des services conventionnés existent, avec une '
      + 'participation calculée selon les revenus. Pour faire appliquer ou modifier une '
      + 'décision, un avocat ou le juge aux affaires familiales.',
  },
];

export default function GardeAlterneeSansCommunication() {
  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-solo', contenu: 'garde-alternee-sans-communication',
  }, '/inscription');

  const faqStructuree = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.reponse },
    })),
  };

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <script
        type="application/ld+json"
        // Construit à partir des constantes de cette page uniquement.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuree) }}
      />
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Garde alternée sans communication avec l’autre parent : s’organiser seul
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Les messages restent sans réponse, chaque échange tourne au désaccord, ou
            l’autre parent refuse tout outil commun. La garde, elle, continue. Voici comment
            tenir le planning et les frais des enfants de votre côté, garder une trace claire,
            et savoir quand se faire aider.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Ce que vous pouvez tenir seul
          </h2>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-soft">
            <li>
              <strong>Le planning, à partir de la décision qui le fixe.</strong> Le rythme
              prévu par le jugement ou la convention s’applique sans qu’il faille le
              renégocier. Reportez-le dans un calendrier, vacances comprises, pour savoir
              chaque jour où sont les enfants.
            </li>
            <li>
              <strong>Chaque changement, daté.</strong> Un échange de week-end accepté, un
              retard, une absence : notez-le le jour même, avec ce qui a été convenu et par
              quel moyen.
            </li>
            <li>
              <strong>Les frais des enfants, au fil de l’eau.</strong> Date, montant, part de
              chacun, justificatif. Six mois plus tard, personne ne se souvient de qui a payé
              les chaussures de sport.
            </li>
            <li>
              <strong>Les informations importantes, par écrit et brièvement.</strong> École,
              santé, activités : un message court, factuel, sur un seul canal. Ce qui est
              écrit une fois n’a pas à être répété.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Ce qu’il vaut mieux éviter
          </h2>
          <ul className="list-disc space-y-2 pl-5 leading-relaxed text-soft">
            <li>
              <strong>Modifier seul le rythme fixé par une décision.</strong> Même si l’autre
              parent ne répond pas, le changer de votre propre chef peut vous être reproché.
            </li>
            <li>
              <strong>Multiplier les canaux.</strong> SMS, e-mail, messagerie, mot dans le
              cartable : l’information se perd, et chacun peut dire ne pas l’avoir reçue.
            </li>
            <li>
              <strong>Répondre sur le même ton.</strong> Un message neutre et daté sert
              toujours mieux qu’une réponse écrite sous le coup de la colère.
            </li>
            <li>
              <strong>Faire passer les messages par les enfants.</strong> Ils n’ont pas à
              porter l’organisation des adultes.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Questions fréquentes</h2>
          {FAQ.map((item) => (
            <div key={item.question} className="space-y-1">
              <h3 className="font-bold">{item.question}</h3>
              <p className="leading-relaxed text-soft">{item.reponse}</p>
            </div>
          ))}
          <p className="leading-relaxed text-soft">
            Cette page donne des repères d’organisation, pas un conseil juridique. Pour toute
            question sur vos droits, adressez-vous à un avocat ou à un médiateur familial.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen, même seul
          </h2>
          <p className="leading-relaxed text-soft">
            L’application fonctionne sans que l’autre parent s’inscrive. Vous indiquez
            simplement son prénom : il sert de repère dans le planning et les dépenses, sans
            compte, et il ne reçoit rien. Votre rythme de garde et les vacances scolaires
            officielles construisent le planning ; chaque dépense est conservée, datée, avec
            son justificatif, et vous voyez ce qu’elle représente en attendant qu’il la
            vérifie.
          </p>
          <p className="leading-relaxed text-soft">
            S’il rejoint un jour l’application, il retrouve tout l’historique et peut
            vérifier chaque dépense. Sinon, vous continuez seul, sans rien perdre.
          </p>
          <Link
            href={versInscription}
            className="inline-block rounded-xl bg-navy-text px-5 py-3 font-bold text-white"
          >
            Créer mon planning — 3 mois gratuits
          </Link>
        </section>

        <PagesLiees chemin={CHEMIN} />
      </article>
    </main>
  );
}
