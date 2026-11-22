'use client';

import { useEffect } from 'react';
import { lireOrigine, origineReferent, type Origine } from '@/lib/marketing/utm';

const CLE_ORIGINE = 'czen_origine';
const CLE_COMPTEE = 'czen_visite_comptee';

/** Origine interne du questionnaire lorsqu'aucun contenu n'a précédé. */
export const ORIGINE_QUIZ: Origine = {
  source: 'site', campagne: 'quiz', contenu: 'quiz-resultat',
};

/**
 * Mémorise l'origine de la première visite et la signale une fois.
 *
 * Première visite, et elle seule : une personne qui découvre l'application par
 * un carrousel puis revient par un Reel doit rester attribuée au carrousel,
 * qui a fait le travail de découverte. Écraser à chaque passage créditerait
 * systématiquement le dernier contenu vu.
 *
 * La lecture se fait sur window.location plutôt que par useSearchParams : cela
 * évite d'imposer une frontière Suspense à toute la mise en page pour un
 * comptage qui n'affiche rien.
 */
export function SuiviOrigine() {
  useEffect(() => {
    let origine: Origine | null = null;
    try {
      origine = lireOrigine(window.location.search)
        ?? origineReferent(document.referrer, window.location.pathname, window.location.host);
    } catch {
      return;
    }
    if (!origine) return;

    // Un navigateur en navigation privée, ou avec le stockage refusé, lève à
    // la lecture. Le comptage n'est pas assez important pour interrompre
    // l'affichage : on renonce silencieusement.
    try {
      if (!window.localStorage.getItem(CLE_ORIGINE)) {
        window.localStorage.setItem(CLE_ORIGINE, JSON.stringify(origine));
      }
      if (window.sessionStorage.getItem(CLE_COMPTEE)) return;
    } catch {
      return;
    }
    // Navigateur piloté par un programme : ce n'est pas un visiteur.
    if (navigator.webdriver) return;

    // Une visite ne compte qu'après un geste (toucher, défilement, clic,
    // touche) ou dix secondes de page visible. Les robots qui vérifient les
    // liens des descriptions YouTube ouvraient la page et repartaient : deux
    // « visites » d'ordinateur chaque jour de publication, sans un seul geste.
    const evenements = ['pointerdown', 'touchstart', 'scroll', 'keydown'] as const;
    let minuteur: number | undefined;
    const compter = () => {
      arreter();
      try {
        if (window.sessionStorage.getItem(CLE_COMPTEE)) return;
        window.sessionStorage.setItem(CLE_COMPTEE, '1');
      } catch {
        return;
      }
      void fetch('/api/marketing/visite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(origine),
        keepalive: true,
      }).catch(() => { /* une mesure perdue ne casse rien */ });
    };
    const armer = () => {
      if (document.visibilityState === 'visible' && minuteur === undefined) {
        minuteur = window.setTimeout(compter, 10_000);
      } else if (document.visibilityState !== 'visible' && minuteur !== undefined) {
        window.clearTimeout(minuteur);
        minuteur = undefined;
      }
    };
    function arreter() {
      if (minuteur !== undefined) window.clearTimeout(minuteur);
      evenements.forEach((e) => window.removeEventListener(e, compter));
      document.removeEventListener('visibilitychange', armer);
    }
    evenements.forEach((e) => window.addEventListener(e, compter, { once: true, passive: true }));
    document.addEventListener('visibilitychange', armer);
    armer();
    return arreter;
  }, []);

  return null;
}

/**
 * Origine mémorisée, à joindre à la création de compte.
 *
 * Renvoie un objet vide si rien n'a été retenu : la visite était directe, ou
 * le stockage est refusé. Dans les deux cas l'inscription doit aboutir.
 */
export function origineMemorisee(): Record<string, string> {
  try {
    const brut = window.localStorage.getItem(CLE_ORIGINE);
    if (!brut) return {};
    const lu = JSON.parse(brut) as Partial<Origine>;
    if (!lu.source) return {};
    return {
      utm_source: lu.source,
      utm_campaign: lu.campagne ?? 'inconnue',
      utm_content: lu.contenu ?? 'inconnu',
    };
  } catch {
    return {};
  }
}

/** Relit l'origine sous sa forme métier, sans exposer le stockage aux écrans. */
export function lireOrigineMemorisee(): Origine | null {
  try {
    const brut = window.localStorage.getItem(CLE_ORIGINE);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<Origine>;
    if (!lu.source) return null;
    return {
      source: lu.source,
      campagne: lu.campagne ?? 'inconnue',
      contenu: lu.contenu ?? 'inconnu',
    };
  } catch {
    return null;
  }
}

/**
 * Retient une origine interne seulement si aucun contenu n'a déjà fait
 * connaître l'application. L'attribution au premier contact reste intacte.
 */
export function memoriserOrigineSiAbsente(origine: Origine): void {
  try {
    if (!window.localStorage.getItem(CLE_ORIGINE)) {
      window.localStorage.setItem(CLE_ORIGINE, JSON.stringify(origine));
    }
  } catch {
    /* stockage indisponible : l'inscription reste possible */
  }
}
