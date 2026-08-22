'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Aide en libre-service.
 *
 * L'objectif n'est pas de dissuader d'écrire, mais de rendre l'écriture
 * inutile dans les cas où la réponse est connue d'avance. Les trois quarts des
 * difficultés signalées tiennent à des contraintes documentées — une alerte
 * impossible sur iPhone tant que l'application n'est pas installée, une
 * invitation qu'il faut transmettre soi-même. Y répondre en trois lignes vaut
 * mieux qu'un échange de courriels sur deux jours.
 *
 * Ce que cette page ne fait pas : promettre une réponse individuelle rapide.
 * Une promesse non tenue coûte plus cher que l'absence de promesse.
 *
 * Les demandes relevant du RGPD, de la sécurité ou d'un paiement sont
 * délibérément traitées à part : elles ouvrent des obligations légales — un
 * mois pour répondre à une demande d'accès ou d'effacement — et ne peuvent
 * pas être renvoyées vers une page de questions fréquentes.
 */

interface Etape {
  question: string;
  reponse: string;
}

interface Parcours {
  id: string;
  titre: string;
  etapes: Etape[];
}

const PARCOURS: Parcours[] = [
  {
    id: 'invitation',
    titre: 'L’autre parent n’a pas reçu mon invitation',
    etapes: [
      {
        question: 'Avez-vous utilisé le bouton « Copier le message » ?',
        reponse:
          'L’invitation n’est pas envoyée par l’application : c’est vous qui la transmettez. '
          + 'Ouvrez Foyer, appuyez sur « Copier le message », puis collez-le dans un SMS ou une messagerie. '
          + 'Le lien contenu dans ce message est le seul qui fonctionne.',
      },
      {
        question: 'Avez-vous rempli à la fois l’adresse e-mail et le téléphone ?',
        reponse:
          'Les deux modes s’excluent. Une invitation liée à une adresse e-mail ne peut être acceptée '
          + 'que depuis cette adresse, sans code. Une invitation par téléphone fonctionne avec un code '
          + 'à six chiffres. Choisissez l’un ou l’autre, puis créez une nouvelle invitation.',
      },
      {
        question: 'Le lien mène-t-il vers une adresse en .vercel.app ?',
        reponse:
          'Ce lien vient d’une ancienne version installée sur l’écran d’accueil. Supprimez l’application '
          + 'de l’écran d’accueil, rouvrez coparentalitezen.fr dans Safari, réinstallez-la, puis créez '
          + 'une nouvelle invitation.',
      },
    ],
  },
  {
    id: 'alertes',
    titre: 'Je ne reçois pas les alertes',
    etapes: [
      {
        question: 'Sur iPhone, l’application est-elle installée sur l’écran d’accueil ?',
        reponse:
          'Apple n’autorise les alertes que depuis une application installée, sous iOS 16.4 ou plus récent. '
          + 'Depuis Safari, la permission ne peut même pas être demandée. Ouvrez le menu Partager, '
          + 'puis « Sur l’écran d’accueil », et relancez l’application depuis cette icône.',
      },
      {
        question: 'Avez-vous autorisé les alertes dans l’application ?',
        reponse:
          'Ouvrez Plus, puis Notifications, puis Réglages. Si le bouton d’autorisation n’apparaît plus, '
          + 'c’est que la permission a été refusée une fois : il faut la rétablir dans les réglages du '
          + 'téléphone, à la ligne Coparentalité Zen.',
      },
      {
        question: 'Attendez-vous une alerte par courriel ?',
        reponse:
          'Les courriels de notification partent une fois par jour, tôt le matin. Une alerte créée '
          + 'aujourd’hui à midi ne partira donc pas avant le lendemain. Les alertes immédiates passent '
          + 'par les notifications du téléphone.',
      },
    ],
  },
  {
    id: 'connexion',
    titre: 'Je n’arrive pas à me connecter',
    etapes: [
      {
        question: 'Avez-vous validé le lien reçu à la création du compte ?',
        reponse:
          'Un compte reste inactif tant que l’adresse n’a pas été confirmée. Cherchez le message de '
          + 'confirmation, y compris dans les indésirables, et ouvrez le lien qu’il contient.',
      },
      {
        question: 'Le mot de passe est-il refusé ?',
        reponse:
          'Utilisez « Mot de passe oublié » sur l’écran de connexion. Un lien de réinitialisation part '
          + 'immédiatement. Ne communiquez jamais votre mot de passe, à personne, y compris à nous.',
      },
    ],
  },
  {
    id: 'planning',
    titre: 'Mon planning de garde n’affiche pas ce que j’attends',
    etapes: [
      {
        question: 'Le rythme de départ est-il correctement réglé ?',
        reponse:
          'Ouvrez Plus, puis le réglage du rythme. Trois éléments comptent : le type de rythme, la date '
          + 'de début, et le parent qui a les enfants ce jour-là. Une date de début décalée d’une semaine '
          + 'inverse tout le calendrier.',
      },
      {
        question: 'S’agit-il d’un changement ponctuel ?',
        reponse:
          'N’ajustez pas le rythme habituel pour un week-end échangé : passez par Exceptions. '
          + 'Le rythme reprend ensuite tout seul, sans dérive.',
      },
    ],
  },
];

const QUESTIONS: Etape[] = [
  {
    question: 'Comment fonctionne l’application ?',
    reponse:
      'Vous créez un foyer, vous y ajoutez vos enfants, vous réglez votre rythme de garde habituel, '
      + 'puis vous invitez l’autre parent. Chacun consulte ensuite les mêmes informations depuis son '
      + 'propre compte : planning, changements ponctuels, vacances, dépenses partagées et rendez-vous.',
  },
  {
    question: 'Combien coûte Coparentalité Zen ?',
    reponse:
      'La création de votre espace comprend 3 mois gratuits pour organiser le planning et suivre les '
      + 'dépenses. Au-delà, vous choisissez une extension ponctuelle ou l’abonnement Zen Plus. Les tarifs en vigueur sont affichés sur la page '
      + 'd’accueil et dans l’écran Offre ; aucun prélèvement n’a lieu sans un abonnement souscrit '
      + 'explicitement.',
  },
  {
    question: 'Mes données sont-elles sécurisées ?',
    reponse:
      'Les données sont hébergées dans l’Union européenne et cloisonnées par foyer : un compte ne peut '
      + 'lire que les informations des foyers dont il est membre, et cette règle est appliquée par la '
      + 'base de données elle-même, pas seulement par l’application. Le détail figure dans la politique '
      + 'de confidentialité.',
  },
  {
    question: 'Comment créer un calendrier de garde ?',
    reponse:
      'Depuis Plus, choisissez votre rythme — une semaine sur deux, 2-2-3, 3-4-4-3 ou un cycle libre — '
      + 'indiquez la date de début et le parent qui commence. Le calendrier se remplit ensuite tout seul, '
      + 'et les changements ponctuels s’ajoutent par Exceptions sans le dérégler.',
  },
  {
    question: 'Comment signaler un problème technique ?',
    reponse:
      'Suivez d’abord le diagnostic ci-dessus : il couvre les difficultés les plus fréquentes. '
      + 'S’il ne résout rien, engendrez un code d’incident au bas de cette page et joignez-le à votre '
      + 'message. Ce code nous évite les allers-retours de questions préalables.',
  },
  {
    question: 'Comment supprimer mon compte et mes données ?',
    reponse:
      'Ouvrez Plus, puis Confidentialité : la suppression s’y demande directement, et met fin à un '
      + 'éventuel abonnement en cours. L’opération est définitive. Vous pouvez exporter vos données '
      + 'depuis le même écran avant de la lancer.',
  },
];

/** Code court, lisible au téléphone, sans rien qui identifie la personne. */
function engendrerCode(): string {
  const d = new Date();
  const jour = [
    d.getFullYear() % 100,
    d.getMonth() + 1,
    d.getDate(),
  ].map((n) => String(n).padStart(2, '0')).join('');
  const alea = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CZ-${jour}-${alea}`;
}

function Depliant({ titre, children }: { titre: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="border-b border-black/5 last:border-0">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-bold text-ink"
      >
        <span>{titre}</span>
        <span aria-hidden className="text-soft">{ouvert ? '−' : '+'}</span>
      </button>
      {ouvert && <div className="pb-4 text-sm leading-relaxed text-soft">{children}</div>}
    </div>
  );
}

export function Aide({ courriel }: { courriel: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  async function copier() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-8">
      <Link href="/" className="text-sm font-bold text-navy-text underline">← Retour à l’accueil</Link>

      <header className="card mt-5 space-y-2 p-5 sm:p-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Aide</h1>
        <p className="text-sm leading-relaxed text-soft">
          Commencez par le diagnostic : il couvre les difficultés les plus souvent signalées.
          Cette page est mise à jour à mesure que de nouveaux cas apparaissent.
        </p>
      </header>

      <section className="card mt-4 space-y-1 p-5 sm:p-7">
        <h2 className="mb-2 font-display text-xl font-semibold">Diagnostic guidé</h2>
        {PARCOURS.map((p) => (
          <Depliant key={p.id} titre={p.titre}>
            <ol className="space-y-3">
              {p.etapes.map((e, i) => (
                <li key={e.question}>
                  <p className="font-bold text-ink">{i + 1}. {e.question}</p>
                  <p className="mt-1">{e.reponse}</p>
                </li>
              ))}
            </ol>
          </Depliant>
        ))}
      </section>

      <section className="card mt-4 space-y-1 p-5 sm:p-7">
        <h2 className="mb-2 font-display text-xl font-semibold">Questions fréquentes</h2>
        {QUESTIONS.map((q) => (
          <Depliant key={q.question} titre={q.question}>
            <p>{q.reponse}</p>
          </Depliant>
        ))}
      </section>

      <section className="card mt-4 space-y-3 p-5 sm:p-7">
        <h2 className="font-display text-xl font-semibold">Le diagnostic n’a rien résolu</h2>
        <p className="text-sm leading-relaxed text-soft">
          Engendrez un code d’incident et joignez-le à votre message, avec l’écran concerné,
          l’heure approximative et la version affichée en bas de l’écran Plus. Ce code n’est
          lié à aucune donnée personnelle.
        </p>
        {code ? (
          <div className="rounded-2xl bg-muted p-4 text-center">
            <p className="font-display text-2xl font-semibold tracking-widest">{code}</p>
            <button type="button" onClick={copier} className="btn btn-ghost mt-3 w-full">
              {copie ? 'Code copié' : 'Copier le code'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setCode(engendrerCode())} className="btn btn-primary w-full">
            Engendrer un code d’incident
          </button>
        )}
        <p className="text-xs leading-relaxed text-soft">
          Les signalements techniques sont dépouillés régulièrement et corrigés par ordre de gravité.
          Aucune réponse individuelle n’est garantie : quand un problème est corrigé, il l’est pour
          tout le monde, sans que chacun ait à écrire.
        </p>
      </section>

      <section className="card mt-4 space-y-3 p-5 sm:p-7">
        <h2 className="font-display text-xl font-semibold">Données personnelles, sécurité, paiement</h2>
        <p className="text-sm leading-relaxed text-soft">
          Ces trois sujets ne passent pas par le diagnostic ci-dessus. Une demande d’accès, de
          rectification ou d’effacement de vos données, le signalement d’une faille, ou une
          difficulté de paiement s’adressent directement à{' '}
          <a className="font-bold underline" href={`mailto:${courriel}`}>{courriel}</a>.
        </p>
        <p className="text-xs leading-relaxed text-soft">
          Ces demandes reçoivent une réponse dans le délai prévu par la réglementation, soit un mois
          au plus pour une demande relative à vos données. N’y joignez jamais de mot de passe ni de
          coordonnées bancaires.
        </p>
      </section>

      <p className="mt-6 text-center text-xs text-soft">
        Coparentalité Zen n’est pas un service d’urgence. En cas de danger immédiat, contactez les
        services d’urgence compétents.
      </p>
    </main>
  );
}
