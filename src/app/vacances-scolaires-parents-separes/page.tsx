import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur « partage vacances scolaires parents séparés ».
 *
 * Les vacances sont le moment où un calendrier de garde, même bien tenu,
 * redevient une négociation : les dates changent chaque année et chaque
 * période se découpe différemment. La page explique les découpages courants
 * et la méthode pour décider tôt, avant de présenter l'import du calendrier
 * officiel comme la suite logique.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

const CHEMIN = '/vacances-scolaires-parents-separes';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const metadata: Metadata = {
  title: 'Partage des vacances scolaires entre parents séparés : méthode et exemples',
  description:
    'Comment partager les vacances scolaires entre parents séparés : découpage par '
    + 'moitié, alternance des années, été par quinzaines. Un exemple concret et une '
    + 'méthode pour décider sans conflit.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Partage des vacances scolaires entre parents séparés',
    description:
      'Les découpages courants, un exemple sur une année complète et une méthode '
      + 'pour fixer les vacances assez tôt.',
    type: 'article',
    url: CANONIQUE,
  },
};

const DECOUPAGES = [
  {
    nom: 'La moitié de chaque période',
    texte:
      'Chaque période de vacances est coupée en deux, au milieu. Un parent prend la '
      + 'première moitié, l’autre la seconde, et l’ordre s’inverse d’une année sur '
      + 'l’autre. C’est le découpage le plus répandu : il est simple, équilibré, et '
      + 'personne n’a à se souvenir de qui a eu quoi l’an dernier si la règle est écrite.',
  },
  {
    nom: 'Une période entière sur deux',
    texte:
      'Un parent prend toutes les vacances de la Toussaint, l’autre celles de Noël, '
      + 'et ainsi de suite. Moins de passages, donc moins de trajets, ce qui compte '
      + 'quand les parents vivent loin l’un de l’autre. En revanche, un enfant peut '
      + 'passer plusieurs semaines sans voir l’un de ses parents.',
  },
  {
    nom: 'L’été par quinzaines',
    texte:
      'Les grandes vacances sont trop longues pour être coupées en deux blocs quand '
      + 'les enfants sont jeunes. On les découpe alors en quinzaines alternées : '
      + 'quinze jours chez l’un, quinze jours chez l’autre, puis on recommence.',
  },
  {
    nom: 'Les années paires et impaires',
    texte:
      'Pour Noël en particulier, beaucoup de familles fixent une règle à l’année : '
      + 'les années paires, le premier parent a la première moitié ; les années '
      + 'impaires, la seconde. La règle tranche d’avance une question qui, sinon, '
      + 'revient chaque mois de novembre.',
  },
];

export default function VacancesScolairesParentsSepares() {
  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-vacances', contenu: 'vacances-scolaires-parents-separes',
  }, '/inscription');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Partage des vacances scolaires entre parents séparés
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Le rythme de garde fonctionne toute l’année, puis les vacances arrivent et tout
            se rediscute. Voici les façons les plus courantes de partager les vacances
            scolaires, un exemple sur une année complète, et une méthode pour décider assez
            tôt pour réserver sereinement.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Pourquoi les vacances posent plus de problèmes que le reste
          </h2>
          <p className="leading-relaxed text-soft">
            Une semaine sur deux, un 2-2-3 ou un 5-2-2-5 se répètent à l’identique : une fois
            la règle posée, il n’y a plus rien à décider. Les vacances, elles, changent de
            dates chaque année, n’ont pas la même durée, et ne tombent pas au même moment
            selon la zone académique. Chaque période appelle donc une décision nouvelle, et
            chaque décision prise tard se prend sous pression : billets à réserver, congés à
            poser, centre de loisirs à confirmer.
          </p>
          <p className="leading-relaxed text-soft">
            La plupart des tensions ne viennent pas d’un désaccord de fond, mais d’un
            calendrier fixé trop tard, ou fixé deux fois parce que chacun avait une version
            différente des dates.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Les façons courantes de partager les vacances scolaires
          </h2>
          {DECOUPAGES.map((decoupage) => (
            <div key={decoupage.nom} className="space-y-1">
              <h3 className="font-bold">{decoupage.nom}</h3>
              <p className="leading-relaxed text-soft">{decoupage.texte}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Un exemple sur une année scolaire
          </h2>
          <p className="leading-relaxed text-soft">
            Camille et Julien ont deux enfants et vivent à vingt minutes l’un de l’autre. Ils
            retiennent la moitié de chaque période, avec une règle d’alternance simple : les
            années paires, Camille prend la première moitié de toutes les petites vacances ;
            les années impaires, c’est Julien.
          </p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-soft">
            <li>Toussaint (deux semaines) : une semaine chacun.</li>
            <li>Noël (deux semaines) : une semaine chacun, la coupure tombant au milieu.</li>
            <li>Hiver et printemps (deux semaines chacune) : une semaine chacun.</li>
            <li>
              Été (environ huit semaines) : quatre quinzaines, deux pour chaque parent,
              en alternant.
            </li>
          </ul>
          <p className="leading-relaxed text-soft">
            Sur l’année, chaque parent passe ainsi environ huit semaines de vacances avec
            les enfants : quatre pendant les petites vacances, quatre pendant l’été. L’équilibre n’est pas parfait au jour près — une coupure tombe
            parfois un mercredi — mais la règle est connue de tous dès septembre, et c’est ce
            qui évite la discussion.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Une méthode pour décider sans conflit
          </h2>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-soft">
            <li>
              <strong>Partez des dates officielles de votre zone</strong>, pas de votre
              souvenir ni de celles de l’an dernier. Les zones A, B et C n’ont pas les mêmes
              dates pour l’hiver et le printemps.
            </li>
            <li>
              <strong>Décidez la règle avant les dates.</strong> « La moitié de chaque
              période, alternée selon l’année » se discute une fois. Les dates s’en déduisent
              ensuite sans débat.
            </li>
            <li>
              <strong>Fixez l’heure et le lieu du passage au milieu des vacances.</strong> Une
              coupure sans heure convenue devient une négociation le jour même.
            </li>
            <li>
              <strong>Décidez tôt.</strong> Les vacances d’hiver se règlent en novembre, l’été
              avant la fin de l’hiver. Plus la décision est proche, plus elle coûte cher.
            </li>
            <li>
              <strong>Écrivez la décision</strong> à un endroit que les deux parents
              consultent, plutôt que dans un fil de messages où elle se perdra.
            </li>
          </ol>
          <p className="leading-relaxed text-soft">
            Si une décision de justice ou une convention homologuée fixe déjà le partage des
            vacances, c’est elle qui s’applique. Pour toute question sur vos droits,
            adressez-vous à un avocat ou à un médiateur familial.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen
          </h2>
          <p className="leading-relaxed text-soft">
            Le calendrier scolaire officiel est importé automatiquement pour la zone de votre
            foyer : personne n’a à recopier de dates. Période par période, l’application
            propose ces dates ; vous choisissez le parent qui accueille les enfants et ajustez
            librement le découpage. Les vacances apparaissent ensuite dans le planning commun,
            le même pour les deux parents, et un rappel prévient chacun du début et de la fin
            de chaque période.
          </p>
          <p className="leading-relaxed text-soft">
            Les vacances ne modifient jamais d’elles-mêmes la garde : elles restent une
            information, et seules les décisions des parents déplacent les enfants.
          </p>
          <Link
            href={versInscription}
            className="inline-block rounded-xl bg-navy-text px-5 py-3 font-bold text-white"
          >
            Créer mon espace — 3 mois gratuits
          </Link>
        </section>

        <PagesLiees chemin={CHEMIN} />
      </article>
    </main>
  );
}
