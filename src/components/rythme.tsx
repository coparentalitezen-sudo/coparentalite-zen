'use client';

/**
 * Schéma d'un rythme de garde sur deux semaines.
 *
 * Un parent doit voir en un coup d'œil ce que le rythme signifie, sans lire
 * une définition. Le schéma reprend les couleurs des deux parents, avec leurs
 * initiales — jamais la couleur seule, qui exclurait les personnes daltoniennes.
 */
import { JOURS_COURTS } from '@/lib/rythmes';

interface Props {
  /** Répartition, un élément par jour, à partir d'un lundi. */
  schema: ('P1' | 'P2')[];
  /** Initiales et noms des deux parents, pour la lisibilité. */
  parent1: { nom: string; initiale: string; couleur?: string };
  parent2: { nom: string; initiale: string; couleur?: string };
  /** Compact : une seule semaine, pour les listes. */
  semaines?: 1 | 2;
}

export function SchemaRythme({ schema, parent1, parent2, semaines = 2 }: Props) {
  const jours = schema.slice(0, semaines * 7);
  const p1Coral = parent1.couleur === 'coral';

  const styleDe = (qui: 'P1' | 'P2') => {
    const coral = qui === 'P1' ? p1Coral : !p1Coral;
    return coral ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text';
  };
  const initiale = (qui: 'P1' | 'P2') =>
    qui === 'P1' ? parent1.initiale : parent2.initiale;

  return (
    <div
      role="img"
      aria-label={
        `Sur ${semaines === 1 ? 'une semaine' : 'deux semaines'} : `
        + jours.map((q, i) =>
            `${['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'][i % 7]} `
            + `chez ${q === 'P1' ? parent1.nom : parent2.nom}`)
          .join(', ')
      }
    >
      {Array.from({ length: semaines }, (_, s) => (
        <div key={s} className={s > 0 ? 'mt-1.5' : ''}>
          {s === 0 && (
            <div className="mb-1 grid grid-cols-7 gap-1">
              {JOURS_COURTS.map((j, i) => (
                <span key={i} aria-hidden
                  className="text-center text-[10px] font-bold text-soft/70">
                  {j}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {jours.slice(s * 7, s * 7 + 7).map((q, i) => (
              <span key={i} aria-hidden
                className={`grid h-7 place-items-center rounded-md text-[11px] font-black ${styleDe(q)}`}>
                {initiale(q)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Grille de saisie d'un cycle personnalisé : chaque jour bascule d'un parent
 * à l'autre au toucher.
 */
export function GrilleCycle({
  cycle, onChange, parent1, parent2,
}: {
  cycle: ('P1' | 'P2')[];
  onChange: (cycle: ('P1' | 'P2')[]) => void;
  parent1: { nom: string; initiale: string; couleur?: string };
  parent2: { nom: string; initiale: string; couleur?: string };
}) {
  const p1Coral = parent1.couleur === 'coral';
  const semaines = Math.ceil(cycle.length / 7);

  const basculer = (index: number) => {
    const suivant = [...cycle];
    suivant[index] = suivant[index] === 'P1' ? 'P2' : 'P1';
    onChange(suivant);
  };

  const styleDe = (qui: 'P1' | 'P2') => {
    const coral = qui === 'P1' ? p1Coral : !p1Coral;
    return coral ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text';
  };

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {JOURS_COURTS.map((j, i) => (
          <span key={i} aria-hidden className="text-center text-[10px] font-bold text-soft/70">
            {j}
          </span>
        ))}
      </div>
      {Array.from({ length: semaines }, (_, s) => (
        <div key={s} className="mb-1.5">
          <div className="grid grid-cols-7 gap-1">
            {cycle.slice(s * 7, s * 7 + 7).map((q, i) => {
              const index = s * 7 + i;
              const parent = q === 'P1' ? parent1 : parent2;
              const jour = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'][i];
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => basculer(index)}
                  aria-label={`Semaine ${s + 1}, ${jour} : chez ${parent.nom}. Toucher pour changer.`}
                  className={`grid h-11 place-items-center rounded-lg text-[13px] font-black transition-colors ${styleDe(q)}`}
                >
                  {parent.initiale}
                </button>
              );
            })}
          </div>
          {semaines > 1 && (
            <p className="mt-0.5 text-center text-[10px] text-soft/70">Semaine {s + 1}</p>
          )}
        </div>
      ))}
    </div>
  );
}
