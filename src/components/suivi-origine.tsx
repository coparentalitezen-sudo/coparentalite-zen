'use client';

import { useEffect } from 'react';
import { lireOrigine, type Origine } from '@/lib/marketing/utm';

const CLE_ORIGINE = 'czen_origine';
const CLE_COMPTEE = 'czen_visite_comptee';

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
      origine = lireOrigine(window.location.search);
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
