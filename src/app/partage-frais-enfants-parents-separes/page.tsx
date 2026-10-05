import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur « partage des frais enfants parents séparés ».
 *
 * La question n'est presque jamais « combien » mais « qui a payé quoi » : les
 * frais s'accumulent par petites sommes, chacun garde ses tickets de son
 * côté, et le compte se refait de mémoire des mois plus tard. La page donne
 * une méthode applicable avec un simple tableau, puis présente le suivi des
 * dépenses comme la suite logique.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

const CHEMIN = '/partage-frais-enfants-parents-separes';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const metadata: Metadata = {
  title: 'Partage des frais des enfants entre parents séparés : méthode et exemple',
  description:
    'Comment partager les frais des enfants entre parents séparés : quelles dépenses '
    + 'partager, quelle répartition choisir, comment tenir les comptes au fil de l’eau. '
    + 'Exemple chiffré sur un mois.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Partage des frais des enfants entre parents séparés',
    description:
      'Quelles dépenses partager, quelle répartition retenir, et un exemple chiffré '
      + 'pour savoir où en est chacun sans refaire les comptes.',
    type: 'article',
    url: CANONIQUE,
  },
};

const CATEGORIES = [
  {
    nom: 'Les frais courants',
    texte:
      'Nourriture, hygiène, petits vêtements du quotidien : la plupart des familles '
      + 'considèrent que chaque parent les assume pendant le temps où il accueille les '
      + 'enfants. Les partager ligne par ligne coûterait plus d’énergie qu’ils ne pèsent.',
  },
  {
    nom: 'Les frais exceptionnels ou importants',
    texte:
      'Rentrée scolaire, lunettes, appareil dentaire, voyage de classe, permis de '
      + 'conduire : ce sont eux qu’on partage, parce qu’un seul parent ne devrait pas '
      + 'les porter selon le hasard du calendrier.',
  },
  {
    nom: 'Les frais récurrents de l’année',
    texte:
      'Cantine, garderie, licence sportive, cours de musique, mutuelle : prévisibles, '
      + 'ils gagnent à être listés en septembre avec la part de chacun, une fois pour '
      + 'toute l’année.',
  },
];

export default function PartageFraisEnfantsParentsSepares() {
  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-frais', contenu: 'partage-frais-enfants-parents-separes',
  }, '/inscription');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Partage des frais des enfants entre parents séparés
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Qui a payé les chaussures de sport ? Et la cantine de mars ? Partager les frais
            des enfants après une séparation est rarement une question de principe : c’est
            une question de comptes tenus, ou pas. Voici quelles dépenses partager, comment
            choisir une répartition, et un exemple chiffré.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Quels frais partager ?
          </h2>
          <p className="leading-relaxed text-soft">
            Avant toute répartition, il faut s’entendre sur ce qui se partage. Trois familles
            de dépenses reviennent presque toujours.
          </p>
          {CATEGORIES.map((categorie) => (
            <div key={categorie.nom} className="space-y-1">
              <h3 className="font-bold">{categorie.nom}</h3>
              <p className="leading-relaxed text-soft">{categorie.texte}</p>
            </div>
          ))}
          <p className="leading-relaxed text-soft">
            La règle compte moins que sa clarté. Une liste écrite des frais partagés évite
            la discussion la plus fréquente : « je ne savais pas que ça en faisait partie ».
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Quelle répartition choisir ?
          </h2>
          <p className="leading-relaxed text-soft">
            Le partage à parts égales est le plus courant et le plus simple à suivre. Quand
            les revenus des deux parents sont très différents, beaucoup de familles retiennent
            une répartition proportionnelle — 60 / 40 ou 70 / 30 par exemple. Certaines
            dépenses peuvent aussi rester entièrement à la charge d’un parent, parce qu’il l’a
            décidée seul ou parce que c’est convenu ainsi.
          </p>
          <p className="leading-relaxed text-soft">
            Si une décision de justice ou une convention homologuée prévoit déjà un partage
            des frais, c’est elle qui s’applique. Pour toute question sur vos obligations,
            adressez-vous à un avocat ou à un médiateur familial.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Un exemple chiffré sur un mois
          </h2>
          <p className="leading-relaxed text-soft">
            Sarah et Thomas partagent les frais exceptionnels à parts égales. En septembre :
          </p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-soft">
            <li>Sarah avance les fournitures scolaires : 84 €.</li>
            <li>Thomas paie la licence de football : 120 €.</li>
            <li>Sarah règle les lunettes après remboursements : 96 €.</li>
          </ul>
          <p className="leading-relaxed text-soft">
            Total du mois : 300 €, soit 150 € pour chacun. Sarah a avancé 180 €, Thomas
            120 €. Le montant à régulariser est donc de 30 € de Thomas vers Sarah — et non
            trois remboursements séparés à suivre.
          </p>
          <p className="leading-relaxed text-soft">
            Si la licence avait été partagée en 60 / 40, 60 % pour Thomas, sa part sur cette ligne
            serait passée à 72 € au lieu de 60 €. C’est pourquoi la répartition doit être
            notée avec chaque dépense, au moment où on l’enregistre, et non recalculée de
            mémoire en fin d’année.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Tenir les comptes sans y passer ses soirées
          </h2>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-soft">
            <li>
              <strong>Notez la dépense le jour même</strong> : date, montant, enfant
              concerné, catégorie, qui a payé.
            </li>
            <li>
              <strong>Photographiez le justificatif</strong> tout de suite. Un ticket
              retrouvé six mois plus tard est un ticket illisible.
            </li>
            <li>
              <strong>Indiquez la part de chacun</strong> au moment de la saisie.
            </li>
            <li>
              <strong>Regardez le solde</strong> plutôt que de recompter ligne par ligne, et
              régularisez à intervalle fixe — chaque mois, par exemple.
            </li>
          </ol>
          <p className="leading-relaxed text-soft">
            Un simple tableau partagé suffit à appliquer cette méthode. La difficulté n’est
            pas l’outil, c’est la régularité.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Quand une dépense ne fait pas l’accord
          </h2>
          <p className="leading-relaxed text-soft">
            Une dépense contestée l’est rarement pour son montant. Le plus souvent, l’autre
            parent n’avait pas été prévenu, ou ne la considérait pas comme partagée. Deux
            habitudes évitent l’essentiel de ces désaccords : prévenir avant d’engager une
            dépense importante, et distinguer clairement une dépense « à vérifier » d’une
            dépense refusée. Une précision demandée n’est pas un refus ; c’est une question
            à laquelle un justificatif ou une phrase d’explication répond presque toujours.
            Ce qui reste en désaccord après cela mérite une vraie discussion, à un autre
            moment qu’un échange d’enfants.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen
          </h2>
          <p className="leading-relaxed text-soft">
            Chaque dépense s’enregistre avec sa catégorie, l’enfant concerné, le parent qui a
            payé, la répartition (50 / 50, 60 / 40, 70 / 30 ou 100 / 0) et son justificatif.
            L’autre parent la valide ou demande une précision : personne ne valide sa propre
            dépense. Le solde se met à jour seul, au centime près, et c’est le même pour les
            deux parents. Les remboursements s’enregistrent au même endroit, et les
            justificatifs restent consultables en toutes circonstances.
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
