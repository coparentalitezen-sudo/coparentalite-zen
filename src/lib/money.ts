/**
 * COPARENTALITÉ ZEN — Moteur monétaire
 * Règles absolues :
 *  - tous les montants sont des ENTIERS en centimes (jamais de flottants) ;
 *  - les pourcentages sont des POINTS DE BASE entiers (10000 = 100 %) ;
 *  - la somme des parts est TOUJOURS exactement égale au montant total
 *    (méthode du plus fort reste — aucun centime perdu ni créé) ;
 *  - montants négatifs interdits partout.
 */

export type ParentId = string;

export interface PercentShareRule {
  kind: 'percentage';
  parentId: ParentId;
  basisPoints: number; // 0..10000
}
export interface FixedShareRule {
  kind: 'fixed_amount';
  parentId: ParentId;
  fixedCents: number; // >= 0
}
export type ShareRule = PercentShareRule | FixedShareRule;

export interface Allocation {
  parentId: ParentId;
  owedCents: number;
}

function assertInt(n: number, label: string): void {
  if (!Number.isInteger(n)) throw new Error(`${label} doit être un entier (centimes) — reçu ${n}`);
}

/**
 * Répartit amountCents selon les règles.
 * - Règles 100 % en pourcentage : la somme des basisPoints doit faire 10000.
 * - Règles mixtes : les montants fixes sont servis d'abord ; le reste est
 *   réparti au prorata des pourcentages (qui doivent alors sommer à 10000).
 * - Arrondi : plus fort reste, départage déterministe par ordre des règles.
 */
export function splitAmount(amountCents: number, rules: ShareRule[]): Allocation[] {
  assertInt(amountCents, 'amountCents');
  if (amountCents <= 0) throw new Error('Le montant doit être strictement positif');
  if (rules.length === 0) throw new Error('Au moins une règle de partage est requise');

  const fixed = rules.filter((r): r is FixedShareRule => r.kind === 'fixed_amount');
  const pct = rules.filter((r): r is PercentShareRule => r.kind === 'percentage');

  for (const f of fixed) {
    assertInt(f.fixedCents, 'fixedCents');
    if (f.fixedCents < 0) throw new Error('Montant fixe négatif interdit');
  }
  const fixedTotal = fixed.reduce((s, f) => s + f.fixedCents, 0);
  if (fixedTotal > amountCents) {
    throw new Error(`Montants fixes (${fixedTotal}) supérieurs au total (${amountCents})`);
  }
  const remainder = amountCents - fixedTotal;

  if (pct.length === 0) {
    if (remainder !== 0) {
      throw new Error(`Les montants fixes ne couvrent pas le total : ${remainder} centime(s) non attribué(s)`);
    }
    return fixed.map((f) => ({ parentId: f.parentId, owedCents: f.fixedCents }));
  }

  const bpTotal = pct.reduce((s, p) => s + p.basisPoints, 0);
  for (const p of pct) {
    assertInt(p.basisPoints, 'basisPoints');
    if (p.basisPoints < 0 || p.basisPoints > 10000) throw new Error('basisPoints hors bornes [0,10000]');
  }
  if (bpTotal !== 10000) {
    throw new Error(`La somme des pourcentages doit faire exactement 100 % (10000 points de base) — reçu ${bpTotal}`);
  }

  // Plus fort reste sur le remainder
  const raw = pct.map((p) => ({ parentId: p.parentId, exact: remainder * p.basisPoints }));
  const floors = raw.map((r) => Math.floor(r.exact / 10000));
  let allocated = floors.reduce((s, f) => s + f, 0);
  const remainders = raw.map((r, i) => ({ i, rem: r.exact % 10000 }));
  remainders.sort((a, b) => b.rem - a.rem || a.i - b.i); // déterministe
  let leftover = remainder - allocated;
  const result = floors.slice();
  for (let k = 0; k < leftover; k++) result[remainders[k].i] += 1;

  const out: Allocation[] = pct.map((p, i) => ({ parentId: p.parentId, owedCents: result[i] }));
  for (const f of fixed) {
    const existing = out.find((o) => o.parentId === f.parentId);
    if (existing) existing.owedCents += f.fixedCents;
    else out.push({ parentId: f.parentId, owedCents: f.fixedCents });
  }

  const check = out.reduce((s, o) => s + o.owedCents, 0);
  if (check !== amountCents) {
    // invariant interne — ne doit jamais se produire
    throw new Error(`Invariant violé : somme des parts ${check} ≠ total ${amountCents}`);
  }
  return out;
}

// ---------------- Solde entre parents ----------------

export interface ExpenseForBalance {
  paidBy: ParentId;
  allocations: Allocation[]; // parts dues par chacun (y compris le payeur)
}
export interface ReimbursementForBalance {
  fromParent: ParentId;
  toParent: ParentId;
  amountCents: number;
}

export interface PairBalance {
  parentA: ParentId;
  parentB: ParentId;
  /** > 0 : A doit recevoir de B ; < 0 : A doit régulariser envers B ; 0 : équilibré */
  netCentsForA: number;
}

/**
 * Calcule le solde net entre deux parents à partir des dépenses validées
 * et des remboursements enregistrés.
 * Exemple de l'énoncé : P1 doit 50 € à P2, P2 doit 30 € à P1 → net 20 € en faveur de P2.
 */
export function computePairBalance(
  parentA: ParentId,
  parentB: ParentId,
  expenses: ExpenseForBalance[],
  reimbursements: ReimbursementForBalance[] = []
): PairBalance {
  let netForA = 0; // ce que A doit recevoir

  for (const e of expenses) {
    for (const a of e.allocations) {
      if (a.owedCents < 0) throw new Error('Part négative interdite');
      if (e.paidBy === parentA && a.parentId === parentB) netForA += a.owedCents;
      if (e.paidBy === parentB && a.parentId === parentA) netForA -= a.owedCents;
    }
  }
  for (const r of reimbursements) {
    assertInt(r.amountCents, 'amountCents');
    if (r.amountCents <= 0) throw new Error('Remboursement non positif interdit');
    if (r.fromParent === parentB && r.toParent === parentA) netForA -= r.amountCents;
    if (r.fromParent === parentA && r.toParent === parentB) netForA += r.amountCents;
  }
  return { parentA, parentB, netCentsForA: netForA };
}

/** Formulation neutre exigée par la charte éditoriale. */
export function balanceLabel(b: PairBalance, forParent: ParentId): string {
  const net = forParent === b.parentA ? b.netCentsForA : -b.netCentsForA;
  const euros = (Math.abs(net) / 100).toFixed(2).replace('.', ',');
  if (net === 0) return 'Les comptes sont équilibrés';
  if (net > 0) return `Vous devez recevoir ${euros} €`;
  return `Vous avez ${euros} € à régulariser`;
}

/** Formatage monétaire sûr (affichage uniquement — jamais utilisé en calcul). */
export function formatCents(cents: number, currency = 'EUR'): string {
  assertInt(cents, 'cents');
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}
