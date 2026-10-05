import type { Metadata } from 'next';
import Link from 'next/link';
import { PagesLiees } from '@/components/pages-liees';
import { construireLien } from '@/lib/marketing/utm';

/**
 * Page d'entrée sur « calcul pension alimentaire enfant » et « suivi pension
 * alimentaire ».
 *
 * La première requête appelle une réponse que ce site ne doit pas donner :
 * un montant. Le calcul relève du juge ou d'une convention, et un chiffre
 * avancé ici serait une promesse juridique. La page explique donc le
 * principe, renvoie vers les professionnels, et se concentre sur ce qu'elle
 * peut réellement apporter : le suivi des versements et de leurs preuves.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

const CHEMIN = '/pension-alimentaire-suivi';
const CANONIQUE = new URL(CHEMIN, BASE).toString();

export const metadata: Metadata = {
  title: 'Pension alimentaire enfant : calcul et suivi des versements',
  description:
    'Le principe du calcul de la pension alimentaire pour un enfant, qui la fixe, et '
    + 'comment suivre les versements et garder les justificatifs mois par mois.',
  alternates: { canonical: CANONIQUE },
  openGraph: {
    title: 'Pension alimentaire : calcul et suivi des versements',
    description:
      'Ce qui détermine le montant, qui le fixe, et une méthode simple pour suivre '
      + 'chaque versement avec sa preuve.',
    type: 'article',
    url: CANONIQUE,
  },
};

const CRITERES = [
  {
    nom: 'Les ressources de chaque parent',
    texte:
      'Chaque parent contribue à l’entretien et à l’éducation de l’enfant à proportion '
      + 'de ses ressources et de celles de l’autre. Ce n’est donc pas un montant fixe par '
      + 'enfant : deux familles aux situations différentes n’arrivent pas au même chiffre.',
  },
  {
    nom: 'Les besoins de l’enfant',
    texte:
      'L’âge, la scolarité, la santé, les activités entrent en compte. Les besoins d’un '
      + 'adolescent ne sont pas ceux d’un enfant de trois ans.',
  },
  {
    nom: 'Le mode de résidence',
    texte:
      'Le temps que l’enfant passe chez chaque parent pèse sur la répartition. En '
      + 'résidence alternée, une pension peut exister ou non selon l’écart de ressources '
      + 'entre les parents.',
  },
];

export default function PensionAlimentaireSuivi() {
  const versInscription = construireLien(BASE, {
    source: 'google', campagne: 'seo-pension', contenu: 'pension-alimentaire-suivi',
  }, '/inscription');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <article className="space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-navy-text underline">
            CoparentalitéZen
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Pension alimentaire pour un enfant : calcul et suivi
          </h1>
          <p className="text-lg leading-relaxed text-soft">
            Comment se calcule la pension alimentaire d’un enfant, qui la fixe, et comment
            suivre les versements pour ne jamais avoir à chercher une preuve de paiement.
            Cette page explique les principes ; elle ne remplace pas l’avis d’un
            professionnel.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            Le principe du calcul
          </h2>
          <p className="leading-relaxed text-soft">
            En France, la pension alimentaire est la forme la plus courante de la
            contribution de chaque parent à l’entretien et à l’éducation de l’enfant. Il
            n’existe pas de montant unique : elle dépend de plusieurs éléments, que le juge
            ou les parents apprécient ensemble.
          </p>
          {CRITERES.map((critere) => (
            <div key={critere.nom} className="space-y-1">
              <h3 className="font-bold">{critere.nom}</h3>
              <p className="leading-relaxed text-soft">{critere.texte}</p>
            </div>
          ))}
          <p className="leading-relaxed text-soft">
            Le ministère de la Justice publie une table de référence indicative, qui sert de
            point de départ aux discussions. Elle ne s’impose à personne, et le montant final
            peut s’en écarter selon la situation. Nous ne reproduisons volontairement aucun
            barème ici : un chiffre lu sur une page web, sorti de son contexte, crée plus de
            malentendus qu’il n’en règle.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Qui fixe le montant ?
          </h2>
          <p className="leading-relaxed text-soft">
            Le montant est fixé par le juge aux affaires familiales, ou par les parents
            eux-mêmes dans un accord qui doit être rendu exécutoire — par homologation, par
            convention de divorce, ou par la caisse d’allocations familiales dans certains
            cas. Un accord oral ou un simple échange de messages ne protège ni l’un ni
            l’autre parent en cas de désaccord ultérieur.
          </p>
          <p className="leading-relaxed text-soft">
            La décision prévoit en général une revalorisation régulière, le plus souvent
            annuelle. Pour toute question sur le montant, sa révision ou son recouvrement,
            adressez-vous à un avocat, à un médiateur familial ou à votre caisse
            d’allocations familiales.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Suivre les versements : un exemple sur une année
          </h2>
          <p className="leading-relaxed text-soft">
            Une fois le montant fixé, la difficulté change de nature : il ne s’agit plus de
            calculer, mais de prouver. Prenons une pension fixée à 200 € par mois, versée
            par virement avant le 5.
          </p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-soft">
            <li>Douze versements attendus sur l’année, soit 2 400 €.</li>
            <li>
              En mars, le virement part le 12 au lieu du 5 : le paiement est fait, mais en
              retard. Sans trace écrite, six mois plus tard, personne ne s’en souvient de la
              même façon.
            </li>
            <li>
              En janvier, la revalorisation prévue par la décision s’applique. Si le nouveau
              montant n’est noté nulle part, l’écart se cumule mois après mois sans que
              personne ne le voie.
            </li>
          </ul>
          <p className="leading-relaxed text-soft">
            Un tableau de suivi tenu au fil de l’eau répond à ces trois situations : mois
            concerné, montant versé, date, moyen de paiement, et justificatif joint. Il suffit
            de le compléter au moment du paiement et de vérifier une fois par trimestre
            qu’aucun mois ne manque.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Quand un versement manque ou arrive en retard
          </h2>
          <p className="leading-relaxed text-soft">
            Un retard isolé a souvent une explication simple : un virement programmé
            interrompu, un changement de banque. Le signaler par écrit, calmement, en
            précisant le mois concerné, suffit en général à le régler. Le suivi tenu au fil
            de l’eau sert justement à ce moment-là : il évite de discuter de mémoire.
          </p>
          <p className="leading-relaxed text-soft">
            Si les impayés se répètent, des recours existent, notamment auprès de la caisse
            d’allocations familiales, qui peut dans certains cas servir d’intermédiaire pour
            le versement. Les conditions dépendent de votre situation : renseignez-vous
            auprès de votre caisse ou d’un professionnel du droit avant d’engager une
            démarche.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">
            Avec Coparentalité Zen
          </h2>
          <p className="leading-relaxed text-soft">
            L’application ne calcule pas de pension alimentaire et ne donne aucun conseil
            juridique. Elle sert au suivi : chaque versement s’enregistre dans la catégorie
            « Pension / contribution », avec sa date, son montant et la preuve de paiement
            jointe. L’historique est le même pour les deux parents, et les justificatifs
            restent accessibles en toutes circonstances — y compris après la période
            gratuite, parce qu’une pièce qui peut servir devant un médiateur ne doit jamais
            être bloquée.
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
