/**
 * Emploi du temps scolaire — logique pure (pas d'accès réseau/base ici).
 *
 * `zod` n'est pas une dépendance de ce projet (vérifié) : validation
 * manuelle, dans le même style que `/api/paiement/route.ts`.
 */

export interface CreneauDetecte {
  jour_semaine: number;               // 1 = lundi ... 5 = vendredi, comme jourSemaine() dans custody.ts
  heure_debut: string;                // 'HH:MM'
  heure_fin: string;
  matiere: string | null;
  salle: string | null;
  professeur: string | null;
  semaine_ab: 'A' | 'B' | null;
}

export interface ExtractionEdt {
  semaine_ab_detectee: boolean;
  creneaux: CreneauDetecte[];
}

export class ErreurExtraction extends Error {}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse défensif de la réponse texte de Claude : strip des éventuelles
 * fences markdown (```json ... ```), puis validation champ par champ.
 * Lève toujours ErreurExtraction avec un message actionnable plutôt que de
 * renvoyer un résultat partiel deviné — l'utilisateur doit reprendre la
 * photo, jamais se voir proposer des créneaux inventés.
 */
export function parserReponseExtraction(texteBrut: string): ExtractionEdt {
  const nettoye = texteBrut
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let brut: unknown;
  try {
    brut = JSON.parse(nettoye);
  } catch {
    throw new ErreurExtraction(
      'La réponse de lecture du ticket n’est pas un JSON valide — reprenez la photo, si possible mieux cadrée.',
    );
  }

  if (typeof brut !== 'object' || brut === null) {
    throw new ErreurExtraction('Réponse de lecture inattendue.');
  }
  const obj = brut as Record<string, unknown>;

  if (!Array.isArray(obj.creneaux)) {
    throw new ErreurExtraction('Aucun créneau détecté sur cette photo — reprenez-la, si possible bien à plat et lisible.');
  }

  const creneaux: CreneauDetecte[] = obj.creneaux.map((c, i) => validerCreneau(c, i));

  return {
    semaine_ab_detectee: Boolean(obj.semaine_ab_detectee),
    creneaux,
  };
}

function validerCreneau(c: unknown, index: number): CreneauDetecte {
  if (typeof c !== 'object' || c === null) {
    throw new ErreurExtraction(`Créneau ${index + 1} illisible.`);
  }
  const o = c as Record<string, unknown>;

  const jour = Number(o.jour);
  if (!Number.isInteger(jour) || jour < 1 || jour > 5) {
    throw new ErreurExtraction(`Créneau ${index + 1} : jour de semaine illisible (attendu 1 à 5, lundi à vendredi).`);
  }

  const debut = String(o.heure_debut ?? '');
  const fin = String(o.heure_fin ?? '');
  if (!HEURE.test(debut) || !HEURE.test(fin)) {
    throw new ErreurExtraction(`Créneau ${index + 1} : heure illisible.`);
  }
  if (fin <= debut) {
    throw new ErreurExtraction(`Créneau ${index + 1} : l’heure de fin (${fin}) n’est pas après l’heure de début (${debut}).`);
  }

  const semaineAb = o.semaine_ab === 'A' || o.semaine_ab === 'B' ? o.semaine_ab : null;

  return {
    jour_semaine: jour,
    heure_debut: debut,
    heure_fin: fin,
    matiere: texteOuNull(o.matiere),
    salle: texteOuNull(o.salle),
    professeur: texteOuNull(o.professeur),
    semaine_ab: semaineAb,
  };
}

function texteOuNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Année scolaire à partir d'une date : bascule au 1er août (avant, on est encore dans l'année précédente). */
export function anneeScolaireDe(date: Date): string {
  const annee = date.getMonth() >= 7 /* août = index 7 */ ? date.getFullYear() : date.getFullYear() - 1;
  return `${annee}-${annee + 1}`;
}

/**
 * Résout la semaine A/B d'une date, à partir de l'ancrage (lundi de départ
 * de la semaine A). Alterne toutes les semaines calendaires ; un ancrage
 * dans le futur ou une date antérieure à l'ancrage restent calculables (le
 * modulo gère les deltas négatifs).
 */
export function semaineAbDe(date: string, ancrage: string): 'A' | 'B' {
  const jourMs = 86_400_000;
  const semaineMs = 7 * jourMs;
  const delta = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ancrage}T00:00:00Z`);
  const semaines = Math.floor(delta / semaineMs);
  return ((semaines % 2) + 2) % 2 === 0 ? 'A' : 'B';
}
