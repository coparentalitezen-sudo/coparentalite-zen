import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';
import {
  anneeScolaireDuProchainNoel, dateLongue, lireNoelOfficiel,
} from '@/lib/noel';

/**
 * Page d'entrée sur « vacances de Noël garde alternée ».
 *
 * La question revient chaque année entre novembre et décembre, avec une
 * urgence que n'ont pas les autres vacances : réveillon, familles élargies,
 * billets de train. C'est aussi la période où le produit rend le service le
 * plus visible — des dates officielles, un découpage écrit, un rappel.
 *
 * Les dates sont lues dans la source officielle et le découpage est calculé
 * (lib/noel.ts) : la page reste juste d'une année sur l'autre sans retouche.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

const CHEMIN = '/vacances-noel-garde-alternee';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const annee = anneeScolaireDuProchainNoel(new Date().toISOString()).slice(0, 4);
  const titre = `Vacances de Noël ${annee} en garde alternée : qui a les enfants ?`;
  return {
    title: titre,
    description:
      `Dates officielles des vacances de Noël ${annee}, découpage en deux moitiés, `
      + 'années paires et impaires, réveillon et Nouvel An : comment partager Noël '
      + 'entre parents séparés, avec un exemple calculé.',
    alternates: { canonical: CANONIQUE },
    openGraph: {
      title: titre,
      description:
        'Les dates officielles, le découpage le plus courant et les façons de '
        + 'partager le réveillon et le Nouvel An.',
      type: 'article',
      url: CANONIQUE,
    },
  };
}

const FACONS = [
  {
    nom: 'La moitié des vacances, alternée selon l’année',
    texte:
      'Les vacances sont coupées en leur milieu. Un parent prend la première moitié '
      + 'les années paires, l’autre les années impaires. C’est la formule que prévoient '
      + 'le plus souvent les jugements et les conventions : chacun a Noël une année sur '
      + 'deux, et le Nouvel An l’année où il n’a pas Noël.',
  },
  {
    nom: 'Le réveillon chez l’un, le 25 chez l’autre',
    texte:
      'Quand les parents vivent près l’un de l’autre, certains coupent la fête '
      + 'elle-même : réveillon du 24 chez un parent, déjeuner du 25 chez l’autre, et '
      + 'l’ordre s’inverse chaque année. Les enfants voient leurs deux familles, au prix '
      + 'd’un trajet le jour de Noël.',
  },
  {
    nom: 'Une fête chacun, sans alterner',
    texte:
      'Une famille tient au réveillon, l’autre au 31 décembre : chaque parent garde '
      + 'chaque année la fête qui compte le plus pour lui. Simple et stable, à condition '
      + 'que l’équilibre convienne vraiment aux deux.',
  },
];

const FAQ = [
  {
    question: 'Qui a les enfants à Noël en garde alternée ?',
    reponse:
      'Celui que désigne votre jugement ou votre accord. La règle la plus courante '
      + 'donne la première moitié des vacances à un parent les années paires et à '
      + 'l’autre les années impaires ; le 25 décembre tombe généralement dans la '
      + 'première moitié.',
  },
  {
    question: 'Comment calculer le milieu des vacances de Noël ?',
    reponse:
      'On compte les jours entre le premier jour sans classe et la veille de la reprise, '
      + 'puis on coupe en deux. L’heure du passage n’est pas fixée par le calendrier '
      + 'scolaire : mieux vaut la convenir par écrit à l’avance.',
  },
  {
    question: 'Les vacances de Noël sont-elles les mêmes pour toutes les zones ?',
    reponse:
      'Oui, en France métropolitaine les zones A, B et C ont les mêmes dates de '
      + 'vacances de Noël, contrairement aux vacances d’hiver et de printemps.',
  },
];

export default async function VacancesNoelGardeAlternee() {
  const annee = anneeScolaireDuProchainNoel(new Date().toISOString());
  const noel = await lireNoelOfficiel(annee);
  const anneeCivile = annee.slice(0, 4);
  const paire = Number(anneeCivile) % 2 === 0;

  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-noel', contenu: 'vacances-noel-garde-alternee',
  }, '/inscription');
  const versQuiz = construireLien(BASE, {
    source: 'google', campagne: 'seo-noel', contenu: 'vacances-noel-garde-alternee',
  }, '/quiz');

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
            Vacances de Noël {anneeCivile} en garde alternée : qui a les enfants ?
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Noël est la période de l’année où un planning de garde, même bien rodé, se
            rediscute : réveillon, familles des deux côtés, trajets à réserver. Voici les
            dates officielles, le découpage le plus courant calculé pour cette année, et
            les autres façons de partager les fêtes.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Les dates des vacances de Noël {anneeCivile}
          </h2>
          {noel ? (
            <div className="card space-y-2 p-5">
              <p className="leading-relaxed">
                <strong>Fin des cours :</strong> {dateLongue(noel.finDesCours)}, après la classe.
              </p>
              <p className="leading-relaxed">
                <strong>Reprise :</strong> {dateLongue(noel.reprise)} au matin.
              </p>
              <p className="text-sm text-soft">
                Mêmes dates pour les zones A, B et C. Source : calendrier scolaire
                officiel du ministère de l’Éducation nationale.
              </p>
            </div>
          ) : (
            <p className="leading-relaxed text-soft">
              Le calendrier officiel n’a pas pu être consulté pour le moment. Les dates
              sont publiées sur le site du ministère de l’Éducation nationale ; les zones
              A, B et C ont les mêmes vacances de Noël.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Le découpage le plus courant : moitié-moitié, années paires et impaires
          </h2>
          <p className="leading-relaxed text-soft">
            La plupart des jugements et des conventions parentales coupent les vacances en
            deux : un parent a la première moitié les années paires, l’autre les années
            impaires. {anneeCivile} est une année <strong>{paire ? 'paire' : 'impaire'}</strong>.
          </p>
          {noel && (
            <div className="card space-y-3 p-5">
              <p className="leading-relaxed">
                <strong>Première moitié :</strong> du {dateLongue(noel.premiereMoitie.debut, false)}{' '}
                au {dateLongue(noel.premiereMoitie.fin, false)}
                {noel.noelDansLaPremiereMoitie && ' — réveillon et jour de Noël compris'}.
              </p>
              <p className="leading-relaxed">
                <strong>Seconde moitié :</strong> du {dateLongue(noel.secondeMoitie.debut, false)}{' '}
                au {dateLongue(noel.secondeMoitie.fin)}
                {noel.noelDansLaPremiereMoitie && ' — Saint-Sylvestre et jour de l’An compris'}.
              </p>
              <p className="text-sm text-soft">
                Calcul sur {noel.nombreDeJours} jours, du premier jour sans classe à la
                veille de la reprise. Beaucoup de familles font démarrer la première
                moitié dès la sortie des classes le {dateLongue(noel.finDesCours, false)} :
                l’heure et le lieu du passage sont à convenir par écrit.
              </p>
            </div>
          )}
          <p className="leading-relaxed text-soft">
            Si une décision de justice ou une convention homologuée fixe le partage, c’est
            elle qui s’applique, y compris pour l’heure du passage. Pour toute question sur
            vos droits, adressez-vous à un avocat ou à un médiateur familial.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Les autres façons de partager Noël
          </h2>
          {FACONS.map((facon) => (
            <div key={facon.nom} className="space-y-1">
              <h3 className="font-bold">{facon.nom}</h3>
              <p className="leading-relaxed text-soft">{facon.texte}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Ce qui fait déraper Noël, et comment l’éviter
          </h2>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-soft">
            <li>
              <strong>L’heure du passage.</strong> « Au milieu des vacances » ne dit ni
              l’heure ni le lieu. Fixez-les dès novembre.
            </li>
            <li>
              <strong>Les billets de train.</strong> Ils se réservent tôt et coûtent plus
              cher chaque semaine : décider tard, c’est payer la différence.
            </li>
            <li>
              <strong>Les cadeaux.</strong> Deux fois le même jouet, ou un gros cadeau
              d’un côté seulement : un mot échangé à l’avance suffit. Si le cadeau est une
              dépense commune, notez-la le jour de l’achat.
            </li>
            <li>
              <strong>Le parent qui n’a pas Noël.</strong> Un appel en visio le 25 à une
              heure convenue évite qu’il devienne un sujet de tension.
            </li>
            <li>
              <strong>La décision écrite au mauvais endroit.</strong> Un accord perdu dans
              un fil de messages se rediscute ; un planning commun, non.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Questions fréquentes</h2>
          {FAQ.map((item) => (
            <div key={item.question} className="space-y-1">
              <h3 className="font-bold">{item.question}</h3>
              <p className="leading-relaxed text-soft">{item.reponse}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen
          </h2>
          <p className="leading-relaxed text-soft">
            Les dates officielles des vacances sont importées automatiquement pour la zone
            de votre foyer. Vous indiquez qui accueille les enfants pour chaque moitié, et
            le découpage apparaît dans le planning commun, le même pour les deux parents.
            Un rappel prévient chacun avant le début et la fin de sa période, et les
            dépenses des fêtes se partagent au même endroit.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={versInscription}
              className="inline-block rounded-xl bg-navy-text px-5 py-3 text-center font-bold text-white"
            >
              Créer mon planning — 3 mois gratuits
            </Link>
            <Link
              href={versQuiz}
              className="inline-block rounded-xl border border-line px-5 py-3 text-center font-bold text-navy-text"
            >
              Trouver mon rythme de garde
            </Link>
          </div>
        </section>

        <PagesLiees chemin={CHEMIN} />
      </article>
    </main>
  );
}
