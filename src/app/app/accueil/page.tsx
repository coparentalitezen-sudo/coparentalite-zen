'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import {
  Icone,
  PastilleIcone,
  categorieVisuel,
  type NomIcone,
  type Pastille,
} from '@/components/icons';
import { useContexte } from '@/lib/use-contexte';
import { lireIntention, oublierIntention, destinationApresInscription } from '@/lib/intention-achat';
import {
  listerDepenses,
  listerRemboursements,
  getRegleGarde,
  listerExceptions,
  type ExceptionGarde,
  getSolde,
  soldeLocalTransitoire,
  type DepenseListe,
  type RegleGarde,
  type Remboursement,
  type Solde,
} from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { buildDayMap, addDays, dernierJourTenu,
  type ExceptionOverride } from '@/lib/custody';
import { calculerSerenite } from '@/lib/serenite';
import { BandeauHorizon } from '@/components/premium';
import { ProgressionCompacte } from '@/components/progression';
import { InstallAppCard } from '@/components/install-app-card';
import { invitationPrematuree, type EtatConfiguration } from '@/lib/configuration';
import { getOffre, type Offre } from '@/lib/actions';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function dateLongue(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function dateCourte(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function dateAvecAnnee(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ajouterMois(dateIso: string, nombreMois: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  const jourInitial = date.getDate();

  date.setDate(1);
  date.setMonth(date.getMonth() + nombreMois);

  const dernierJourDuMois = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();

  date.setDate(Math.min(jourInitial, dernierJourDuMois));

  return date.toISOString().slice(0, 10);
}

function majuscule(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joursAvant(cible: string) {
  const a = new Date(`${aujourdhui()}T12:00:00`).getTime();
  const b = new Date(`${cible}T12:00:00`).getTime();

  return Math.round((b - a) / 86400000);
}

/**
 * Version actuelle du modèle gratuit :
 * l’utilisateur peut planifier jusqu’à trois mois à partir d’aujourd’hui.
 *
 * Cette valeur sera ensuite remplacée par la date réellement enregistrée
 * dans le compte lorsque les extensions et Zen Plus seront connectés.
 */
function obtenirLimitePlanificationGratuite(dateIso: string) {
  return ajouterMois(dateIso, 3);
}

/**
 * Pastille de statut d’une dépense :
 * point coloré + libellé, jamais la couleur seule.
 */
const STATUTS: Record<
  string,
  { texte: string; point: string; texteCls: string }
> = {
  sent: {
    texte: 'En attente',
    point: 'bg-[#D98324]',
    texteCls: 'text-[#8A6A1F]',
  },
  seen: {
    texte: 'En attente',
    point: 'bg-[#D98324]',
    texteCls: 'text-[#8A6A1F]',
  },
  to_validate: {
    texte: 'Précision demandée',
    point: 'bg-[#D98324]',
    texteCls: 'text-[#8A6A1F]',
  },
  validated: {
    texte: 'Validée',
    point: 'bg-[#1F7A45]',
    texteCls: 'text-[#1F7A45]',
  },
  partially_validated: {
    texte: 'Partielle',
    point: 'bg-[#D98324]',
    texteCls: 'text-[#8A6A1F]',
  },
  disputed: {
    texte: 'À vérifier',
    point: 'bg-[#B3423A]',
    texteCls: 'text-err',
  },
  reimbursed: {
    texte: 'Remboursée',
    point: 'bg-[#1F7A45]',
    texteCls: 'text-[#1F7A45]',
  },
  partially_reimbursed: {
    texte: 'Partielle',
    point: 'bg-[#D98324]',
    texteCls: 'text-[#8A6A1F]',
  },
  draft: {
    texte: 'Brouillon',
    point: 'bg-line',
    texteCls: 'text-soft',
  },
  cancelled: {
    texte: 'Annulée',
    point: 'bg-line',
    texteCls: 'text-soft',
  },
};

interface Action {
  cle: string;
  titre: string;
  sous: string;
  href: string;
  nom: NomIcone;
  ton: Pastille;
}

/**
 * Anneau de sérénité :
 * complétude administrative du foyer, jamais une comparaison des parents.
 */
function AnneauSerenite({
  pourcentage,
  libelle,
}: {
  pourcentage: number;
  libelle: string;
}) {
  const r = 45;
  const circonference = 2 * Math.PI * r;
  const rempli =
    (Math.max(0, Math.min(100, pourcentage)) / 100) * circonference;

  return (
    <div
      className="relative grid place-items-center"
      role="img"
      aria-label={`Sérénité du foyer : ${pourcentage} %. ${libelle}.`}
    >
      <svg
        width="88"
        height="88"
        viewBox="0 0 120 120"
        className="-rotate-90"
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="10"
        />

        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#22A15B"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${rempli} ${circonference}`}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <p className="text-[17px] font-extrabold tracking-tight">
            {pourcentage} %
          </p>

          <p className="mt-0.5 text-[9px] font-semibold text-soft">
            Sérénité
          </p>

          <span className="mt-0.5 inline-block text-[#22A15B]">
            <Icone nom="pousse" taille={12} />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Accueil() {
  const { ctx, recharger } = useContexte();

  /**
   * Reprise de l'intention d'achat.
   *
   * Un visiteur venu de la page d'accueil publique a choisi une offre avant
   * d'avoir un compte. Une fois son foyer créé, on le ramène là où il allait
   * — sinon la mémorisation ne servirait à rien et il devrait refaire le
   * chemin. On attend que le foyer existe : rediriger vers la page d'offre
   * pendant l'accueil guidé n'aurait aucun sens.
   *
   * L'intention est oubliée avant la redirection, pour qu'un retour en
   * arrière ne la rejoue pas indéfiniment.
   */
  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    const intention = lireIntention();
    if (!intention) return;
    oublierIntention();
    window.location.href = destinationApresInscription(intention);
  }, [ctx.etat]);

  const [depenses, setDepenses] = useState<DepenseListe[] | null>(null);
  const [regle, setRegle] = useState<RegleGarde | null | 'inconnu'>(
    'inconnu',
  );
  const [remboursements, setRemboursements] = useState<Remboursement[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [offre, setOffre] = useState<Offre | null>(null);
  /**
   * Vacances et changements ponctuels des quatre prochains mois.
   *
   * L'accueil annonce le prochain changement de garde : sans ces périodes, il
   * annonçait celui du rythme régulier et contredisait le planning, qui les
   * applique. Deux dates différentes pour un même événement, c'est la
   * confiance dans l'application qui s'en va.
   */
  const [exceptions, setExceptions] = useState<ExceptionGarde[]>([]);
  const [solde, setSolde] = useState<Solde | null>(null);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;

    const hid = ctx.contexte.foyer.id;
    const p1 = ctx.contexte.membres[0]?.profileId;
    const p2 = ctx.contexte.membres[1]?.profileId ?? null;

    Promise.all([
      listerDepenses(hid),
      listerRemboursements(hid),
      getSolde(hid),
    ]).then(([d, rb, sd]) => {
      if (d.status === 'ok') {
        setDepenses(d.data);
      } else if (d.status === 'error') {
        setErreur(d.message);
      }

      if (rb.status === 'ok') {
        setRemboursements(rb.data);
      }

      if (sd.status === 'ok') {
        setSolde(sd.data);
      } else if (
        sd.status === 'error' &&
        sd.message === 'SOLDE_SERVEUR_ABSENT' &&
        p1
      ) {
        setSolde(
          soldeLocalTransitoire(
            p1,
            p2,
            d.status === 'ok' ? d.data : [],
            rb.status === 'ok' ? rb.data : [],
          ),
        );
      } else if (sd.status === 'error') {
        setErreur(sd.message);
      }
    });

    getRegleGarde(hid).then((r) => {
      if (r.status === 'ok') {
        setRegle(r.data);
      } else if (r.status === 'error') {
        setErreur(r.message);
      }
    });

    // Un échec ici ne doit rien casser : le rythme régulier reste calculable.
    const debutFenetre = new Date().toISOString().slice(0, 10);
    const finFenetre = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    listerExceptions(hid, debutFenetre, finFenetre).then((r) => {
      if (r.status === 'ok') setExceptions(r.data);
    });
  }, [ctx]);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const moi = ctx.etat === 'pret' ? ctx.contexte.moi : null;

  const monProfil = membres.find((m) => m.profileId === moi);
  const autre = membres.find((m) => m.profileId !== moi);

  const today = aujourdhui();

  /*
   * Pour le moment, chaque compte utilise la formule gratuite.
   * Quand Stripe et les droits seront ajoutés, cette date devra provenir
   * du foyer ou de l’abonnement enregistré dans la base.
   */
  /**
   * Horizon de planification.
   *
   * Il vient de l'offre du foyer : date d'ouverture, plus les mois offerts et
   * ceux qui ont été ajoutés. Le calcul local « aujourd'hui plus trois mois »
   * datait d'avant le branchement de l'offre ; il repoussait la limite chaque
   * jour et ignorait purement et simplement un abonnement en cours.
   */
  const limitePlanification = offre?.horizon ?? obtenirLimitePlanificationGratuite(today);
  const joursPlanifiables = offre?.joursRestants
    ?? Math.max(0, joursAvant(limitePlanification));

  const nom = (id: string) =>
    membres.find((m) => m.profileId === id)?.nom ?? 'Parent';

  /**
   * Garde du jour et prochain changement.
   *
   * Mêmes ingrédients que le planning — rythme, vacances, changements
   * ponctuels — pour que les deux écrans annoncent forcément la même date.
   */
  const garde = useMemo(() => {
    if (!regle || regle === 'inconnu' || !regle.parent2) return null;

    try {
      const fin = new Date(Date.now() + 120 * 86400000)
        .toISOString()
        .slice(0, 10);

      const debut = regle.startDate < today ? regle.startDate : today;

      const jourDe = (iso: string) => new Date(iso).toISOString().slice(0, 10);
      const heureDe = (iso: string) => new Date(iso).toISOString().slice(11, 16);

      const ponctuels: ExceptionOverride[] = exceptions.map((e) => ({
        startsOn: jourDe(e.debut),
        endsOn: dernierJourTenu(jourDe(e.debut), jourDe(e.fin), heureDe(e.fin)),
        parentId: e.parentId,
        source: e.type,
        priorite: e.priorite,
      }));

      const carte = buildDayMap(
        {
          pattern: regle.pattern,
          startDate: regle.startDate,
          parent1: regle.parent1,
          parent2: regle.parent2,
          changeoverDay: regle.handoverDay,
          // Sans le cycle, un rythme personnalisé faisait échouer le calcul
          // et l'accueil restait muet sur « où sont les enfants aujourd'hui ».
          customCycle: regle.customCycle ?? undefined,
        },
        debut, fin, [], ponctuels,
      );

      const parentDuJour = carte.get(today)?.parentId;
      if (!parentDuJour) return null;

      for (let d = addDays(today, 1); d <= fin; d = addDays(d, 1)) {
        const p = carte.get(d)?.parentId;
        if (p && p !== parentDuJour) {
          return { parent: parentDuJour, prochain: d, prochainParent: p };
        }
      }
      return { parent: parentDuJour, prochain: null, prochainParent: null };
    } catch {
      return null;
    }
  }, [regle, exceptions, today]);

  /**
   * Montant net pour l’utilisateur :
   * positif = à recevoir ;
   * négatif = à régulariser.
   */
  const monSolde =
    solde && moi && solde.parent2
      ? moi === solde.parent1
        ? solde.netCents
        : -solde.netCents
      : null;

  const jeDois =
    monSolde !== null && monSolde < 0 ? Math.abs(monSolde) : 0;

  const aValider = (depenses ?? []).filter(
    (d) => d.statut === 'sent' && moi !== null && d.payePar !== moi,
  );

  const aVerifier = (depenses ?? []).filter(
    (d) => d.statut === 'disputed',
  );

  const sansJustificatif = (depenses ?? []).filter(
    (d) => d.payePar === moi && d.justificatifs === 0,
  );

  const serenite = calculerSerenite({
    deuxParents: membres.length >= 2,
    auMoinsUnEnfant: enfants.length > 0,
    rythmeDefini: regle !== 'inconnu' && regle !== null,
    depensesEnAttente: (depenses ?? []).filter(
      (d) => d.statut === 'sent',
    ).length,
    depensesAVerifier: aVerifier.length,
    soldeCents: monSolde ?? 0,
  });

  // À faire aujourd’hui : uniquement les actions réellement nécessaires.
  const actions: Action[] = [];

  if (membres.length < 2) {
    actions.push({
      cle: 'inviter',
      titre: 'Inviter le second parent',
      sous: 'Pour partager planning et dépenses',
      href: '/app/foyer',
      nom: 'personnes',
      ton: 'bleu',
    });
  }

  if (enfants.length === 0) {
    actions.push({
      cle: 'enfant',
      titre: 'Ajouter un enfant',
      sous: 'Indispensable pour les dépenses et le planning',
      href: '/app/enfants',
      nom: 'ecole',
      ton: 'violet',
    });
  }

  if (regle === null && membres.length >= 2) {
    actions.push({
      cle: 'rythme',
      titre: 'Définir le rythme de garde',
      sous: 'Le planning se génère ensuite tout seul',
      href: '/app/foyer',
      nom: 'calendrier',
      ton: 'violet',
    });
  }

  if (aValider.length > 0) {
    actions.push({
      cle: 'valider',
      titre: `${aValider.length} dépense${
        aValider.length > 1 ? 's' : ''
      } à valider`,
      sous:
        aValider.length === 1
          ? `Ajoutée par ${nom(aValider[0].payePar)}`
          : 'En attente de votre validation',
      href: '/app/depenses',
      nom: 'presse-papier',
      ton: 'ambre',
    });
  }

  if (aVerifier.length > 0) {
    actions.push({
      cle: 'verifier',
      titre: `${aVerifier.length} dépense${
        aVerifier.length > 1 ? 's' : ''
      } à vérifier`,
      sous: 'Un désaccord a été signalé',
      href: '/app/depenses',
      nom: 'recu',
      ton: 'rose',
    });
  }

  if (jeDois > 0) {
    actions.push({
      cle: 'rembourser',
      titre: `Rembourser ${formatCents(jeDois)}`,
      sous: autre
        ? `À régulariser avec ${autre.nom}`
        : 'À régulariser',
      href: '/app/depenses',
      nom: 'echange',
      ton: 'bleu',
    });
  }

  if (garde?.prochain) {
    const j = joursAvant(garde.prochain);

    if (j >= 0 && j <= 2) {
      actions.push({
        cle: 'garde',
        titre: 'Préparer le changement de garde',
        sous:
          j === 0
            ? "Aujourd'hui"
            : j === 1
              ? 'Demain'
              : `Dans ${j} jours`,
        href: '/app/planning',
        nom: 'calendrier',
        ton: 'violet',
      });
    }
  }

  if (sansJustificatif.length > 0) {
    actions.push({
      cle: 'justif',
      titre: `${sansJustificatif.length} justificatif${
        sansJustificatif.length > 1 ? 's' : ''
      } à ajouter`,
      sous: 'Sur vos dépenses récentes',
      href: '/app/depenses',
      nom: 'recu',
      ton: 'gris',
    });
  }

  const recentes = (depenses ?? []).slice(0, 3);

  return (
    <main className="space-y-5 px-4 pb-6 pt-3">
      {ctx.etat === 'chargement' && <Chargement />}

      {ctx.etat === 'erreur' && (
        <Erreur
          message={ctx.message}
          details={ctx.details}
          onReessayer={recharger}
        />
      )}

      {ctx.etat === 'sans-foyer' && <SansFoyer />}

      {ctx.etat === 'demo' && (
        <Vide
          titre="Mode démonstration"
          texte="Connectez-vous pour retrouver vos données réelles."
        />
      )}

      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          {/* Salutation et état du foyer */}
          <header className="flex items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              <h1 className="font-display text-[20px] font-semibold leading-tight tracking-tight">
                Bonjour {monProfil?.nom ?? ''}
              </h1>

              <p className="mt-0.5 text-[13px] text-soft/85">
                {majuscule(dateLongue(today))}
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#EEF5F0] px-2.5 py-1.5 text-[11px] font-bold text-[#1F7A45]">
              <Icone nom="check" taille={13} />
              {serenite.libelle}
            </span>
          </header>

          <InstallAppCard />

          {/* Zen Plus : plus aucune limite à annoncer */}
          {offre?.illimite && (
            <section
              className="overflow-hidden rounded-[24px] border border-[#CFE6D9] bg-[#EEF5F0]"
              aria-labelledby="titre-horizon"
            >
              <div className="flex items-start gap-3 px-4 py-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1F7A45] shadow-sm">
                  <Icone nom="check" taille={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    id="titre-horizon"
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1F7A45]"
                  >
                    Zen Plus
                    {offre.periodiciteActive === 'year' && ' · formule annuelle'}
                    {offre.periodiciteActive === 'month' && ' · formule mensuelle'}
                  </p>
                  <p className="mt-1.5 text-[15px] font-extrabold leading-snug text-navy-text">
                    Planification sans limite de durée
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-soft">
                    Organisez aussi loin que nécessaire, autant d’années que vous
                    le souhaitez.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Limite de planification gratuite — masquée pour un abonné */}
          {offre && !offre.illimite && (
          <section
            className="overflow-hidden rounded-[24px] border border-[#D9E2EF] bg-[#F4F7FB]"
            aria-labelledby="titre-horizon"
          >
            <div className="px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-navy-text shadow-sm">
                  <Icone nom="calendrier" taille={21} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                      id="titre-horizon"
                      className="text-[11px] font-bold uppercase tracking-[0.08em] text-soft"
                    >
                      3 mois gratuits
                    </p>

                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-navy-text">
                      3 mois inclus
                    </span>
                  </div>

                  <p className="mt-1.5 text-[15px] font-extrabold leading-snug text-navy-text">
                    Planification disponible jusqu’au{' '}
                    {dateAvecAnnee(limitePlanification)}
                  </p>

                  <p className="mt-1 text-[12px] leading-relaxed text-soft">
                    Vous pouvez encore organiser environ {joursPlanifiables}{' '}
                    jours à l’avance.
                  </p>
                </div>
              </div>

              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-white"
                role="progressbar"
                aria-label="Période de planification incluse"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={3}
              >
                <div className="h-full w-full rounded-full bg-navy" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href="/app/planning"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-bold text-navy-text shadow-sm"
                >
                  Voir le planning
                  <Icone nom="chevron" taille={13} />
                </Link>

                <Link
                  href="/app/plus"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-navy px-3 text-center text-[12px] font-bold text-white"
                >
                  Planifier plus loin
                  <Icone nom="chevron" taille={13} />
                </Link>
              </div>

              <p className="mt-3 text-center text-[10px] leading-relaxed text-soft">
                Extensions ponctuelles sans abonnement
                obligatoire.
              </p>
            </div>
          </section>
          )}

          {/* Carte principale : solde, sérénité, prochain changement */}
          <section
            className="card px-4 py-5"
            aria-labelledby="titre-solde"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
              <div className="min-w-0">
                <p
                  id="titre-solde"
                  className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-soft/80"
                >
                  Solde actuel

                  <span
                    title="Dépenses validées, remboursements déduits."
                    className="text-soft/60"
                  >
                    <Icone nom="info" taille={13} />
                  </span>
                </p>

                {monSolde === null ? (
                  <>
                    <p className="mt-1.5 text-[clamp(19px,5.4vw,24px)] font-extrabold leading-none tracking-tight">
                      —
                    </p>

                    <p className="mt-1.5 text-[11px] leading-snug text-soft/85">
                      En attente du second parent.
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      className={`mt-1.5 whitespace-nowrap text-[clamp(19px,5.4vw,24px)] font-extrabold leading-none tracking-tight tabular-nums ${
                        monSolde > 0
                          ? 'text-[#1F7A45]'
                          : monSolde < 0
                            ? 'text-coral-text'
                            : ''
                      }`}
                    >
                      {monSolde > 0
                        ? '+'
                        : monSolde < 0
                          ? '−'
                          : ''}
                      {formatCents(Math.abs(monSolde))}
                    </p>

                    <p className="mt-1.5 text-[11px] leading-snug text-soft/85">
                      Dépenses validées, remboursements déduits.
                      {solde?.provisoire && ' Calcul provisoire.'}
                    </p>
                  </>
                )}

                <Link
                  href="/app/depenses"
                  className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold text-navy-text"
                >
                  Voir le détail

                  <span
                    aria-hidden
                    className="translate-y-px"
                  >
                    <Icone nom="chevron" taille={13} />
                  </span>
                </Link>
              </div>

              <AnneauSerenite
                pourcentage={serenite.pourcentage}
                libelle={serenite.libelle}
              />

              <div className="min-w-0 text-right">
                <p className="text-[11px] font-semibold leading-tight text-soft/80">
                  Prochain
                  <br />
                  changement
                </p>

                <span className="mt-1.5 inline-grid h-9 w-9 place-items-center rounded-xl bg-muted text-soft">
                  <Icone nom="calendrier" taille={18} />
                </span>

                {garde?.prochain && garde.prochainParent ? (
                  <>
                    <p className="mt-1.5 whitespace-nowrap text-[14px] font-bold leading-tight">
                      {majuscule(dateCourte(garde.prochain))}
                    </p>

                    <p className="truncate text-[11px] text-soft/85">
                      chez {nom(garde.prochainParent)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-[11px] leading-snug text-soft/85">
                    {regle === null
                      ? 'Rythme à définir'
                      : 'Aucun changement prévu'}
                  </p>
                )}

                <Link
                  href="/app/planning"
                  className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold text-navy-text"
                >
                  Voir le planning

                  <span
                    aria-hidden
                    className="translate-y-px"
                  >
                    <Icone nom="chevron" taille={13} />
                  </span>
                </Link>
              </div>
            </div>
          </section>

          {/* Tant que la configuration n'est pas terminée, l'étape suivante
              reste à portée depuis l'accueil. */}
          <ProgressionCompacte etat={{
            foyerCree: true,
            nbEnfants: ctx.contexte.enfants.length,
            secondParentNomme: ctx.contexte.membres.length >= 2,
            secondParentInscrit: ctx.contexte.membres.filter((m) => !m.provisoire).length >= 2,
            rythmeDefini: Boolean(regle) && regle !== 'inconnu',
            zoneScolaireDefinie: true,
            invitationEnvoyee: false,
          }} />

          <BandeauHorizon offre={offre} />

          {/* À faire aujourd’hui */}
          <section
            id="a-faire"
            className="card px-4 py-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                À faire aujourd’hui

                {actions.length > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-err-bg px-1.5 text-[11px] font-bold text-err">
                    {actions.length}
                  </span>
                )}
              </h2>

              {actions.length > 0 && (
                <Link
                  href="/app/depenses"
                  className="text-[13px] font-semibold text-soft/85"
                >
                  Tout voir
                </Link>
              )}
            </div>

            {actions.length === 0 ? (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#EEF5F0] px-4 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#1F7A45]">
                  <Icone nom="check" taille={18} />
                </span>

                <p className="font-bold text-[#1F7A45]">
                  Tout est à jour
                </p>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-line-soft">
                {actions.map((a) => (
                  <li key={a.cle}>
                    <Link
                      href={a.href}
                      className="flex min-h-[60px] items-center gap-3 py-3 text-left"
                    >
                      <PastilleIcone
                        nom={a.nom}
                        ton={a.ton}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block font-bold leading-snug">
                          {a.titre}
                        </span>

                        <span className="mt-0.5 block text-[13px] leading-snug text-soft/85">
                          {a.sous}
                        </span>
                      </span>

                      <span
                        aria-hidden
                        className="shrink-0 text-soft/60"
                      >
                        <Icone nom="chevron" taille={17} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Dernières dépenses */}
          <section className="card px-4 py-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[17px] font-semibold tracking-tight">
                Dernières dépenses
              </h2>

              <Link
                href="/app/depenses"
                className="text-[13px] font-semibold text-soft/85"
              >
                Voir toutes
              </Link>
            </div>

            {depenses === null ? (
              <p
                className="mt-3 text-sm text-soft"
                role="status"
              >
                Chargement…
              </p>
            ) : recentes.length === 0 ? (
              <div className="mt-3 rounded-2xl bg-muted px-4 py-5 text-center">
                <p className="font-bold">
                  Aucune dépense pour l’instant
                </p>

                <p className="mt-1 text-sm text-soft">
                  Enregistrez votre première dépense partagée.
                </p>

                <Link
                  href="/app/ajouter"
                  className="btn btn-primary mt-3 w-full"
                >
                  Ajouter une dépense
                </Link>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-line-soft">
                {recentes.map((d) => {
                  const visuel = categorieVisuel(d.categorie);

                  const statut = STATUTS[d.statut] ?? {
                    texte: d.statut,
                    point: 'bg-line',
                    texteCls: 'text-soft',
                  };

                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <PastilleIcone
                        nom={visuel.nom}
                        ton={visuel.ton}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold leading-snug">
                          {d.titre}
                        </p>

                        <p className="mt-0.5 truncate text-[13px] leading-snug text-soft/85">
                          {dateCourte(d.date)} • {nom(d.payePar)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="whitespace-nowrap font-bold tabular-nums">
                          {formatCents(d.montantCents)}
                        </p>

                        <p
                          className={`mt-0.5 flex items-center justify-end gap-1.5 text-[12px] font-semibold ${statut.texteCls}`}
                        >
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${statut.point}`}
                          />

                          {statut.texte}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <BottomNav active="/app/accueil" />
    </main>
  );
}