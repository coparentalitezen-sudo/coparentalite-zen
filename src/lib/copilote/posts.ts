import 'server-only';
import { genererContenusProduits } from './contenus-produits';
import {
  lireProduitsDiffusables, enregistrerContenusProduits, lireAutoValider,
  lireContenuParReference, programmerContenu,
} from './depot-contenus';
import { ajouterJours, cleSemaine, jourIso } from './dates';

export interface ResultatPosts {
  semaine: string;
  produitsAvecLien: number;
  ajoutes: number;
  programmes: number;
  ecartes: number;
  message: string;
}

/** Lundi de la semaine qui contient `date` (AAAA-MM-JJ, UTC). */
export function lundiDe(date: Date): string {
  const jour = jourIso(date);
  const rang = (new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7;
  return ajouterJours(jour, -rang);
}

/**
 * Prépare les publications produits de la semaine en cours.
 *
 * Rejouable : une publication déjà enregistrée n'est pas recréée. Avec
 * l'auto-validation activée, les nouvelles partent directement dans la réserve ;
 * sinon elles attendent dans /admin/contenus.
 */
export async function genererPostsSemaine(maintenant: Date, base: string): Promise<ResultatPosts> {
  const lundi = lundiDe(maintenant);
  const semaine = cleSemaine(lundi);
  const produits = await lireProduitsDiffusables();
  const resultat: ResultatPosts = {
    semaine, produitsAvecLien: produits.length, ajoutes: 0, programmes: 0, ecartes: 0, message: '',
  };
  if (produits.length === 0) {
    resultat.message = 'Aucune fiche n’a de lien : ajoute le lien de tes fiches (Payhip, Etsy…) dans /admin/boutique.';
    return resultat;
  }

  const { contenus, ecartes } = genererContenusProduits({
    produits, semaine, lundi, base,
  });
  resultat.ecartes = ecartes.length;
  if (ecartes.length) console.warn('[copilote] publications écartées par les garde-fous', ecartes);

  const ajoutees = await enregistrerContenusProduits(semaine, contenus);
  resultat.ajoutes = ajoutees.length;

  if (await lireAutoValider()) {
    for (const reference of ajoutees) {
      const c = await lireContenuParReference(reference);
      if (c?.statut !== 'en_attente') continue;
      const r = await programmerContenu(c.id, base);
      if (r.ok) resultat.programmes++;
      else console.error('[copilote] auto-validation', reference, r.message);
    }
  }

  resultat.message = resultat.ajoutes === 0
    ? `Publications de la semaine ${semaine} déjà préparées.`
    : `${resultat.ajoutes} publication(s) préparée(s) pour la semaine ${semaine}`
      + (resultat.programmes ? `, ${resultat.programmes} programmée(s) automatiquement.` : ', à valider.');
  return resultat;
}
