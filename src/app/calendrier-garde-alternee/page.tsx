import type { Metadata } from 'next';
import Link from 'next/link';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur la recherche réelle des parents séparés.
 *
 * Le nom du produit contient « coparentalité », mais ce mot désigne en France
 * un tout autre service : les plateformes de mise en relation pour concevoir
 * un enfant à deux sans être en couple. Se positionner dessus revenait à
 * disputer une requête à des sites qui répondent à une autre question, devant
 * un public qui n'est pas le nôtre.
 *
 * Les parents déjà séparés, eux, cherchent « calendrier garde alternée »,
 * « semaines paires impaires », « planning parents séparés ». Cette page vise
 * ce vocabulaire-là et mène au questionnaire, qui ne demande pas de compte :
 * exiger une inscription avant d'avoir rendu le moindre service perdrait la
 * personne venue chercher un calendrier.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

const CANONIQUE = new URL('/calendrier-garde-alternee', BASE).toString();

export const metadata: Metadata = {
  title: 'Calendrier de garde alternée 2026-2027 : créez le vôtre gratuitement',
  description:
    'Créez votre calendrier de garde alternée en cinq questions. Semaines paires '
    + 'et impaires, 2-2-3, 5-2-2-5, vacances scolaires. Gratuit, sans inscription.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Calendrier de garde alternée 2026-2027',
    description:
      'Cinq questions, le rythme qui correspond à votre organisation, '
      + 'et votre planning sur quinze jours. Sans créer de compte.',
    type: 'article',
    url: CANONIQUE,
  },
};

const RYTHMES = [
  {
    nom: 'Une semaine sur deux (semaines paires et impaires)',
    texte:
      'L’enfant alterne du vendredi au vendredi. C’est le rythme le plus répandu : '
      + 'peu de transitions, et une règle que tout le monde retient sans y penser.',
  },
  {
    nom: '2-2-3',
    texte:
      'Deux jours chez un parent, deux chez l’autre, trois pour le week-end, puis on '
      + 'inverse. Souvent retenu pour les enfants jeunes, qui supportent mal une '
      + 'semaine entière loin d’un parent.',
  },
  {
    nom: '5-2-2-5',
    texte:
      'Chaque parent garde les mêmes jours de semaine, toutes les semaines. Les '
      + 'activités du mercredi ou du samedi tombent toujours du même côté, ce qui '
      + 'simplifie les inscriptions à l’année.',
  },
  {
    nom: 'Un week-end sur deux et la moitié des vacances',
    texte:
      'La résidence principale est fixée chez un parent, l’autre accueille un week-end '
      + 'sur deux. Le calendrier des vacances devient alors la partie la plus délicate '
      + 'à poser.',
  },
  {
    nom: 'Un rythme sur mesure',
    texte:
      'Éloignement géographique, horaires décalés, travail de nuit : aucune des '
      + 'formules courantes ne convient à tout le monde, et un planning bâti sur une '
      + 'formule inadaptée finit par ne plus être suivi.',
  },
];

export default function CalendrierGardeAlternee() {
  const versQuiz = construireLien(BASE, {
    source: 'google', campagne: 'seo-calendrier', contenu: 'calendrier-garde-alternee',
  }, '/quiz');

  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-calendrier', contenu: 'calendrier-garde-alternee-bas',
  }, '/inscription');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Calendrier de garde alternée 2026-2027
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Répondez à cinq questions, découvrez le rythme qui correspond à votre
            organisation et visualisez votre planning sur quinze jours. Sans inscription
            et sans carte bancaire.
          </p>
          <Link
            href={versQuiz}
            className="inline-block rounded-xl bg-navy-text px-5 py-3 font-bold text-white"
          >
            Créer mon calendrier
          </Link>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Les rythmes de garde les plus courants
          </h2>
          {RYTHMES.map((rythme) => (
            <div key={rythme.nom} className="space-y-1">
              <h3 className="font-bold">{rythme.nom}</h3>
              <p className="leading-relaxed text-soft">{rythme.texte}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Les vacances scolaires changent tout
          </h2>
          <p className="leading-relaxed text-soft">
            Les zones A, B et C n’ont pas les mêmes dates. Un calendrier de garde qui
            ignore la zone académique de l’enfant produit sa première erreur dès les
            vacances d’hiver, et c’est presque toujours à ce moment-là que la discussion
            recommence. Vérifiez votre zone avant de figer quoi que ce soit.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Ce que ce calendrier ne remplace pas
          </h2>
          <p className="leading-relaxed text-soft">
            Coparentalité Zen est un outil d’organisation. Il ne remplace ni une décision
            judiciaire, ni une convention parentale homologuée, ni l’avis d’un
            professionnel. Pour toute question portant sur vos droits, adressez-vous à un
            avocat ou à un médiateur familial.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Et après le calendrier ?</h2>
          <p className="leading-relaxed text-soft">
            Un planning partagé règle la question « c’est chez qui ce week-end ». Il ne
            règle pas « qui a payé les chaussures ». Coparentalité Zen réunit les deux au
            même endroit, avec un compte distinct pour chaque parent : personne ne
            consulte le calendrier de l’autre, chacun voit celui des enfants.
          </p>
          <Link
            href={versInscription}
            className="inline-block rounded-xl bg-navy-text px-5 py-3 font-bold text-white"
          >
            Créer mon espace familial
          </Link>
        </section>
      </article>
    </main>
  );
}
