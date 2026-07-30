/**
 * Lecture de la grille tarifaire.
 *
 * SOURCE UNIQUE : la table plans, exposée par la fonction grille_tarifaire().
 * Aucun montant n'est écrit dans ce fichier ni ailleurs dans le code — c'est
 * ce qui garantit que la page commerciale, l'écran d'offre et Stripe ne
 * peuvent plus annoncer trois prix différents.
 *
 * Modifier un prix se fait par une requête SQL sur la table plans.
 */

export interface FormuleTarifaire {
  planId: string;
  libelle: string;
  prixMensuelCents: number;
  prixAnnuelCents: number;
  /** Économie réalisée en payant à l'année, calculée en base. */
  economieAnnuelleCents: number;
  fonctions: string[];
  ordre: number;
}

export type Periodicite = 'month' | 'year';

/** Formatage monétaire unique : centimes entiers, virgule décimale française. */
export function formatPrix(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 2 : 2,
  }).format(cents / 100);
}

export function libellePeriodicite(p: Periodicite): string {
  return p === 'year' ? 'par an' : 'par mois';
}

/**
 * Grille lue côté serveur, sans authentification.
 * Renvoie null si la base est injoignable : la page publique doit continuer à
 * s'afficher, avec son bloc tarifaire masqué plutôt qu'un prix inventé.
 */
export async function lireGrilleTarifaire(): Promise<FormuleTarifaire[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;

  try {
    const reponse = await fetch(`${url}/rest/v1/rpc/grille_tarifaire`, {
      method: 'POST',
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      // La grille change rarement : une heure de cache suffit et évite
      // d'interroger la base à chaque visite.
      next: { revalidate: 3600 },
    });
    if (!reponse.ok) return null;
    const lignes = (await reponse.json()) as Record<string, unknown>[];
    if (!Array.isArray(lignes)) return null;
    return lignes.map((l) => ({
      planId: l.plan_id as string,
      libelle: l.libelle as string,
      prixMensuelCents: Number(l.prix_mensuel_cents ?? 0),
      prixAnnuelCents: Number(l.prix_annuel_cents ?? 0),
      economieAnnuelleCents: Number(l.economie_annuelle_cents ?? 0),
      fonctions: Array.isArray(l.fonctions) ? (l.fonctions as string[]) : [],
      ordre: Number(l.ordre ?? 100),
    }));
  } catch {
    return null;
  }
}


export interface FormuleExtension {
  extensionId: string;
  libelle: string;
  mois: number;
  prixCents: number;
  description: string | null;
  recommande: boolean;
  ordre: number;
}

/**
 * Extensions ponctuelles, lues en base sans authentification.
 * Null si la base est injoignable : la page publique masque alors le bloc
 * plutôt que d'annoncer un prix qui ne serait pas celui facturé.
 */
export async function lireGrilleExtensions(): Promise<FormuleExtension[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;

  try {
    const reponse = await fetch(`${url}/rest/v1/rpc/grille_extensions`, {
      method: 'POST',
      headers: {
        apikey: cle, Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      next: { revalidate: 3600 },
    });
    if (!reponse.ok) return null;
    const lignes = (await reponse.json()) as Record<string, unknown>[];
    if (!Array.isArray(lignes)) return null;
    return lignes.map((l) => ({
      extensionId: l.extension_id as string,
      libelle: l.libelle as string,
      mois: Number(l.mois ?? 0),
      prixCents: Number(l.prix_cents ?? 0),
      description: (l.description as string) ?? null,
      recommande: Boolean(l.recommande),
      ordre: Number(l.ordre ?? 100),
    }));
  } catch {
    return null;
  }
}
