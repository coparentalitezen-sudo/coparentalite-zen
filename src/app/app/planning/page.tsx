'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { BandeauHorizon, dansHorizon } from '@/components/premium';
import { useContexte } from '@/lib/use-contexte';
import {
  getRegleGarde, listerExceptions, getOffre, listerVacances, listerRendezVous,
  listerCreneauxFoyer,
  type RegleGarde, type ExceptionGarde, type Offre, type VacancesScolaires,
  type RendezVous, type CreneauFoyer,
} from '@/lib/actions';
import { buildDayMap, journeesPartagees, addDays, isoWeek, dernierJourTenu,
  type Source, type ExceptionOverride, type JourneePartagee } from '@/lib/custody';
import { anneeScolaireDe, semaineAbDe } from '@/lib/scolarite/edt';
import { estJourFerie } from '@/lib/scolarite/jours-feries';

const MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre'];

const jourDe = (iso: string) => iso.slice(0, 10);

/** Heure locale d'un horodatage, au format HH:MM. */
function heureDe(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function heureCourte(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function dateHeure(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heureCourte(iso)}`;
}

function ContenuPlanning() {
  const { ctx, recharger } = useContexte();
  const [regle, setRegle] = useState<RegleGarde | null | 'inconnu'>('inconnu');
  const [exceptions, setExceptions] = useState<ExceptionGarde[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decalage, setDecalage] = useState(0);
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const [offre, setOffre] = useState<Offre | null>(null);
  const [vacances, setVacances] = useState<VacancesScolaires[]>([]);
  const [erreurExceptions, setErreurExceptions] = useState<string | null>(null);
  const [partagees, setPartagees] = useState<Map<string, JourneePartagee>>(new Map());
  const [rendezVous, setRendezVous] = useState<RendezVous[]>([]);
  const [creneauxScolaires, setCreneauxScolaires] = useState<CreneauFoyer[]>([]);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const today = new Date().toISOString().slice(0, 10);

  const { premierJour, nbJours, titre, dernierJour } = useMemo(() => {
    const base = new Date();
    const d = new Date(Date.UTC(base.getFullYear(), base.getMonth() + decalage, 1));
    const annee = d.getUTCFullYear(); const mois = d.getUTCMonth();
    const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    const premier = `${annee}-${String(mois + 1).padStart(2, '0')}-01`;
    return { premierJour: premier, nbJours: nb, titre: `${MOIS[mois]} ${annee}`,
             dernierJour: addDays(premier, nb - 1) };
  }, [decalage]);

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    getRegleGarde(hid).then((r) => {
      if (r.status === 'ok') setRegle(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
    listerExceptions(hid, premierJour, dernierJour).then((r) => {
      if (r.status === 'ok') { setExceptions(r.data); setErreurExceptions(null); }
      // Une erreur ici ne doit pas vider le planning : le rythme de garde
      // reste calculable, et c'est l'information la plus utile à l'écran.
      else if (r.status === 'error') {
        setExceptions([]);
        setErreurExceptions(r.details ? `${r.message} (${r.details})` : r.message);
      }
    });
    getOffre(hid).then((r) => { if (r.status === 'ok') setOffre(r.data); });
    listerVacances(hid, premierJour, dernierJour).then((r) => {
      if (r.status === 'ok') setVacances(r.data);
    });
    // Les rendez-vous se superposent au planning : ils ne modifient jamais la
    // garde, un échec de chargement ne doit donc rien vider.
    listerRendezVous(hid, premierJour, dernierJour).then((r) => {
      if (r.status === 'ok') setRendezVous(r.data);
    });
    // Emploi du temps scolaire : superposition informative uniquement — une
    // absence de données ici (offre non premium, rien d'importé) ne doit
    // jamais dégrader le reste du planning.
    listerCreneauxFoyer(hid, anneeScolaireDe(new Date())).then((r) => {
      if (r.status === 'ok') setCreneauxScolaires(r.data);
    });
  }, [ctx, premierJour, dernierJour]);

  useEffect(charger, [charger]);

  /** Carte des jours : rythme, changements ponctuels, puis vacances. */
  const parJour = useMemo(() => {
    if (!regle || regle === 'inconnu' || !regle.parent2) {
      return new Map<string, { parentId: string; source: Source }>();
    }
    // Toutes les exceptions empruntent le même canal : leur priorité, définie
    // en base, décide seule de l'ordre d'application. Le planning n'a plus à
    // distinguer les vacances des autres types.
    const ponctuels: ExceptionOverride[] = exceptions.map((e) => ({
      startsOn: jourDe(e.debut),
      // Une période qui s'achève à 14 h ne tient pas la nuit : ce jour-là
      // revient à qui prend le relais, la matinée restant signalée par
      // l'heure de passage.
      endsOn: dernierJourTenu(jourDe(e.debut), jourDe(e.fin), heureDe(e.fin)),
      parentId: e.parentId,
      source: e.type,
      priorite: e.priorite,
    }));
    try {
      const m = buildDayMap(
        {
          pattern: regle.pattern, startDate: regle.startDate,
          parent1: regle.parent1, parent2: regle.parent2,
          changeoverDay: regle.handoverDay,
          customCycle: regle.customCycle ?? undefined,
        },
        regle.startDate < premierJour ? regle.startDate : premierJour,
        dernierJour, [], ponctuels,
      );
      // Chaque période peut imposer son heure : celle des vacances prime sur
      // l'heure habituelle du rythme, le jour où elle commence ou s'achève.
      const heuresParticulieres = new Map<string, string>();
      for (const e of exceptions) {
        const hDebut = heureDe(e.debut);
        const hFin = heureDe(e.fin);
        // Minuit ou fin de journée : l'utilisateur n'a pas précisé d'heure
        if (hDebut && hDebut !== '00:00') heuresParticulieres.set(jourDe(e.debut), hDebut);
        // L'heure de fin nomme déjà le moment exact du retour : c'est ce
        // jour-là que la case se coupe en deux, et non le lendemain.
        if (hFin && hFin !== '23:59' && hFin !== '00:00') {
          heuresParticulieres.set(jourDe(e.fin), hFin);
        }
      }
      setPartagees(journeesPartagees(m, regle.handoverTime, heuresParticulieres));
      const out = new Map<string, { parentId: string; source: Source }>();
      for (const [d, a] of m) out.set(d, { parentId: a.parentId, source: a.source });
      return out;
    } catch {
      return new Map<string, { parentId: string; source: Source }>();
    }
  }, [regle, exceptions, premierJour, dernierJour]);

  /** Jours couverts par une période de vacances scolaires officielle. */
  const joursVacances = useMemo(() => {
    const set = new Set<string>();
    for (const v of vacances) {
      for (let t = new Date(v.debut + 'T12:00:00').getTime();
           t <= new Date(v.fin + 'T12:00:00').getTime();
           t += 86400000) {
        set.add(new Date(t).toISOString().slice(0, 10));
      }
    }
    return set;
  }, [vacances]);

  const vacancesDuJour = (jour: string) =>
    vacances.filter((v) => v.debut <= jour && jour <= v.fin);

  const rdvDuJour = (jour: string) =>
    rendezVous.filter((r) => r.debut.slice(0, 10) === jour);

  /**
   * Créneaux scolaires d'un jour donné. Jamais affichés pendant les vacances
   * ou un jour férié (ÉTAPE 5) — un créneau porteur d'une semaine A/B dont la
   * configuration est incomplète est masqué plutôt que deviné.
   */
  const creneauxDuJour = useCallback((jour: string): CreneauFoyer[] => {
    if (joursVacances.has(jour) || estJourFerie(jour)) return [];
    const js = new Date(`${jour}T12:00:00Z`).getUTCDay();
    if (js < 1 || js > 5) return [];
    return creneauxScolaires.filter((c) => {
      if (c.jourSemaine !== js) return false;
      if (!c.semaineAb) return true;
      if (!c.semaineAbActive || !c.dateAncrageSemaineA) return false;
      return semaineAbDe(jour, c.dateAncrageSemaineA) === c.semaineAb;
    }).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  }, [creneauxScolaires, joursVacances]);

  const membre = (id: string) => membres.find((m) => m.profileId === id);
  const nom = (id: string) => membre(id)?.nom ?? 'Parent';

  /** Exceptions couvrant un jour donné, pour le détail. */
  const exceptionsDuJour = (jour: string) =>
    exceptions.filter((e) => jourDe(e.debut) <= jour && jour <= jourDe(e.fin));

  const decalageDebut = (new Date(premierJour + 'T12:00:00').getDay() + 6) % 7;
  const cases: (string | null)[] = [
    ...Array.from({ length: decalageDebut }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => addDays(premierJour, i)),
  ];

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour voir votre planning réel." />}
      {erreur && <Erreur message={erreur} />}
      {erreurExceptions && (
        <p role="status" className="rounded-xl bg-wait-bg px-3 py-2 text-[13px] leading-snug text-wait">
          Le rythme s’affiche, mais les périodes particulières n’ont pas pu être
          chargées. <span className="opacity-80">{erreurExceptions}</span>
        </p>
      )}

      {ctx.etat === 'pret' && (
        <>
          <div className="flex items-center justify-between">
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage - 1)} aria-label="Mois précédent">‹</button>
            <h1 className="font-display text-[19px] font-semibold tracking-tight">{titre}</h1>
            <button className="btn btn-ghost px-3" onClick={() => setDecalage(decalage + 1)} aria-label="Mois suivant">›</button>
          </div>

          <BandeauHorizon offre={offre} />

          {regle === null && (
            <Vide titre="Aucun rythme de garde défini"
                  texte="Choisissez votre rythme pour générer le planning."
                  action={{ href: '/app/foyer', label: 'Définir le rythme de garde' }} />
          )}

          {regle && regle !== 'inconnu' && !regle.parent2 && (
            <p className="rounded-xl bg-wait-bg px-3 py-2 text-sm font-bold text-wait">
              Le planning s’affichera dès que le second parent aura rejoint le foyer.
            </p>
          )}

          {regle && regle !== 'inconnu' && regle.parent2 && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {membres.map((m) => (
                  <ParentBadge key={m.profileId} name={m.nom} initial={m.initiale}
                    colorKey={m.couleur === 'coral' ? 'coral' : 'navy'} />
                ))}
              </div>

              <section className="card overflow-hidden">
                <div className="grid grid-cols-7 border-b border-line bg-muted text-center text-xs font-bold text-soft">
                  {['L','M','M','J','V','S','D'].map((d, i) => <div key={i} className="py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {cases.map((d, i) => {
                    if (!d) return <div key={`vide-${i}`} className="aspect-square" />;
                    const couvert = dansHorizon(offre, d);
                    // Le numéro de semaine rend le rythme « semaines paires »
                    // vérifiable d'un coup d'œil, comme sur un agenda.
                    const lundi = new Date(`${d}T12:00:00Z`).getUTCDay() === 1;
                    const a = couvert ? parJour.get(d) : undefined;
                    const m = a ? membre(a.parentId) : undefined;
                    const estAujourdhui = d === today;
                    const coral = m?.couleur === 'coral';
                    const fond = m ? (coral ? 'bg-p2-bg' : 'bg-p1-bg') : '';
                    const texte = m ? (coral ? 'text-coral-text' : 'text-navy-text') : '';
                    const vacancesExc = a?.source === 'holiday';
                    // Toute source différente de 'rule' est une exception :
                    // le calendrier ne connaît aucun type en particulier.
                    const ponctuel = Boolean(a && a.source !== 'rule' && a.source !== 'holiday');
                    // Journée de transition : les enfants changent de parent
                    // en cours de journée. La case se coupe en deux, matin en
                    // haut, après-midi en bas.
                    const transition = couvert ? partagees.get(d) : undefined;
                    const mMatin = transition ? membre(transition.matin) : undefined;
                    const ecole = creneauxDuJour(d);
                    const teinte = (mem?: { couleur: string }) =>
                      mem?.couleur === 'coral' ? 'bg-p2-bg' : 'bg-p1-bg';
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setJourOuvert(jourOuvert === d ? null : d)}
                        aria-label={[
                          transition && mMatin && m
                            ? `${d}, chez ${mMatin.nom} le matin puis chez ${m.nom} à partir de ${transition.heure}`
                            : m ? `${d}, chez ${m.nom}` : couvert ? d : `${d}, au-delà de votre offre`,
                          vacancesExc ? 'vacances définies par les parents' : null,
                          ponctuel ? 'changement ponctuel' : null,
                          joursVacances.has(d) ? 'vacances scolaires' : null,
                          ecole.length > 0 ? `sortie des cours à ${ecole[ecole.length - 1].heureFin}` : null,
                        ].filter(Boolean).join(', ')}
                        className={`relative aspect-square overflow-hidden border-b border-r border-line p-1 text-left ${
                          transition ? '' : fond}
                          ${!couvert ? 'bg-muted/60' : ''}
                          ${estAujourdhui ? 'ring-2 ring-inset ring-navy' : ''}
                          ${ponctuel ? 'border-2 border-dashed border-ink/40' : ''}
                          ${jourOuvert === d ? 'ring-2 ring-inset ring-ink' : ''}`}
                      >
                        {/* Journée partagée : deux moitiés, séparées par un
                            trait net. La couleur seule ne suffirait pas — les
                            initiales restent affichées. */}
                        {transition && (
                          <>
                            <span aria-hidden
                              className={`absolute inset-x-0 top-0 h-1/2 ${teinte(mMatin)}`} />
                            <span aria-hidden
                              className={`absolute inset-x-0 bottom-0 h-1/2 ${teinte(m)}`} />
                            <span aria-hidden
                              className="absolute inset-x-0 top-1/2 h-px bg-ink/25" />
                          </>
                        )}
                        {joursVacances.has(d) && (
                          <span aria-hidden
                            className="absolute inset-x-0 top-0 z-10 h-[3px] bg-[#C9A227]"
                            title="Vacances scolaires" />
                        )}
                        {lundi && (
                          <span aria-hidden
                            className="absolute right-0.5 top-0.5 z-10 text-[8px] font-bold text-soft/50">
                            S{isoWeek(d)}
                          </span>
                        )}
                        <span className="relative z-10 text-xs font-bold">{Number(d.slice(8))}</span>
                        {rdvDuJour(d).length > 0 && (
                          <span aria-hidden
                            className="absolute bottom-0.5 left-0.5 z-10 h-1.5 w-1.5 rounded-full bg-[#6741B8]"
                            title="Rendez-vous" />
                        )}
                        {ecole.length > 0 && (
                          <span aria-hidden
                            className="absolute bottom-0.5 left-2.5 z-10 h-1.5 w-1.5 rounded-full bg-[#2E8B57]"
                            title={`Sortie des cours à ${ecole[ecole.length - 1].heureFin}`} />
                        )}
                        {transition && mMatin && m ? (
                          <span className="relative z-10 mt-0.5 flex flex-col text-[9px] font-black leading-[1.15]">
                            <span className={mMatin.couleur === 'coral' ? 'text-coral-text' : 'text-navy-text'}>
                              {mMatin.initiale}
                            </span>
                            <span className={m.couleur === 'coral' ? 'text-coral-text' : 'text-navy-text'}>
                              {m.initiale}
                            </span>
                          </span>
                        ) : m ? (
                          <span className={`relative z-10 mt-0.5 block text-[10px] font-black ${texte}`}>
                            {m.initiale}
                          </span>
                        ) : null}
                        {vacancesExc && (
                          <span aria-hidden className="absolute bottom-0.5 right-0.5 text-[9px] leading-none">🌴</span>
                        )}
                        {ponctuel && (
                          <span aria-hidden className="absolute bottom-0.5 right-0.5 leading-none text-soft">
                            <Icone nom="echange" taille={9} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Légende */}
              <section className="card space-y-2 p-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-soft/80">Légende</h2>
                <ul className="space-y-1.5 text-[13px]">
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="h-5 w-5 shrink-0 rounded-md bg-p1-bg" />
                    Garde habituelle — couleur pleine du parent
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 rounded-md bg-p2-bg text-[8px] leading-5">
                      <span className="absolute inset-0 grid place-items-center">🌴</span>
                    </span>
                    Vacances — prioritaire sur tout
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-dashed border-ink/40 bg-p1-bg text-soft">
                      <Icone nom="echange" taille={9} />
                    </span>
                    Changement ponctuel — bordure pointillée
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md bg-muted">
                      <span className="absolute inset-x-0 top-0 h-[3px] bg-[#C9A227]" />
                    </span>
                    Vacances scolaires — liseré doré, ajoutées automatiquement
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                      <span className="absolute inset-x-0 top-0 h-1/2 bg-p1-bg" />
                      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-p2-bg" />
                      <span className="absolute inset-x-0 top-1/2 h-px bg-ink/25" />
                    </span>
                    Jour de changement — case coupée, matin en haut
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 rounded-md bg-muted">
                      <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-[#6741B8]" />
                    </span>
                    Rendez-vous — pastille violette, sans effet sur la garde
                  </li>
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="relative h-5 w-5 shrink-0 rounded-md bg-muted">
                      <span className="absolute bottom-1 left-2.5 h-1.5 w-1.5 rounded-full bg-[#2E8B57]" />
                    </span>
                    École — pastille verte, masquée pendant les vacances et jours fériés
                  </li>
                </ul>
              </section>

              {/* Détail du jour sélectionné */}
              {jourOuvert && (
                <section className="card space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-[17px] font-semibold tracking-tight">
                      {new Date(jourOuvert + 'T12:00:00').toLocaleDateString('fr-FR',
                        { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h2>
                    <button type="button" className="text-sm font-bold text-soft" onClick={() => setJourOuvert(null)}>
                      Fermer
                    </button>
                  </div>

                  {(() => {
                    if (!dansHorizon(offre, jourOuvert)) {
                      return (
                        <div className="rounded-xl bg-wait-bg px-3 py-3">
                          <p className="text-sm font-bold text-wait">Au-delà de votre offre</p>
                          <p className="mt-1 text-[13px] leading-snug text-soft">
                            Ce jour dépasse la période couverte. Ajoutez des mois ou
                            passez à Zen Plus pour planifier plus loin.
                          </p>
                          <Link href="/app/offre" className="btn btn-primary mt-2.5 w-full">
                            Voir les options
                          </Link>
                        </div>
                      );
                    }
                    const a = parJour.get(jourOuvert);
                    if (!a) return <p className="text-sm text-soft">Aucune information pour ce jour.</p>;
                    const m = membre(a.parentId);
                    // Le libellé vient de l'exception elle-même : aucun type
                    // n'est écrit en dur.
                    const exc = exceptionsDuJour(jourOuvert)
                      .sort((x, y) => y.priorite - x.priorite)[0];
                    const libelle = a.source === 'rule'
                      ? 'Garde habituelle'
                      : exc?.typeLibelle ?? 'Période particulière';
                    return (
                      <>
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">Chez {nom(a.parentId)}</span>
                          {m && <ParentBadge name={m.nom} initial={m.initiale}
                                  colorKey={m.couleur === 'coral' ? 'coral' : 'navy'} compact />}
                        </p>
                        {partagees.get(jourOuvert) && (() => {
                          const t = partagees.get(jourOuvert)!;
                          const mMat = membre(t.matin);
                          const mApr = membre(t.apresMidi);
                          return (
                            <p className="rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug">
                              Journée partagée : chez <strong>{mMat?.nom}</strong> le matin,
                              puis chez <strong>{mApr?.nom}</strong> à partir de <strong>{t.heure}</strong>.
                            </p>
                          );
                        })()}
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] font-bold text-soft">
                          {a.source === 'holiday' && <span aria-hidden>🌴</span>}
                          {a.source !== 'rule' && a.source !== 'holiday'
                            && <Icone nom="echange" taille={12} />}
                          {libelle}
                        </p>
                      </>
                    );
                  })()}

                  {rdvDuJour(jourOuvert).length > 0 && (
                    <ul className="border-t border-line-soft pt-2.5">
                      {rdvDuJour(jourOuvert).map((r) => (
                        <li key={r.id} className="text-[13px] leading-snug">
                          <span className="font-bold">
                            {r.journeeEntiere ? '' : `${new Date(r.debut).toLocaleTimeString('fr-FR',
                              { hour: '2-digit', minute: '2-digit' })} · `}
                            {r.titre}
                          </span>
                          <span className="block text-soft/85">
                            {r.enfants}
                            {r.lieu && ` · ${r.lieu}`}
                            {r.affairesTotal > 0 && ` · ${r.affairesCochees}/${r.affairesTotal} préparé`}
                          </span>
                        </li>
                      ))}
                      <li className="mt-1.5">
                        <Link href="/app/rendez-vous" className="text-[12px] font-bold underline">
                          Voir les rendez-vous
                        </Link>
                      </li>
                    </ul>
                  )}

                  {(() => {
                    const ecole = creneauxDuJour(jourOuvert);
                    if (ecole.length === 0) return null;
                    const recupere = parJour.get(jourOuvert);
                    const derniereSortie = ecole[ecole.length - 1].heureFin;
                    return (
                      <ul className="border-t border-line-soft pt-2.5">
                        {ecole.map((c, i) => (
                          <li key={c.id ?? i} className="text-[13px] leading-snug">
                            <span className="font-bold">{c.heureDebut}–{c.heureFin}</span>
                            {c.matiere && <span> · {c.matiere}</span>}
                            {c.salle && <span className="text-soft/85"> · salle {c.salle}</span>}
                          </li>
                        ))}
                        {recupere && (
                          <li className="mt-1 text-[13px] font-bold text-ok">
                            Sortie des cours à {derniereSortie} — récupéré·e par {nom(recupere.parentId)}
                          </li>
                        )}
                      </ul>
                    );
                  })()}

                  {vacancesDuJour(jourOuvert).length > 0 && (
                    <ul className="border-t border-line-soft pt-2.5">
                      {vacancesDuJour(jourOuvert).map((v) => (
                        <li key={v.id} className="text-[13px] leading-snug">
                          <span className="font-bold">{v.libelle}</span>
                          {v.zone && <span className="text-soft/85"> · zone {v.zone}</span>}
                          <span className="block text-soft/85">
                            Vacances scolaires — n’attribuent pas la garde par elles-mêmes.
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {exceptionsDuJour(jourOuvert).length > 0 && (
                    <ul className="divide-y divide-line-soft border-t border-line-soft pt-1">
                      {exceptionsDuJour(jourOuvert).map((e) => (
                        <li key={e.id} className="py-2.5">
                          <p className="text-sm font-bold">
                            {e.type === 'holiday' ? '🌴 ' : '↔ '}{e.typeLibelle} — {e.enfantPrenom}
                          </p>
                          {e.titre && <p className="text-[13px]">{e.titre}</p>}
                          <p className="text-[13px] text-soft/85">
                            Du {dateHeure(e.debut)} au {dateHeure(e.fin)} · chez {nom(e.parentId)}
                          </p>
                          {e.note && <p className="mt-0.5 text-[13px] text-soft/85">{e.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link href="/app/exceptions" className="btn btn-ghost w-full">
                    Gérer vacances et changements
                  </Link>
                </section>
              )}

              <div className="flex flex-col gap-2">
                <Link href="/app/exceptions" className="btn btn-primary w-full">
                  Vacances et changements ponctuels
                </Link>
                <p className="text-center text-xs text-soft">
                  Généré depuis votre rythme de garde.{' '}
                  <Link href="/app/foyer" className="underline">Le modifier</Link>
                  {enfants.length > 1 && <><br />Le calendrier affiche la garde commune ; le détail précise chaque enfant.</>}
                </p>
              </div>
            </>
          )}
        </>
      )}

      <BottomNav active="/app/planning" />
    </main>
  );
}

/**
 * Frontière Suspense.
 *
 * Lors de la génération statique, tout hook lisant l'URL — directement ou via
 * un composant importé — doit être isolé derrière une frontière Suspense, sans
 * quoi la construction échoue. Le planning n'affiche que des données propres au
 * foyer connecté : cette frontière ne coûte rien et l'immunise durablement.
 */
export default function Planning() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuPlanning />
    </Suspense>
  );
}
