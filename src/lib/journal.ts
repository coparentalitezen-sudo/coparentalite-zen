/**
 * Traduction des entrées brutes du journal d'audit en phrases lisibles.
 * Isolé du composant pour être testable unitairement.
 */

export interface EntreeJournal {
  id: number;
  date: string;            // ISO
  auteur: string;
  action: string;
  entite: string;
  entiteId: string | null;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
}

const CENTS = (v: unknown): string | null => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n / 100);
};

const texte = (o: Record<string, unknown> | null, cle: string): string | null => {
  const v = o?.[cle];
  return typeof v === 'string' && v.length > 0 ? v : null;
};

/** Libellé principal : « Camille a modifié une dépense ». */
export function libelleAction(e: EntreeJournal): string {
  const sujets: Record<string, string> = {
    expense: 'une dépense',
    reimbursement: 'un remboursement',
    child: 'un enfant',
    household: 'le foyer',
    invitation: 'une invitation',
    custody_rule: 'le rythme de garde',
  };
  const sujet = sujets[e.entite] ?? e.entite;

  const verbes: Record<string, string> = {
    create: 'a ajouté',
    update: 'a modifié',
    delete: 'a supprimé',
    archive: 'a archivé',
    cancel: 'a annulé',
    validate: 'a validé',
    dispute: 'a signalé à vérifier',
    clarify: 'a demandé une précision sur',
    invite: 'a envoyé',
    accept: 'a accepté',
    set: 'a défini',
  };
  const verbe = verbes[e.action] ?? e.action;

  if (e.entite === 'household' && e.action === 'create') return `${e.auteur} a créé le foyer`;
  if (e.entite === 'household' && e.action === 'delete') return `${e.auteur} a supprimé le foyer`;
  if (e.entite === 'custody_rule') return `${e.auteur} a défini le rythme de garde`;
  return `${e.auteur} ${verbe} ${sujet}`;
}

/** Détail : ce qui a changé, formaté pour un parent, pas pour un développeur. */
export function detailAction(e: EntreeJournal): string | null {
  const bits: string[] = [];

  if (e.entite === 'expense') {
    const titreAvant = texte(e.avant, 'title');
    const titreApres = texte(e.apres, 'title');
    const nom = titreApres ?? titreAvant;
    if (nom) bits.push(`« ${nom} »`);

    const mAvant = e.avant ? CENTS(e.avant['amount_cents']) : null;
    const mApres = e.apres ? CENTS(e.apres['amount_cents']) : null;
    if (mAvant && mApres && mAvant !== mApres) bits.push(`montant : ${mAvant} → ${mApres}`);
    else if (mApres && !mAvant) bits.push(mApres);
    else if (mAvant && !mApres) bits.push(mAvant);

    if (titreAvant && titreApres && titreAvant !== titreApres) {
      bits.push(`titre : « ${titreAvant} » → « ${titreApres} »`);
    }
    if (e.avant?.['status'] === 'validated' && e.action === 'update') {
      bits.push('modifiée après validation');
    }
  }

  if (e.entite === 'reimbursement') {
    const montant = e.avant ? CENTS(e.avant['amount_cents']) : null;
    if (montant) bits.push(montant);
  }

  if (e.entite === 'child') {
    const avant = texte(e.avant, 'first_name');
    const apres = texte(e.apres, 'first_name');
    if (avant && apres && avant !== apres) bits.push(`${avant} → ${apres}`);
    else if (apres ?? avant) bits.push((apres ?? avant) as string);
  }

  return bits.length > 0 ? bits.join(' · ') : null;
}

/** Date lisible : « 23 juillet 2026 à 15:04 ». */
export function dateLisible(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
