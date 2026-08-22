'use client';

/**
 * Rapport mensuel : planning et dépenses, sur une page.
 *
 * Destiné à sortir de l'application — un médiateur, un avocat, parfois un
 * juge. D'où le parti pris : une page sobre, datée, sans couleur décorative,
 * qui s'imprime telle quelle.
 *
 * POURQUOI PAS UNE BIBLIOTHÈQUE PDF
 * iOS convertit n'importe quelle page en PDF depuis le menu Partager, avec
 * une meilleure typographie que ce qu'un générateur embarqué produirait. Une
 * bibliothèque de rendu ajouterait plusieurs mégaoctets à chaque déploiement
 * et un mode d'échec de plus en production, pour un résultat inférieur. Les
 * styles d'impression ci-dessous font le travail.
 */
import { useCallback, useEffect, useState } from 'react';
import { useContexte } from '@/lib/use-contexte';
import {
  getRegleGarde, listerExceptions, listerDepenses,
} from '@/lib/actions';
import { buildDayMap, type DayAssignment } from '@/lib/custody';
import { formatCents } from '@/lib/money';
import {
  synthetiser, bornesDuMois, moisDisponibles, nomDuMois,
  type SyntheseMensuelle, type DepenseSynthese,
} from '@/lib/rapport';
import { BottomNav } from '@/components/ui';
import { Chargement } from '@/components/etats';

function jourDe(iso: string) { return iso.slice(0, 10); }

export default function RapportPage() {
  const { ctx } = useContexte();
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [synthese, setSynthese] = useState<SyntheseMensuelle | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const foyerId = ctx.etat === 'pret' ? ctx.contexte.foyer.id : null;
  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const nomDe = (id: string) =>
    membres.find((m) => m.profileId === id)?.nom ?? 'Parent';

  const construire = useCallback(async (hid: string, moisVise: string) => {
    setChargement(true); setErreur(null);
    const { debut, fin } = bornesDuMois(moisVise);

    const [regle, exceptions, depenses] = await Promise.all([
      getRegleGarde(hid), listerExceptions(hid, debut, fin), listerDepenses(hid),
    ]);

    if (depenses.status !== 'ok') {
      // 'demo' comme 'error' : sans données réelles, un rapport n'a pas de
      // sens et vaut mieux qu'un document vide qu'on croirait exact.
      setChargement(false);
      setErreur(depenses.status === 'error'
        ? depenses.message
        : 'Les dépenses ne sont pas disponibles dans ce mode.');
      return;
    }

    // Sans rythme défini, le planning est vide : le rapport porte alors sur
    // les seules dépenses, ce qui reste utile et vaut mieux qu'une erreur.
    let jours: DayAssignment[] = [];
    if (regle.status === 'ok' && regle.data) {
      const r = regle.data;
      const ponctuels = exceptions.status === 'ok'
        ? exceptions.data.map((e) => ({
          startsOn: jourDe(e.debut), endsOn: jourDe(e.fin),
          parentId: e.parentId, source: e.type, priorite: e.priorite,
        }))
        : [];
      try {
        const carte = buildDayMap(
          {
            pattern: r.pattern, startDate: r.startDate,
            parent1: r.parent1, parent2: r.parent2,
            changeoverDay: r.handoverDay,
            customCycle: r.customCycle ?? undefined,
          },
          r.startDate < debut ? r.startDate : debut,
          fin, [], ponctuels,
        );
        jours = [...carte.values()];
      } catch {
        // Une règle incohérente ne doit pas emporter le rapport entier.
        jours = [];
      }
    }

    const pourSynthese: DepenseSynthese[] = depenses.data.map((d): DepenseSynthese => ({
      id: d.id, titre: d.titre, date: d.date, montantCents: d.montantCents,
      payePar: d.payePar, statut: d.statut, categorie: d.categorie,
      parts: d.parts.map((p) => ({
        profileId: p.parentId as string, montantCents: p.owedCents,
      })),
    }));

    setSynthese(synthetiser(
      moisVise, jours, pourSynthese, membres.map((m) => m.profileId),
    ));
    setChargement(false);
  // membres provient du contexte et ne change pas d'un rendu à l'autre une
  // fois le foyer chargé ; le lier ici relancerait la construction en boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membres.length]);

  useEffect(() => {
    if (foyerId) construire(foyerId, mois);
  }, [foyerId, mois, construire]);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 pb-28 pt-6 print:max-w-none print:px-0 print:pb-0">
      <style>{`
        @media print {
          /* Ce qui n'appartient pas au document : navigation et commandes. */
          .sans-impression { display: none !important; }
          .card { border: 1px solid #ddd !important; box-shadow: none !important; }
          @page { margin: 16mm; }
        }
      `}</style>

      <div className="sans-impression">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Rapport mensuel
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-soft">
          Planning et dépenses du mois, sur une page à conserver ou à
          transmettre.
        </p>

        <label className="mt-5 block text-sm font-bold text-ink" htmlFor="mois">
          Mois
        </label>
        <select id="mois" value={mois} onChange={(e) => setMois(e.target.value)}>
          {moisDisponibles(new Date()).map((m) => (
            <option key={m} value={m}>{nomDuMois(m)}</option>
          ))}
        </select>

        <button type="button" className="btn btn-primary mt-3 w-full"
                onClick={() => window.print()}>
          Enregistrer en PDF
        </button>
        <p className="mt-2 text-xs leading-relaxed text-soft">
          Sur iPhone, choisissez « Options » puis « Enregistrer dans Fichiers »
          pour obtenir un PDF.
        </p>

        {erreur && (
          <p className="mt-4 rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
            {erreur}
          </p>
        )}
      </div>

      {chargement && <div className="mt-5"><Chargement /></div>}

      {!chargement && synthese && (
        <article className="mt-6 space-y-5">
          <header>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {nomDuMois(synthese.mois)}
            </h2>
            <p className="mt-0.5 text-[13px] text-soft">
              Coparentalité Zen · document établi le{' '}
              {new Date().toLocaleDateString('fr-FR')}
            </p>
          </header>

          <section className="card space-y-3 p-4">
            <h3 className="text-base font-bold text-ink">Répartition de la garde</h3>
            {synthese.joursCouverts === 0 ? (
              <p className="text-sm text-soft">
                Aucun rythme de garde défini sur cette période.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {synthese.parents.map((p) => (
                  <li key={p.profileId} className="flex justify-between text-sm">
                    <span className="text-ink">{nomDe(p.profileId)}</span>
                    <span className="font-bold text-ink">
                      {p.jours} jour{p.jours > 1 ? 's' : ''} · {p.pourcentJours} %
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-3 p-4">
            <h3 className="text-base font-bold text-ink">Dépenses</h3>

            {synthese.depenses.length === 0 ? (
              <p className="text-sm text-soft">Aucune dépense enregistrée ce mois-ci.</p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {synthese.depenses.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 text-ink">
                        <span className="block truncate">{d.titre}</span>
                        <span className="text-[12px] text-soft">
                          {new Date(`${d.date}T12:00:00`).toLocaleDateString('fr-FR')}
                          {' · '}{nomDe(d.payePar)}
                          {d.categorie && ` · ${d.categorie}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-ink">
                        {formatCents(d.montantCents)}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="flex justify-between border-t border-line pt-2 text-sm font-bold text-ink">
                  <span>Total</span>
                  <span>{formatCents(synthese.totalCents)}</span>
                </p>

                {synthese.enAttente > 0 && (
                  <p className="text-[13px] text-wait">
                    {synthese.enAttente} dépense{synthese.enAttente > 1 ? 's' : ''} non
                    encore validée{synthese.enAttente > 1 ? 's' : ''} par les deux parents.
                  </p>
                )}
              </>
            )}
          </section>

          {synthese.depenses.length > 0 && (
            <section className="card space-y-3 p-4">
              <h3 className="text-base font-bold text-ink">Solde du mois</h3>
              <ul className="space-y-1.5">
                {synthese.parents.map((p) => (
                  <li key={p.profileId} className="flex justify-between text-sm">
                    <span className="text-ink">{nomDe(p.profileId)}</span>
                    <span className="text-soft">
                      avancé {formatCents(p.avanceCents)} · dû {formatCents(p.duCents)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line pt-2 text-sm font-bold text-ink">
                {synthese.soldeCents === 0
                  ? 'Les comptes du mois sont équilibrés.'
                  : synthese.soldeCents > 0
                    ? `${nomDe(synthese.parents[1]?.profileId ?? '')} doit ${formatCents(synthese.soldeCents)} à ${nomDe(synthese.parents[0]?.profileId ?? '')}.`
                    : `${nomDe(synthese.parents[0]?.profileId ?? '')} doit ${formatCents(-synthese.soldeCents)} à ${nomDe(synthese.parents[1]?.profileId ?? '')}.`}
              </p>
              <p className="text-[12px] leading-relaxed text-soft">
                Solde propre au mois affiché, hors remboursements déjà effectués.
                Il ne remplace pas le solde courant de l’application.
              </p>
            </section>
          )}
        </article>
      )}

      <div className="sans-impression"><BottomNav active="plus" /></div>
    </main>
  );
}
