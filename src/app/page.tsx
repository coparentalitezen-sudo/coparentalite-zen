import type { Metadata } from 'next';
import Image from 'next/image';
import { InstallAppCard } from '@/components/install-app-card';
import Link from 'next/link';
import { BoutonAchat } from '@/components/bouton-achat';
import { lireGrilleTarifaire, lireGrilleExtensions, formatPrix } from '@/lib/tarifs';
import { SchemaRythme } from '@/components/rythme';
import { schemaDeuxSemaines } from '@/lib/rythmes';
import { PAGES_THEMATIQUES } from '@/lib/marketing/pages-thematiques';

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

// Le titre par défaut du site commençait par « Coparentalité », mot qui
// désigne en France un autre service (voir calendrier-garde-alternee) : la
// page d'accueil porte les termes que les parents séparés recherchent.
export const metadata: Metadata = {
  title: 'Planning de garde alternée et frais des enfants partagés | Coparentalité Zen',
  description:
    'Le planning de garde alternée, les vacances scolaires et les dépenses des '
    + 'enfants, partagés entre les deux parents dans une application simple. '
    + '3 mois gratuits, sans carte bancaire.',
  alternates: { canonical: BASE },
};

/**
 * Garanties affichées sous l'aperçu. Chacune est vérifiable : base Supabase
 * en région eu-west-3 (Paris), politique de confidentialité (aucune revente,
 * mesure d'audience sans cookie), règles de l'offre (export toujours
 * accessible) et règles comptables (validation par l'autre parent).
 */
const garanties = [
  'Données hébergées à Paris',
  'Aucune publicité ni revente de données',
  'Chaque dépense validée par l’autre parent',
  'Vos données exportables à tout moment',
];

const avantages = [
  {
    icone: '📅',
    titre: 'Un planning de garde toujours clair',
    description:
      'Visualisez immédiatement chez quel parent sont les enfants, les prochaines périodes de garde et les changements prévus.',
  },
  {
    icone: '↔️',
    titre: 'Des changements ponctuels maîtrisés',
    description:
      'Ajoutez une modification exceptionnelle sans dérégler votre rythme de garde habituel.',
  },
  {
    icone: '💳',
    titre: 'Des dépenses partagées simplement',
    description:
      'Enregistrez les frais liés aux enfants et suivez clairement ce que chaque parent a payé.',
  },
  {
    icone: '👨‍👩‍👧',
    titre: 'À deux, ou seul si l’autre ne suit pas',
    description:
      'Invitez l’autre parent pour que chacun voie les mêmes informations. S’il refuse, vous utilisez l’application seul : planning, dépenses et justificatifs restent complets.',
  },
  {
    icone: '🏖️',
    titre: 'Les vacances centralisées',
    description:
      'Ajoutez les vacances scolaires et les périodes exceptionnelles dans le même calendrier.',
  },
  {
    icone: '🧾',
    titre: 'Un historique fiable',
    description:
      'Retrouvez les dépenses, les changements de planning et les informations importantes du foyer.',
  },
];

const etapes = [
  {
    numero: '1',
    titre: 'Créez votre foyer',
    description:
      'Ajoutez vos enfants et configurez votre rythme de garde habituel.',
  },
  {
    numero: '2',
    titre: 'Invitez l’autre parent, si vous le souhaitez',
    description:
      'Chaque parent accède au même planning et aux mêmes dépenses. Rien ne vous oblige à attendre son inscription.',
  },
  {
    numero: '3',
    titre: 'Organisez-vous sereinement',
    description:
      'Centralisez les informations importantes et réduisez les oublis et les incompréhensions.',
  },
];

const fonctionsGratuites = [
  'Un foyer partagé',
  'Deux parents',
  'Enfants illimités',
  'Planning de garde',
  'Vacances scolaires',
  'Changements ponctuels',
  'Gestion des dépenses',
  'Calcul automatique du solde',
  'Consultation de l’historique',
  '3 mois gratuits dès la création de votre espace',
];

const fonctionsZenPlus = [
  'Calendrier futur sans limite',
  'Historique complet',
  'Exports PDF et Excel',
  'Statistiques par enfant et par catégorie',
  'Dépenses récurrentes',
  'Rapport annuel de coparentalité',
  'Recherche et filtres avancés',
  'Fonctionnalités Premium à venir',
];

/**
 * Repli d'affichage uniquement, utilisé si la base est injoignable.
 * Les prix qui font foi sont dans la table plan_extensions — voir
 * lireGrilleExtensions(). Ces valeurs doivent y rester alignées.
 */
const extensions = [
  {
    id: null,
    duree: '+1 mois',
    prix: '2,99 €',
    description: 'Pour préparer une période ponctuelle un peu plus éloignée.',
    recommande: false,
  },
  {
    id: null,
    duree: '+6 mois',
    prix: '14,99 €',
    description: 'Idéal pour organiser les prochaines vacances et la rentrée.',
    recommande: false,
  },
];

const faq = [
  {
    question: 'Puis-je utiliser Coparentalité Zen sans l’autre parent ?',
    reponse:
      'Oui, entièrement. Vous indiquez simplement son prénom : il sert de repère dans le planning et les dépenses, sans qu’il ait de compte ni ne reçoive quoi que ce soit. Vos dépenses restent conservées, datées, avec leurs justificatifs, et vous voyez ce qu’elles représentent. S’il rejoint un jour l’application, il retrouve tout l’historique.',
  },
  {
    question: 'Que comprennent les 3 mois gratuits ?',
    reponse:
      'À la création de votre espace, vous pouvez planifier librement pendant 3 mois. Passé ce délai, votre historique reste consultable et vos données ne sont jamais supprimées : seule la planification vers le futur demande une extension ou Zen Plus.',
  },
  {
    question: 'Que se passe-t-il au bout des 3 mois ?',
    reponse:
      'Vous pouvez continuer à utiliser l’application, consulter votre planning et gérer vos dépenses courantes. Pour planifier plus loin, vous choisissez une extension ponctuelle ou Zen Plus. Aucun prélèvement n’est déclenché automatiquement.',
  },
  {
    question: 'L’achat d’une extension est-il un abonnement ?',
    reponse:
      'Non. Une extension est un achat ponctuel qui repousse votre limite de planification. Elle ne se renouvelle pas automatiquement.',
  },
  {
    question: 'L’application remplace-t-elle une convention parentale ?',
    reponse:
      'Non. Coparentalité Zen est un outil d’organisation et de suivi. Il ne remplace ni une décision judiciaire, ni une convention parentale, ni un conseil juridique.',
  },
  {
    question: 'Est-ce une application mobile ?',
    reponse:
      'Coparentalité Zen fonctionne sur iPhone, Android, tablette et ordinateur depuis le navigateur. Elle peut également être installée comme une application web.',
  },
];

export default async function Landing() {
  // Prix lus en base : aucun montant n'est écrit dans cette page.
  const [grille, grilleExtensions] = await Promise.all([
    lireGrilleTarifaire(), lireGrilleExtensions(),
  ]);
  const zenPlus = grille?.find((f) => f.planId === 'premium') ?? null;
  // Les extensions codées plus haut ne servent que si la base est injoignable
  const extensionsAffichees = grilleExtensions?.length
    ? grilleExtensions.map((e) => ({
        id: e.extensionId,
        duree: e.libelle,
        prix: formatPrix(e.prixCents),
        description: e.description ?? '',
        recommande: e.recommande,
      }))
    : extensions;
  // Données structurées : la FAQ reprend mot pour mot les questions affichées
  // plus bas, et l'offre ne cite que des prix lus dans la grille — un montant
  // annoncé aux moteurs doit être celui facturé, comme partout ailleurs.
  const donneesStructurees = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Coparentalité Zen',
      url: BASE,
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'iOS, Android, Web',
      inLanguage: 'fr',
      description:
        'Planning de garde alternée, vacances scolaires et dépenses des enfants '
        + 'partagés entre parents séparés.',
      offers: [
        { '@type': 'Offer', name: 'Gratuit', price: '0', priceCurrency: 'EUR' },
        ...(zenPlus && zenPlus.prixAnnuelCents > 0
          ? [{
              '@type': 'Offer',
              name: 'Zen Plus (annuel)',
              price: (zenPlus.prixAnnuelCents / 100).toFixed(2),
              priceCurrency: 'EUR',
            }]
          : []),
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.reponse },
      })),
    },
  ];

  return (
    <main className="min-h-screen bg-bg">
      <script
        type="application/ld+json"
        // Contenu entièrement construit côté serveur à partir de constantes et
        // de la grille tarifaire : aucune saisie d'utilisateur n'y transite.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
      />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="Accueil Coparentalité Zen"
            className="flex items-center"
          >
            <Image
              src="/logo-complet.png"
              alt="Coparentalité Zen"
              width={180}
              height={80}
              priority
              // Logo rond : à 145 px de large, l'en-tête montait à près de
              // 190 px et repoussait l'accroche sous la ligne de flottaison.
              className="h-auto w-[72px] object-contain sm:w-[96px]"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/connexion"
              className="rounded-xl px-3 py-2 text-sm font-bold text-navy-text"
            >
              Se connecter
            </Link>

            <Link
              href="/inscription"
              className="btn btn-primary px-4"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-12 text-center sm:pt-16">
        <div className="mx-auto max-w-3xl">
          <p className="mx-auto inline-flex rounded-full bg-muted px-4 py-2 text-xs font-bold text-navy-text">
            Fini les « c’est ton week-end ou le mien ? »
          </p>

          {/* Le titre reprend les mots que les parents tapent réellement —
              « garde alternée », « frais des enfants » — plutôt que
              « coparentalité », qui désigne en France un tout autre service
              (voir la page calendrier-garde-alternee). */}
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight text-navy-text sm:text-5xl">
            Le planning de garde alternée et les frais des enfants, clairs pour les deux parents.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-soft sm:text-lg">
            Qui a les enfants ce week-end, qui prend quelle moitié des
            vacances, qui doit combien pour la cantine : tout est au même
            endroit, calculé automatiquement, et chacun voit la même chose
            depuis son téléphone.
          </p>

          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link
              href="/inscription"
              className="btn btn-primary px-6 py-3"
            >
              Créer mon planning gratuit
            </Link>

            {/* Le questionnaire ne demande aucun compte et rend un planning
                tout de suite : c'est la porte d'entrée la moins engageante
                pour qui n'est pas encore prêt à s'inscrire. Le rythme trouvé
                est présélectionné s'il crée son espace ensuite. */}
            <Link
              href="/quiz"
              className="btn btn-ghost px-6 py-3"
            >
              Trouver mon rythme de garde en 1 minute
            </Link>
          </div>

          <p className="mt-3 text-xs text-soft">
            3 mois gratuits · Aucune carte bancaire · Fonctionne même si l’autre parent ne s’inscrit pas
          </p>
        </div>

        {/* Aperçu du produit. Les visiteurs ne voyaient jamais l'application
            avant de s'inscrire ; ce schéma est celui que dessine réellement
            l'application, appliqué à un exemple signalé comme tel. */}
        <figure className="card mx-auto mt-10 max-w-md p-5 text-left">
          <figcaption className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-ink">Une semaine sur deux</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-soft/70">Exemple</span>
          </figcaption>
          <div className="mt-3">
            <SchemaRythme
              schema={schemaDeuxSemaines('alternating_weeks')}
              parent1={{ nom: 'Camille', initiale: 'C', couleur: 'navy' }}
              parent2={{ nom: 'Julien', initiale: 'J', couleur: 'coral' }}
            />
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-soft">Cantine de septembre · Camille</span>
              <span className="font-bold text-ink">86,40 €</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-soft">Montant à régulariser par Julien</span>
              <span className="font-bold text-navy-text">43,20 €</span>
            </div>
          </div>
        </figure>

        <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-bold text-soft">
          {garanties.map((garantie) => (
            <li key={garantie} className="flex items-center gap-1.5">
              <span aria-hidden className="text-ok">✓</span>
              {garantie}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Tout au même endroit
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Moins de messages. Moins d’oublis. Plus de clarté.
            </h2>

            <p className="mt-3 text-soft">
              Les informations importantes ne sont plus dispersées entre les
              SMS, les notes, les calendriers et les tableaux de dépenses.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avantages.map((avantage) => (
              <article
                key={avantage.titre}
                className="card p-5"
              >
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-xl"
                >
                  {avantage.icone}
                </span>

                <h3 className="mt-4 font-display text-lg font-semibold">
                  {avantage.titre}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-soft">
                  {avantage.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="comment-ca-marche" className="scroll-mt-4 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Simple à démarrer
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Votre espace familial en trois étapes
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {etapes.map((etape) => (
              <article
                key={etape.numero}
                className="card p-5"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-sm font-bold text-white">
                  {etape.numero}
                </span>

                <h3 className="mt-4 font-display text-lg font-semibold">
                  {etape.titre}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-soft">
                  {etape.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Maillage interne : les pages thématiques n'étaient liées depuis
          aucune page du site, seul le plan du site les signalait. Les relier
          depuis l'accueil, la page la plus forte, leur transmet son poids et
          offre au visiteur une réponse sans inscription. */}
      <section className="py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Guides gratuits
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Les réponses aux questions de chaque séparation
            </h2>
          </div>

          <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
            <li>
              <Link href="/quiz" className="card flex h-full items-center justify-between gap-3 p-5 font-bold text-navy-text">
                <span>Quel rythme de garde choisir ? Le questionnaire</span>
                <span aria-hidden>→</span>
              </Link>
            </li>
            {PAGES_THEMATIQUES.map((page) => (
              <li key={page.chemin}>
                <Link href={page.chemin} className="card flex h-full items-center justify-between gap-3 p-5 font-bold text-navy-text">
                  <span>{page.libelle}</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Une formule adaptée à votre besoin
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              3 mois gratuits pour commencer, prolongez seulement si nécessaire
            </h2>

            <p className="mt-3 text-soft">
              Votre espace inclut 3 mois de planification gratuite à compter
              de sa création. Pour aller plus loin, choisissez une extension
              ponctuelle ou Zen Plus.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
            <article className="card flex flex-col p-6">
              <div>
                <p className="text-sm font-bold text-soft">
                  3 mois gratuits
                </p>

                <div className="mt-2 flex items-end gap-2">
                  <span className="font-display text-4xl font-semibold">
                    0 €
                  </span>

                  <span className="pb-1 text-sm text-soft">
                    pendant 3 mois, sans engagement
                  </span>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm">
                {fonctionsGratuites.map((fonction) => (
                  <li
                    key={fonction}
                    className="flex items-start gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className="font-bold text-ok"
                    >
                      ✓
                    </span>

                    <span>{fonction}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/inscription"
                className="btn btn-ghost mt-7 w-full"
              >
                Créer mon espace
              </Link>
            </article>

            <article className="card relative flex flex-col border-2 border-navy p-6">
              <div>
                <p className="text-sm font-bold text-navy-text">
                  Coparentalité Zen Plus
                </p>

                {zenPlus ? (
                  <>
                    {/* Le bouton ouvre la formule annuelle : c'est elle qu'on
                        affiche en premier, ramenée au mois, le tarif mensuel
                        restant indiqué juste dessous. */}
                    {zenPlus.prixAnnuelCents > 0 ? (
                      <>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="font-display text-4xl font-semibold">
                            {formatPrix(Math.round(zenPlus.prixAnnuelCents / 12))}
                          </span>

                          <span className="pb-1 text-sm text-soft">
                            par mois, pour tout le foyer
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-soft">
                          Facturé {formatPrix(zenPlus.prixAnnuelCents)} par an
                          {zenPlus.economieAnnuelleCents > 0
                            && ` (${formatPrix(zenPlus.economieAnnuelleCents)} d’économie)`}
                          {`, ou ${formatPrix(zenPlus.prixMensuelCents)} au mois sans engagement.`}
                        </p>
                      </>
                    ) : (
                      <div className="mt-2 flex items-end gap-2">
                        <span className="font-display text-4xl font-semibold">
                          {formatPrix(zenPlus.prixMensuelCents)}
                        </span>

                        <span className="pb-1 text-sm text-soft">
                          par mois
                        </span>
                      </div>
                    )}

                    <p className="mt-2 text-xs font-bold text-navy-text">
                      Un seul abonnement couvre les deux parents.
                    </p>
                  </>
                ) : (
                  /* Grille injoignable : mieux vaut ne rien annoncer qu'un prix
                     qui pourrait ne pas être celui facturé. */
                  <p className="mt-2 text-sm text-soft">
                    Tarif communiqué au lancement.
                  </p>
                )}
              </div>

              <ul className="mt-6 space-y-3 text-sm">
                {(zenPlus?.fonctions.length ? zenPlus.fonctions : fonctionsZenPlus).map((fonction) => (
                  <li
                    key={fonction}
                    className="flex items-start gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className="font-bold text-ok"
                    >
                      ✓
                    </span>

                    <span>{fonction}</span>
                  </li>
                ))}
              </ul>

              <BoutonAchat
                type="abonnement"
                periodicite="year"
                libelle="Choisir Zen Plus"
              />
            </article>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Sans abonnement obligatoire
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Débloquez uniquement les mois dont vous avez besoin
            </h2>

            <p className="mt-3 text-soft">
              Les extensions sont des achats ponctuels. Elles repoussent votre
              limite de planification sans renouvellement automatique.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-2xl gap-4 md:grid-cols-2">
            {extensionsAffichees.map((extension) => (
              <article
                key={extension.duree}
                className={`card relative flex flex-col p-5 ${
                  extension.recommande ? 'border-2 border-navy' : ''
                }`}
              >
                {extension.recommande && (
                  <span className="absolute right-3 top-3 rounded-full bg-muted px-3 py-1 text-xs font-bold text-navy-text">
                    {/* « Le plus choisi » affirmait un fait de vente non constaté :
                        `recommande` est notre conseil, pas une statistique. */}
                    Recommandé
                  </span>
                )}

                <p className="text-sm font-bold text-soft">
                  Extension de calendrier
                </p>

                <h3 className="mt-3 font-display text-2xl font-semibold">
                  {extension.duree}
                </h3>

                <p className="mt-1 text-2xl font-bold text-navy-text">
                  {extension.prix}
                </p>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-soft">
                  {extension.description}
                </p>

                {extension.id ? (
                  <BoutonAchat
                    type="extension"
                    extensionId={extension.id}
                    libelle="Choisir cette extension"
                    variante="ghost"
                  />
                ) : (
                  /* Grille injoignable : mieux vaut aucun bouton qu'un bouton
                     qui ouvrirait un achat sans savoir lequel. */
                  <Link href="/inscription" className="btn btn-ghost mt-5 w-full">
                    Créer mon espace
                  </Link>
                )}
              </article>
            ))}
          </div>

          <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-relaxed text-soft">
            Les paiements sont traités sur la page sécurisée de Stripe. Coparentalité Zen ne conserve aucune donnée bancaire. La souscription s’effectue depuis votre espace après création du foyer.
          </p>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-sm font-bold text-navy-text">
              Questions fréquentes
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Tout ce qu’il faut savoir
            </h2>
          </div>

          <div className="mt-8 space-y-3">
            {faq.map((item) => (
              <details
                key={item.question}
                className="card p-5"
              >
                <summary className="cursor-pointer pr-4 font-bold">
                  {item.question}
                </summary>

                <p className="mt-3 text-sm leading-relaxed text-soft">
                  {item.reponse}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Installer l'application intéresse qui l'utilise déjà ; placé sous
          l'accroche, ce bloc détournait le nouveau visiteur de l'inscription. */}
      <section className="mx-auto max-w-3xl px-5 pt-14"><InstallAppCard permanent /></section>

      <section className="px-5 py-14">
        <div className="mx-auto max-w-3xl rounded-3xl bg-navy px-6 py-10 text-center text-white">
          <h2 className="font-display text-3xl font-semibold">
            Prêt à simplifier votre organisation familiale ?
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/80">
            Créez votre espace, ajoutez vos enfants et retrouvez toutes les
            informations importantes dans une seule application.
          </p>

          <Link
            href="/inscription"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 font-bold text-navy-text"
          >
            Créer mon planning gratuit
          </Link>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-8 text-center">
          <Image
            src="/logo-complet.png"
            alt="Coparentalité Zen"
            width={160}
            height={80}
            className="mx-auto h-auto w-[145px] object-contain"
          />

          <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-soft">
            Coparentalité Zen est un outil d’organisation et de suivi.
            Il ne remplace ni une décision judiciaire, ni une convention
            parentale, ni un conseil juridique professionnel.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-soft">
            <Link href="/confidentialite" className="underline">Politique de confidentialité</Link>
            <Link href="/cgu" className="underline">Conditions générales</Link>
            <Link href="/mentions-legales" className="underline">Mentions légales</Link>
            {PAGES_THEMATIQUES.map((page) => (
              <Link key={page.chemin} href={page.chemin} className="underline">{page.libelle}</Link>
            ))}
            <Link href="/quiz" className="underline">Questionnaire</Link>
            <Link href="/aide" className="underline">Aide</Link>
            <Link href="/contact" className="underline">Contact</Link>
          </div>

          <p className="mt-5 text-xs text-soft">
            © 2026 ParentZenFrance. Tous droits réservés.
          </p>
        </div>
      </footer>
    </main>
  );
}