import Image from 'next/image';
import Link from 'next/link';
import { lireGrilleTarifaire, lireGrilleExtensions, formatPrix } from '@/lib/tarifs';

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
    titre: 'Un espace commun pour les deux parents',
    description:
      'Invitez l’autre parent afin que chacun consulte les mêmes informations depuis son propre compte.',
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
    titre: 'Invitez l’autre parent',
    description:
      'Chaque parent accède au même planning et aux mêmes dépenses.',
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
  'Planification jusqu’à 3 mois à l’avance',
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
    duree: '+1 mois',
    prix: '0,99 €',
    description: 'Pour préparer une période ponctuelle un peu plus éloignée.',
  },
  {
    duree: '+6 mois',
    prix: '3,99 €',
    description: 'Idéal pour organiser les prochaines vacances et la rentrée.',
    recommande: true,
  },
  {
    duree: '+12 mois',
    prix: '5,99 €',
    description: 'Pour préparer sereinement une année complète.',
  },
];

const faq = [
  {
    question: 'Que signifie la limite de trois mois ?',
    reponse:
      'La formule gratuite permet d’ajouter et de modifier des événements jusqu’à trois mois dans le futur. Votre historique reste consultable et vos données ne sont pas supprimées.',
  },
  {
    question: 'Que se passe-t-il lorsque j’atteins la limite ?',
    reponse:
      'Vous pouvez continuer à utiliser l’application, consulter votre planning et gérer vos dépenses courantes. Pour planifier plus loin, vous pourrez acheter une extension ou choisir Zen Plus.',
  },
  {
    question: 'L’achat d’une extension est-il un abonnement ?',
    reponse:
      'Non. Une extension est un achat ponctuel qui repousse votre limite de planification. Elle ne se renouvelle pas automatiquement.',
  },
  {
    question: 'Puis-je utiliser Coparentalité Zen sans l’autre parent ?',
    reponse:
      'Oui. Vous pouvez créer votre espace et l’utiliser seul. Vous pourrez inviter l’autre parent lorsque vous le souhaitez.',
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
        duree: e.libelle,
        prix: formatPrix(e.prixCents),
        description: e.description ?? '',
        recommande: e.recommande,
      }))
    : extensions;
  return (
    <main className="min-h-screen bg-bg">
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
              className="h-auto w-[145px] object-contain sm:w-[170px]"
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
            Planning partagé et dépenses de coparentalité
          </p>

          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight text-navy-text sm:text-5xl">
            Une coparentalité mieux organisée, pour un quotidien plus serein.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-soft sm:text-lg">
            Coparentalité Zen réunit le planning de garde, les vacances,
            les changements ponctuels et les dépenses liées aux enfants dans
            un espace simple partagé entre les deux parents.
          </p>

          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link
              href="/inscription"
              className="btn btn-primary px-6 py-3"
            >
              Créer mon espace gratuitement
            </Link>

            <Link
              href="/app/accueil"
              className="btn btn-ghost px-6 py-3"
            >
              Voir la démonstration
            </Link>
          </div>

          <p className="mt-3 text-xs text-soft">
            Aucun paiement demandé pour commencer.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-2">
          <div className="card p-3">
            <p className="text-xl font-bold text-navy-text">1</p>
            <p className="mt-1 text-xs text-soft">planning commun</p>
          </div>

          <div className="card p-3">
            <p className="text-xl font-bold text-navy-text">2</p>
            <p className="mt-1 text-xs text-soft">parents connectés</p>
          </div>

          <div className="card p-3">
            <p className="text-xl font-bold text-navy-text">3 mois</p>
            <p className="mt-1 text-xs text-soft">offerts à l’avance</p>
          </div>
        </div>
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

      <section className="py-14">
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

      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-navy-text">
              Une formule adaptée à votre besoin
            </p>

            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Commencez gratuitement, prolongez seulement si nécessaire
            </h2>

            <p className="mt-3 text-soft">
              La formule gratuite permet de planifier jusqu’à trois mois dans
              le futur. Pour aller plus loin, choisissez une extension
              ponctuelle ou Zen Plus.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
            <article className="card flex flex-col p-6">
              <div>
                <p className="text-sm font-bold text-soft">
                  Formule gratuite
                </p>

                <div className="mt-2 flex items-end gap-2">
                  <span className="font-display text-4xl font-semibold">
                    0 €
                  </span>

                  <span className="pb-1 text-sm text-soft">
                    sans engagement
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
                Créer mon espace gratuitement
              </Link>
            </article>

            <article className="card relative flex flex-col border-2 border-navy p-6">
              <span className="absolute right-4 top-4 rounded-full bg-muted px-3 py-1 text-xs font-bold text-navy-text">
                Bientôt disponible
              </span>

              <div>
                <p className="text-sm font-bold text-navy-text">
                  Coparentalité Zen Plus
                </p>

                {zenPlus ? (
                  <>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="font-display text-4xl font-semibold">
                        {formatPrix(zenPlus.prixMensuelCents)}
                      </span>

                      <span className="pb-1 text-sm text-soft">
                        par mois
                      </span>
                    </div>

                    {zenPlus.prixAnnuelCents > 0 && (
                      <p className="mt-1 text-xs text-soft">
                        ou {formatPrix(zenPlus.prixAnnuelCents)} par an
                        {zenPlus.economieAnnuelleCents > 0
                          && ` — ${formatPrix(zenPlus.economieAnnuelleCents)} d’économie`}
                      </p>
                    )}
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

              <button
                type="button"
                disabled
                className="btn btn-primary mt-7 w-full opacity-70"
              >
                Zen Plus bientôt disponible
              </button>
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

          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
            {extensionsAffichees.map((extension) => (
              <article
                key={extension.duree}
                className={`card relative flex flex-col p-5 ${
                  extension.recommande ? 'border-2 border-navy' : ''
                }`}
              >
                {extension.recommande && (
                  <span className="absolute right-3 top-3 rounded-full bg-muted px-3 py-1 text-xs font-bold text-navy-text">
                    Le plus choisi
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

                <button
                  type="button"
                  disabled
                  className="btn btn-ghost mt-5 w-full opacity-70"
                >
                  Bientôt disponible
                </button>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-relaxed text-soft">
            Les tarifs et les paiements seront activés après la finalisation
            du système de paiement sécurisé. Aucun achat n’est actuellement
            possible depuis cette page.
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
            Commencer gratuitement
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
            <span>Politique de confidentialité</span>
            <span>Conditions générales</span>
            <span>Mentions légales</span>
            <span>Contact</span>
          </div>

          <p className="mt-5 text-xs text-soft">
            © 2026 ParentZenFrance. Tous droits réservés.
          </p>
        </div>
      </footer>
    </main>
  );
}