'use client';

/**
 * Déroulé du questionnaire, une question par écran.
 *
 * Une question à la fois plutôt qu'un formulaire complet : sur un téléphone,
 * une liste de quatre questions donne l'impression d'un dossier à remplir,
 * là où un choix unique se répond au pouce, sans réfléchir à ce qui suit.
 *
 * Rien n'est envoyé nulle part. Les réponses restent dans l'état du
 * composant ; seul le rythme conseillé est mémorisé, pour être présélectionné
 * si la personne crée un foyer ensuite.
 */
import { useState } from 'react';
import Link from 'next/link';
import { SchemaRythme } from '@/components/rythme';
import { modele, schemaDeuxSemaines } from '@/lib/rythmes';
import {
  QUESTIONS, recommander, memoriserRythmeSuggere,
  type Reponses, type CleQuestion,
} from '@/lib/quiz';

/** Les deux parents du schéma, nommés du point de vue de qui répond. */
const MOI = { nom: 'vous', initiale: 'V', couleur: 'navy' };
const AUTRE = { nom: 'l’autre parent', initiale: 'A', couleur: 'coral' };

export function Questionnaire() {
  const [etape, setEtape] = useState(0);
  const [reponses, setReponses] = useState<Partial<Reponses>>({});

  const termine = etape >= QUESTIONS.length;

  function repondre(cle: CleQuestion, valeur: string) {
    const suite = { ...reponses, [cle]: valeur } as Partial<Reponses>;
    setReponses(suite);
    setEtape(etape + 1);
    // Le rythme n'est mémorisé qu'une fois les quatre réponses réunies :
    // une réponse partielle ne désigne rien.
    if (etape + 1 >= QUESTIONS.length) {
      memoriserRythmeSuggere(recommander(suite as Reponses).pattern);
    }
  }

  function recommencer() {
    setReponses({});
    setEtape(0);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 py-8">
      <Link href="/" className="text-sm font-bold text-navy-text underline">
        ← Retour à l’accueil
      </Link>

      {termine
        ? <Resultat reponses={reponses as Reponses} onRecommencer={recommencer} />
        : (
          <Etape
            numero={etape}
            onRepondre={repondre}
            onRetour={etape > 0 ? () => setEtape(etape - 1) : null}
          />
        )}
    </main>
  );
}

function Etape({ numero, onRepondre, onRetour }: {
  numero: number;
  onRepondre: (cle: CleQuestion, valeur: string) => void;
  onRetour: (() => void) | null;
}) {
  const q = QUESTIONS[numero];

  return (
    <section className="mt-5">
      <div className="flex items-center gap-2" aria-hidden>
        {QUESTIONS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= numero ? 'bg-navy' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-soft/70">
        Question {numero + 1} sur {QUESTIONS.length}
      </p>

      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {q.intitule}
      </h1>
      {q.precision && (
        <p className="mt-2 text-sm leading-relaxed text-soft">{q.precision}</p>
      )}

      <div className="mt-5 space-y-3">
        {q.options.map((o) => (
          <button
            key={o.valeur}
            type="button"
            onClick={() => onRepondre(q.cle, o.valeur)}
            className="card w-full p-4 text-left active:scale-[.98]"
          >
            <span className="block font-bold text-ink">{o.libelle}</span>
            {o.detail && (
              <span className="mt-1 block text-sm text-soft">{o.detail}</span>
            )}
          </button>
        ))}
      </div>

      {onRetour && (
        <button
          type="button"
          onClick={onRetour}
          className="mt-5 text-sm font-bold text-soft underline"
        >
          Question précédente
        </button>
      )}
    </section>
  );
}

function Resultat({ reponses, onRecommencer }: {
  reponses: Reponses;
  onRecommencer: () => void;
}) {
  const reco = recommander(reponses);
  const principal = modele(reco.pattern);
  const secondaire = modele(reco.alternative);

  return (
    <section className="mt-5 space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-soft/70">
          Le rythme conseillé
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {principal?.nom}
        </h1>
      </div>

      <article className="card space-y-4 p-5">
        <p className="text-sm leading-relaxed text-soft">{reco.raison}</p>
        <SchemaRythme
          schema={schemaDeuxSemaines(reco.pattern)}
          parent1={MOI}
          parent2={AUTRE}
        />
        <p className="text-xs text-soft/80">
          Deux semaines de planning : <strong>V</strong> pour vous,{' '}
          <strong>A</strong> pour l’autre parent.
        </p>
      </article>

      {secondaire && (
        <article className="card space-y-2 p-5">
          <h2 className="text-base font-bold text-ink">
            À considérer aussi : {secondaire.nom}
          </h2>
          <p className="text-sm leading-relaxed text-soft">
            {reco.raisonAlternative}
          </p>
        </article>
      )}

      <div className="space-y-3">
        <Link href="/inscription" className="btn btn-primary w-full">
          Créer mon planning gratuitement
        </Link>
        <p className="text-center text-xs leading-relaxed text-soft">
          Le rythme conseillé sera déjà sélectionné. Vous pourrez en changer à
          tout moment, et inviter l’autre parent à rejoindre le planning.
        </p>
      </div>

      <button
        type="button"
        onClick={onRecommencer}
        className="w-full text-sm font-bold text-soft underline"
      >
        Refaire le questionnaire
      </button>

      <p className="text-xs leading-relaxed text-soft/80">
        Ce questionnaire est un outil d’organisation. Il ne remplace ni une
        décision de justice, ni une convention parentale, ni l’avis d’un
        professionnel. Si une décision fixe déjà votre rythme de garde, c’est
        elle qui s’applique.
      </p>
    </section>
  );
}
