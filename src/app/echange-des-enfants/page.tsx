import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur « organiser les échanges d'enfants après séparation ».
 *
 * L'échange est le seul moment où les deux parents se retrouvent face à face,
 * devant les enfants, souvent pressés. Ce qui n'a pas été décidé avant se
 * négocie sur le trottoir. La page donne de quoi rendre ce moment prévisible
 * — heure, lieu, affaires — puis présente le lieu de passage et les affaires
 * à prévoir comme la suite logique.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

const CHEMIN = '/echange-des-enfants';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const metadata: Metadata = {
  title: 'Organiser les échanges d’enfants après une séparation : lieu, heure, affaires',
  description:
    'Comment organiser l’échange des enfants entre parents séparés : choisir le lieu et '
    + 'l’heure, préparer les affaires, éviter les tensions devant les enfants. Liste et '
    + 'exemple concret.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Organiser les échanges d’enfants après une séparation',
    description:
      'Lieu, heure, liste d’affaires : rendre le moment du passage court et prévisible.',
    type: 'article',
    url: CANONIQUE,
  },
};

const LIEUX = [
  {
    nom: 'La sortie de l’école ou de la crèche',
    texte:
      'Le parent qui termine sa période dépose l’enfant le matin, l’autre le récupère '
      + 'le soir. Les parents ne se croisent pas, et l’enfant vit une journée normale '
      + 'plutôt qu’une transition. C’est souvent la solution la plus apaisée — à '
      + 'condition que les affaires suivent.',
  },
  {
    nom: 'Le domicile de l’un des parents',
    texte:
      'Pratique quand les parents s’entendent. Il vaut mieux convenir d’avance si le '
      + 'parent qui dépose entre ou reste sur le pas de la porte : la question ne se '
      + 'pose plus au moment où elle pourrait gêner.',
  },
  {
    nom: 'Un lieu neutre',
    texte:
      'Parking d’un supermarché, gare, place à mi-chemin : utile quand les trajets sont '
      + 'longs ou les relations tendues. Choisissez un endroit abrité et facile d’accès, '
      + 'où attendre dix minutes n’est pas une épreuve pour un enfant.',
  },
];

const AFFAIRES = [
  'Vêtements pour la durée du séjour',
  'Cartable, devoirs en cours, matériel de sport du jour',
  'Traitement en cours et ordonnance',
  'Doudou, objet du soir',
  'Carte Vitale ou carnet de santé si un rendez-vous est prévu',
  'Chargeur du téléphone ou de la console pour les plus grands',
];

export default function EchangeDesEnfants() {
  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-echange', contenu: 'echange-des-enfants',
  }, '/inscription');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Organiser les échanges d’enfants après une séparation
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Le moment où l’enfant passe d’un parent à l’autre dure quelques minutes, mais
            c’est souvent là que les tensions se concentrent. Voici comment choisir le lieu
            et l’heure de l’échange, préparer les affaires, et faire de ce passage un moment
            sans surprise.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Pourquoi les échanges se passent mal
          </h2>
          <p className="leading-relaxed text-soft">
            Les échanges tendus le sont rarement à cause des enfants. Ils le deviennent quand
            quelque chose n’a pas été précisé avant : l’heure exacte, qui conduit, le cartable
            resté chez l’autre parent, le médicament oublié. Chaque imprécision devient une
            discussion, et cette discussion a lieu au pire moment — devant l’enfant, dans
            l’urgence, entre deux adultes qui ont chacun leur journée.
          </p>
          <p className="leading-relaxed text-soft">
            Ce qui est écrit avant n’a pas à être discuté sur le trottoir.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Choisir le lieu de l’échange
          </h2>
          {LIEUX.map((lieu) => (
            <div key={lieu.nom} className="space-y-1">
              <h3 className="font-bold">{lieu.nom}</h3>
              <p className="leading-relaxed text-soft">{lieu.texte}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Fixer une heure qui ne change pas
          </h2>
          <p className="leading-relaxed text-soft">
            Un jour et une heure identiques chaque semaine valent mieux qu’un horaire «
            arrangeant » renégocié à chaque fois. Le vendredi à 18 h, toutes les semaines,
            est une règle que l’enfant comprend et que les adultes n’ont plus à rediscuter.
            Prévoyez aussi d’avance ce qui se passe en cas de retard : au-delà de combien de
            minutes prévient-on, et par quel moyen ?
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            La liste des affaires qui voyagent
          </h2>
          <p className="leading-relaxed text-soft">
            La plupart des oublis portent sur les mêmes objets. Une liste fixe, vérifiée
            avant de partir, en évite l’essentiel :
          </p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-soft">
            {AFFAIRES.map((affaire) => (
              <li key={affaire}>{affaire}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Un exemple concret
          </h2>
          <p className="leading-relaxed text-soft">
            Léa et Karim alternent une semaine sur deux. Les premiers mois, l’échange avait
            lieu le dimanche soir chez Léa, et finissait une fois sur deux en discussion sur
            le pas de la porte : une tenue de sport manquante, un horaire glissé d’une heure.
          </p>
          <p className="leading-relaxed text-soft">
            Ils ont déplacé l’échange au vendredi, à la sortie de l’école : Karim dépose les
            enfants le matin, Léa les récupère à 16 h 30. Le sac de la semaine part avec eux le
            matin, et la liste est vérifiée la veille au soir. Sur un trimestre, cela fait
            environ six passages chez chaque parent, et plus aucun face-à-face devant les
            enfants. Les sujets qui demandent une vraie discussion — les vacances, une
            dépense importante — sont abordés à un autre moment, par écrit.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Quand l’enfant a du mal à partir
          </h2>
          <p className="leading-relaxed text-soft">
            Pleurs au moment de quitter un parent, silence dans la voiture, refus de mettre
            son manteau : ces réactions sont fréquentes, surtout les premiers mois, et ne
            disent pas forcément que l’enfant est malheureux chez l’autre parent. Une
            transition courte et toujours identique aide : un au revoir bref, un objet qui
            voyage avec lui, pas de discussion d’adultes à ce moment-là. Si les difficultés
            durent ou s’aggravent, parlez-en au pédiatre, au médecin traitant ou à un
            psychologue, qui pourront vous orienter.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen
          </h2>
          <p className="leading-relaxed text-soft">
            Le jour, l’heure et le lieu habituels du passage s’enregistrent avec le rythme de
            garde, et les deux parents voient la même information. Les affaires à prévoir
            s’attachent à un rendez-vous ou à un jour de la semaine — « le mercredi :
            affaires de piscine ». Pour un rendez-vous, le rappel envoyé avant l’heure
            signale les affaires qui restent à préparer. Un changement ponctuel, comme un
            échange de week-end, s’inscrit dans le planning commun plutôt que de se négocier
            au moment du passage.
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
