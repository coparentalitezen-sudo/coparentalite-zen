// Minutage d'une vidéo animée : la durée de chaque plan vient de la durée réelle de sa voix.
//
// Module pur, sans dépendance, partagé par la page de rendu (film.js) et par les tests Vitest.
// Entrées : les lignes du scénario (rôle, texte affiché) et la durée mesurée de chaque voix.
// Sortie : les plans avec leurs bornes, l'instant de chaque voix, les sous-titres, la durée totale.
//
// Règle de lecture (la même que celle du style) : un texte reste à l'écran au moins
//   max(1,8 s ; voix + 0,6 s ; caractères / 12 + 1 s).
// Le plan dure le temps de sa voix et de sa lecture, plus une respiration avant et après.

export const AVANT = 0.35;         // la voix part 0,35 s après le début du plan (pendant la transition)
export const APRES = 0.3;          // respiration après le texte, avant le plan suivant
export const ACCROCHE_MIN = 3.0;   // l'accroche tient au moins 3 s : c'est la miniature
export const FIN = { fusion: 0.9, iris: 0.5, site: 0.3, tenue: 3.2 };   // la fin, sans voix
export const DUREE_MIN = 20, DUREE_MAX = 35;

/** Temps minimal de lecture d'un texte prononcé en `voix` secondes. */
export function lecture(texte, voix) {
  return Math.max(1.8, voix + 0.6, [...texte].length / 12 + 1);
}

const r3 = x => Math.round(x * 1000) / 1000;

/**
 * @param {{id:string, role:string, texte:string}[]} lignes  dans l'ordre du film
 * @param {Record<string, number>} durees  durée de chaque voix, en secondes
 */
export function minuter(lignes, durees) {
  const plans = [];
  let t = 0;
  for (const l of lignes) {
    const d = durees[l.id];
    if (!(d > 0)) throw new Error(`Durée de voix manquante pour « ${l.id} ».`);
    const tenue = lecture(l.texte, d);
    let duree = AVANT + Math.max(tenue, d + 0.4) + APRES;
    if (l.role === 'accroche') duree = Math.max(duree, ACCROCHE_MIN);
    const voix = t + AVANT;
    plans.push({
      id: l.id, role: l.role, numero: l.numero ?? null,
      t0: r3(t), t1: r3(t + duree),
      voix: { t: r3(voix), duree: r3(d) },
      sousTitre: { t0: r3(voix), t1: r3(voix + tenue), texte: l.texte },
    });
    t += duree;
  }
  const debutFin = t;
  const logo = debutFin + FIN.fusion + FIN.iris;
  const site = logo + FIN.site;
  const total = site + FIN.tenue;
  plans.push({ id: 'fin', role: 'fin', numero: null, t0: r3(debutFin), t1: r3(total), voix: null, sousTitre: null });
  return {
    duree: r3(total),
    plans,
    fin: { t0: r3(debutFin), logo: r3(logo), site: r3(site) },
    sousTitres: plans.filter(p => p.sousTitre).map(p => p.sousTitre),
  };
}

/** Le minutage respecte-t-il les bornes de durée ? Renvoie la liste des écarts (vide si conforme). */
export function ecarts(m) {
  const e = [];
  if (m.duree < DUREE_MIN) e.push(`durée ${m.duree} s < ${DUREE_MIN} s`);
  if (m.duree > DUREE_MAX) e.push(`durée ${m.duree} s > ${DUREE_MAX} s`);
  for (const p of m.plans) {
    if (!p.sousTitre) continue;
    if (p.sousTitre.t1 > p.t1 + 1e-6) e.push(`sous-titre « ${p.id} » dépasse son plan`);
    if (p.voix.t + p.voix.duree > p.t1 + 1e-6) e.push(`voix « ${p.id} » dépasse son plan`);
  }
  return e;
}
