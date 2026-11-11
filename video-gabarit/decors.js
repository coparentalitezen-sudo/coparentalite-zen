// Décors et distribution par sujet. Une seule mise en scène pour quinze sujets lassait (Sekou, 8/11) :
// chaque micro-niche appartient à un univers qui habille l'accroche (accessoires, bulles, personnages)
// et le fond des trois étapes. La structure, les durées et les sons ne changent pas : seul le décor varie.
// Tout est déterministe : même scénario, même image (aucun hasard hors de la graine du scénario).
import { shape, plane, ink, ellipse, rect, rrect, spline, star, sparkle, text, lerp, seg, twos, back, hash, TAU } from './engine/toon.js';
import { C, KARIM, JULIE, KID } from './engine/chars.js';

export const UNIVERS = {
  'garde-alternee': 'calendrier', 'conflits-planning': 'calendrier', imprevus: 'horloge',
  'vacances-scolaires': 'vacances', 'echange-enfants': 'echange',
  'depenses-partagees': 'argent', pension: 'argent',
  'ecole-activites': 'ecole', 'rendez-vous-medicaux': 'sante', 'documents-familiaux': 'papiers',
  communication: 'messages', 'nouveaux-conjoints': 'recomposee', 'familles-recomposees': 'recomposee',
  'longue-distance': 'distance', anniversaires: 'fete', noel: 'fete',
};
export const univers = niche => UNIVERS[niche] || 'calendrier';

// ------------------------------------------------------------------ distribution
// Les deux parents changent d'allure d'une vidéo à l'autre, toujours ensemble (mêmes gestes, mêmes
// expressions : aucun n'est désigné) ; l'enfant aussi (fille ou garçon, coiffure, teint).
const PEAUX = ['#B97B55', '#F0C7A4', '#D9A07A', '#8A5A3C', '#E8B48F'];
const CHEVEUX = ['#2B2120', '#7A4A30', '#3B2A22', '#B07A45', '#1E1A1A'];
const PAPAS = [
  KARIM,
  { ...KARIM, skin: PEAUX[1], hair: CHEVEUX[3], beard: false, top: C.sage, topD: C.sageD, bottom: '#4F5866', bottomD: '#3E4652' },
  { ...KARIM, skin: PEAUX[3], hair: CHEVEUX[4], beard: true, top: C.goldD, topD: '#9C7530', bottom: '#4A4A55', bottomD: '#393944', collar: false },
  { ...KARIM, skin: PEAUX[2], hair: CHEVEUX[2], beard: false, top: C.navyD, topD: '#2F3E54' },
];
const MAMANS = [
  JULIE,
  { ...JULIE, skin: PEAUX[3], hair: CHEVEUX[4], hairStyle: 'side', top: C.gold, topD: C.goldD, bottom: '#5B4E6B', bottomD: '#4A3F58' },
  { ...JULIE, skin: PEAUX[2], hair: CHEVEUX[0], hairStyle: 'bun', top: C.sage, topD: C.sageD },
  { ...JULIE, skin: PEAUX[4], hair: CHEVEUX[3], hairStyle: 'side', top: C.coralD, topD: '#A5655B', bottom: '#4F5866', bottomD: '#3E4652' },
];
const ENFANTS = [
  KID,
  { ...KID, hairStyle: 'short', skin: PEAUX[1], hair: CHEVEUX[3], top: C.gold, topD: C.goldD },
  { ...KID, hairStyle: 'side', skin: PEAUX[3], hair: CHEVEUX[0], top: C.coral, topD: C.coralD, bottom: C.navy, bottomD: C.navyD },
  { ...KID, hairStyle: 'short', skin: PEAUX[0], hair: CHEVEUX[4], top: C.navyL, topD: C.navy, bottom: '#5A5148', bottomD: '#463E36' },
];
export function distribution(graine) {
  const g = graine >>> 0;
  return {
    papa: PAPAS[g % PAPAS.length],
    maman: MAMANS[(g >>> 3) % MAMANS.length],
    enfant: ENFANTS[(g >>> 6) % ENFANTS.length],
    cadet: ENFANTS[((g >>> 6) + 2) % ENFANTS.length],
    beau: { ...PAPAS[((g >>> 9) + 1) % PAPAS.length], beard: false, collar: false, top: C.sageL, topD: C.sage },
  };
}

// ------------------------------------------------------------------ petits accessoires
const L = 4;
function valise(ctx, x, y, s, col, colD) {
  shape(ctx, rrect(x - 60 * s, y - 120 * s, 120 * s, 120 * s, 14 * s), { fill: col, line: L, seed: 1401, shade: [{ pts: rect(x + 20 * s, y - 124 * s, 40 * s, 128 * s), color: colD, alpha: 0.4 }] });
  ink(ctx, spline([[x - 24 * s, y - 120 * s], [x - 22 * s, y - 150 * s], [x + 22 * s, y - 150 * s], [x + 24 * s, y - 120 * s]], false, 6), 6, { seed: 1402, color: C.ink, taper: false });
  [-30, 30].forEach((d, i) => ink(ctx, [[x + d * s, y - 112 * s], [x + d * s, y - 8 * s]], 3, { seed: 1403 + i, color: colD, taper: false }));
}
function ballon(ctx, x, y, r, col, colD, t, i) {
  const dy = Math.sin(twos(t) * 3 + i) * 6;
  ink(ctx, spline([[x, y + r + dy], [x + 8, y + r + 60], [x - 6, y + r + 130]], false, 6), 2.5, { seed: 1410 + i, color: C.ink });
  shape(ctx, ellipse(x, y + dy, r * 0.86, r, 28), { fill: col, line: L, seed: 1412 + i, shade: [{ pts: ellipse(x + r * 0.3, y + dy + r * 0.2, r * 0.5, r * 0.7, 20), color: colD, alpha: 0.35 }] });
}
function guirlande(ctx, x0, x1, y, cols, seed) {
  const n = 9, pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u), y + Math.sin(u * Math.PI) * 60]); }
  ink(ctx, pts, 3, { seed, color: C.ink });
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], mx = (ax + bx) / 2, my = (ay + by) / 2;
    shape(ctx, [[ax + 6, ay], [bx - 6, by], [mx, my + 54]], { fill: cols[i % cols.length], line: 3, seed: seed + 1 + i });
  }
}
function feuille(ctx, x, y, a, s, seed) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  shape(ctx, rect(-46, -60, 92, 120), { fill: C.white, line: 3.5, seed, grain: 0.1 });
  for (let i = 0; i < 4; i++) ink(ctx, [[-30, -36 + i * 22], [i === 3 ? 6 : 30, -36 + i * 22]], 3, { seed: seed + 1 + i, color: C.paperD, taper: false });
  ctx.restore();
}
function calendrierMural(ctx, x, y, s, entete, seed) {
  shape(ctx, rrect(x - 80 * s, y - 70 * s, 160 * s, 150 * s, 12 * s), { fill: C.white, line: L, seed });
  shape(ctx, rrect(x - 80 * s, y - 70 * s, 160 * s, 38 * s, 10 * s), { fill: entete, line: 0, seed: seed + 1, off: [0, 0], grain: 0.1 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++)
    shape(ctx, rect(x + (-64 + c * 26) * s, y + (-20 + r * 30) * s, 18 * s, 20 * s), { fill: (r * 5 + c) % 3 === 0 ? entete : C.paperD, line: 0, grain: 0, seed: seed + 2 + r * 5 + c, off: [0, 0] });
}
function horloge(ctx, x, y, r, t, seed) {
  shape(ctx, ellipse(x, y, r, r, 40), { fill: C.white, line: L + 1, seed });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ink(ctx, [[x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78], [x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9]], 3, { seed: seed + 1 + i, color: C.ink, taper: false }); }
  const a1 = twos(t) * 1.2 - 1.6, a2 = twos(t) * 0.1 - 0.4;
  ink(ctx, [[x, y], [x + Math.cos(a1) * r * 0.7, y + Math.sin(a1) * r * 0.7]], 4, { seed: seed + 20, color: C.coralD, taper: false });
  ink(ctx, [[x, y], [x + Math.cos(a2) * r * 0.5, y + Math.sin(a2) * r * 0.5]], 6, { seed: seed + 21, color: C.ink, taper: false });
}
function piece(ctx, x, y, r, seed) {
  shape(ctx, ellipse(x, y, r, r * 0.42, 24), { fill: C.gold, line: 3.5, seed, shade: [{ pts: ellipse(x, y + 4, r, r * 0.42, 24), color: C.goldD, alpha: 0.35 }] });
}
function pile(ctx, x, y, n, seed) { for (let i = 0; i < n; i++) piece(ctx, x, y - i * 12, 30, seed + i); }
function ticket(ctx, x, y0, y1, seed) {
  const w = 120, pts = [[x - w / 2, y0], [x + w / 2, y0]];
  for (let i = 0; i <= 8; i++) pts.push([x + w / 2 - i * w / 8, y1 + (i % 2 ? 10 : 0)]);
  shape(ctx, pts, { fill: C.white, line: 3.5, seed, grain: 0.1 });
  for (let yy = y0 + 30; yy < y1 - 30; yy += 28) ink(ctx, [[x - 40, yy], [x + (hash(yy, seed) > 0.5 ? 40 : 10), yy]], 3, { seed: seed + yy, color: C.paperD, taper: false });
  text(ctx, '€', x + 30, y1 - 22, { font: '36px Slab', fill: C.ink, align: 'center' });
}
function voiture(ctx, x, y, col, colD, seed) {
  shape(ctx, spline([[x - 120, y - 30], [x - 110, y - 70], [x - 50, y - 80], [x - 20, y - 120], [x + 60, y - 120], [x + 90, y - 80], [x + 125, y - 70], [x + 125, y - 30]], true, 6), { fill: col, line: L, seed, shade: [{ pts: rect(x + 40, y - 124, 90, 100), color: colD, alpha: 0.35 }] });
  shape(ctx, rrect(x - 12, y - 110, 62, 30, 8), { fill: C.white, line: 3, seed: seed + 1 });
  [-70, 75].forEach((d, i) => shape(ctx, ellipse(x + d, y - 26, 26, 26, 24), { fill: C.ink, line: 0, seed: seed + 2 + i, off: [0, 0] }));
}
function sacADos(ctx, x, y, s, col, colD, seed) {
  shape(ctx, rrect(x - 50 * s, y - 70 * s, 100 * s, 120 * s, 22 * s), { fill: col, line: L, seed, shade: [{ pts: rect(x + 14 * s, y - 70 * s, 36 * s, 120 * s), color: colD, alpha: 0.4 }] });
  shape(ctx, rrect(x - 34 * s, y - 4 * s, 68 * s, 38 * s, 10 * s), { fill: C.white, line: 3, seed: seed + 1 });
  ink(ctx, spline([[x - 26 * s, y - 70 * s], [x - 22 * s, y - 100 * s], [x + 22 * s, y - 100 * s], [x + 26 * s, y - 70 * s]], false, 6), 5, { seed: seed + 2, color: C.ink, taper: false });
}
function doudou(ctx, x, y, s, seed) {
  [-1, 1].forEach((d, i) => shape(ctx, ellipse(x + d * 30 * s, y - 92 * s, 16 * s, 16 * s, 16), { fill: C.goldL, line: 3.5, seed: seed + i }));
  shape(ctx, ellipse(x, y - 30 * s, 40 * s, 36 * s, 24), { fill: C.goldL, line: 3.5, seed: seed + 2 });
  shape(ctx, ellipse(x, y - 78 * s, 36 * s, 32 * s, 24), { fill: C.goldL, line: 3.5, seed: seed + 3 });
  [-12, 12].forEach((d, i) => shape(ctx, ellipse(x + d * s, y - 82 * s, 4 * s, 5 * s, 8), { fill: C.ink, line: 0, grain: 0, off: [0, 0], seed: seed + 4 + i }));
}
function croix(ctx, x, y, s, col, seed) {
  shape(ctx, [[x - 18 * s, y - 50 * s], [x + 18 * s, y - 50 * s], [x + 18 * s, y - 18 * s], [x + 50 * s, y - 18 * s], [x + 50 * s, y + 18 * s], [x + 18 * s, y + 18 * s], [x + 18 * s, y + 50 * s], [x - 18 * s, y + 50 * s], [x - 18 * s, y + 18 * s], [x - 50 * s, y + 18 * s], [x - 50 * s, y - 18 * s], [x - 18 * s, y - 18 * s]], { fill: col, line: L, seed });
}
function tableau(ctx, x, y, seed) {
  shape(ctx, rrect(x - 110, y - 80, 220, 160, 10), { fill: '#3F5A4C', line: L + 1, seed });
  text(ctx, 'A B C', x, y - 10, { font: '44px Slab', fill: C.white, align: 'center' });
  text(ctx, '1 + 2', x, y + 46, { font: '34px Slab', fill: C.goldL, align: 'center' });
}
function gateau(ctx, x, y, t, seed) {
  shape(ctx, rrect(x - 130, y - 20, 260, 20, 6), { fill: C.paperD, line: L, seed });
  ink(ctx, [[x - 100, y], [x - 100, y + 150]], 8, { seed: seed + 1, color: C.ink, taper: false });
  ink(ctx, [[x + 100, y], [x + 100, y + 150]], 8, { seed: seed + 2, color: C.ink, taper: false });
  shape(ctx, rrect(x - 90, y - 110, 180, 90, 18), { fill: C.coralL, line: L, seed: seed + 3, shade: [{ pts: rect(x + 30, y - 112, 60, 94), color: C.coralD, alpha: 0.3 }] });
  shape(ctx, spline([[x - 92, y - 104], [x - 50, y - 84], [x, y - 102], [x + 50, y - 84], [x + 92, y - 104], [x + 80, y - 116], [x - 80, y - 116]], true, 6), { fill: C.white, line: 3, seed: seed + 4 });
  [-40, 0, 40].forEach((d, i) => {
    shape(ctx, rect(x + d - 6, y - 160, 12, 46), { fill: [C.navyL, C.goldL, C.sageL][i], line: 3, seed: seed + 5 + i });
    const fl = 1 + 0.15 * Math.sin(twos(t) * 9 + i * 2);
    shape(ctx, ellipse(x + d, y - 172, 8, 14 * fl, 12), { fill: C.gold, line: 2.5, seed: seed + 9 + i });
  });
}
function train(ctx, x, y, seed) {
  [0, 1, 2].forEach(i => {
    const cx = x - i * 170;
    shape(ctx, rrect(cx - 78, y - 90, 156, 80, 14), { fill: i ? C.navyL : C.coral, line: L, seed: seed + i * 4 });
    [-40, 0, 40].forEach((d, j) => shape(ctx, rrect(cx + d - 14, y - 76, 28, 26, 6), { fill: C.white, line: 2.5, seed: seed + i * 4 + 1 + j }));
    [-46, 46].forEach((d, j) => shape(ctx, ellipse(cx + d, y - 8, 16, 16, 16), { fill: C.ink, line: 0, seed: seed + 30 + i * 2 + j, off: [0, 0] }));
  });
}
function montagnes(ctx, x0, x1, y, col, seed) {
  const pts = [[x0, y]];
  const n = 5;
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u), y - (i % 2 ? 210 : 90) - hash(i, seed) * 50]); }
  pts.push([x1, y]);
  shape(ctx, pts, { fill: col, line: 3.5, seed, grain: 0.2 });
}
function bulleMessage(ctx, x, y, w, col, k, seed, droite) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const h = 56;
  shape(ctx, [...rrect(-w / 2, -h / 2, w, h, 20), ...(droite ? [] : [])], { fill: col, line: 3.5, seed });
  shape(ctx, droite ? [[w / 2 - 30, h / 2 - 4], [w / 2 - 6, h / 2 + 22], [w / 2 - 48, h / 2 - 4]] : [[-w / 2 + 30, h / 2 - 4], [-w / 2 + 6, h / 2 + 22], [-w / 2 + 48, h / 2 - 4]], { fill: col, line: 3.5, seed: seed + 1 });
  for (let i = 0; i < 3; i++) shape(ctx, ellipse(-22 + i * 22, 0, 6, 6, 10), { fill: C.white, line: 0, grain: 0, off: [0, 0], seed: seed + 2 + i });
  ctx.restore();
}

// ------------------------------------------------------------------ accroche : bulles et accessoires
// Les pictogrammes des bulles des parents (à défaut, un « ? »).
export const BULLES = {
  calendrier: ['calendrier', 'calendrier'], horloge: ['horloge', 'horloge'], vacances: ['soleil', 'calendrier'],
  echange: ['sac', 'sac'], argent: ['euro', 'recu'], ecole: ['cartable', 'calendrier'], sante: ['trousse', 'calendrier'],
  papiers: ['dossier', 'dossier'], messages: ['bulle', 'bulle'], recomposee: ['maisons', 'calendrier'],
  distance: ['train', 'calendrier'], fete: ['gateau', 'gateau'],
};

/** Accessoires derrière les personnages (murs, sol). Coordonnées de la scène des deux maisons. */
export function accrocheFond(ctx, t, u, uv) {
  const fin = u > 0;
  switch (uv) {
    case 'calendrier':
      calendrierMural(ctx, 110, 800, 1, C.navy, 1500); calendrierMural(ctx, 970, 800, 1, C.coral, 1520); break;
    case 'horloge':
      horloge(ctx, 110, 800, 70, t, 1540); horloge(ctx, 970, 800, 70, t + 0.7, 1560); break;
    case 'vacances': {
      shape(ctx, ellipse(970, 640, 70, 70, 32), { fill: C.gold, line: L, seed: 1580 });
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + twos(t) * 0.3; ink(ctx, [[970 + Math.cos(a) * 86, 640 + Math.sin(a) * 86], [970 + Math.cos(a) * 112, 640 + Math.sin(a) * 112]], 5, { seed: 1581 + i, color: C.goldD, taper: false }); }
      [[110, 650, 1.0], [210, 760, 0.7]].forEach(([x, y, s], i) => shape(ctx, spline([[x - 70 * s, y], [x - 50 * s, y - 40 * s], [x, y - 52 * s], [x + 50 * s, y - 36 * s], [x + 76 * s, y]], true, 8), { fill: C.white, line: 3.5, seed: 1595 + i }));
      break;
    }
    case 'echange': voiture(ctx, 160, 1470, C.navyL, C.navy, 1600); break;
    case 'argent': ticket(ctx, 90, 470, 900, 1620); ticket(ctx, 990, 470, 860, 1640); break;
    case 'ecole': tableau(ctx, 980, 790, 1660); horloge(ctx, 100, 760, 60, t, 1670); break;
    case 'sante': croix(ctx, 105, 780, 1, C.sage, 1690); croix(ctx, 975, 780, 1, C.sage, 1700); break;
    case 'papiers': break;
    case 'messages': break;
    case 'recomposee': break;
    case 'distance':
      montagnes(ctx, -60, 520, 1100, C.navyL, 1720); montagnes(ctx, 560, 1140, 1100, C.coralL, 1730);
      if (!fin) { const k = ((twos(t) * 0.22) % 1); train(ctx, lerp(-200, 1500, k), 1110, 1740); }
      break;
    case 'fete':
      guirlande(ctx, -20, 520, 520, [C.gold, C.navyL, C.coral], 1760); guirlande(ctx, 560, 1100, 520, [C.coral, C.sageL, C.gold], 1780);
      break;
  }
}

/** Accessoires devant les personnages (sol, mains), et personnages en plus. */
export function accrocheAvant(ctx, t, u, uv) {
  const fin = u > 0;
  switch (uv) {
    case 'vacances': valise(ctx, 690, 1335, 0.9, C.coral, C.coralD); shape(ctx, ellipse(400, 1300, 34, 34, 24), { fill: C.white, line: L, seed: 1800 });
      [0, 1, 2].forEach(i => { const a = i / 3 * TAU; shape(ctx, [[400, 1300], [400 + Math.cos(a) * 34, 1300 + Math.sin(a) * 34], [400 + Math.cos(a + 0.6) * 34, 1300 + Math.sin(a + 0.6) * 34]], { fill: [C.coral, C.gold, C.navyL][i], line: 0, seed: 1801 + i, off: [0, 0] }); });
      break;
    case 'echange': sacADos(ctx, 660, 1330, 0.8, C.navy, C.navyD, 1810); doudou(ctx, 420, 1335, 0.75, 1820); break;
    case 'argent': pile(ctx, 410, 1330, 4, 1830); pile(ctx, 670, 1330, 3, 1840); break;
    case 'ecole': sacADos(ctx, 665, 1330, 0.85, C.coral, C.coralD, 1850); break;
    case 'sante': shape(ctx, rrect(620, 1250, 110, 80, 12), { fill: C.white, line: L, seed: 1860 }); croix(ctx, 675, 1290, 0.42, C.coral, 1861);
      shape(ctx, rrect(370, 1262, 90, 68, 8), { fill: C.sage, line: L, seed: 1870 }); ink(ctx, [[386, 1296], [444, 1296]], 3, { seed: 1871, color: C.white, taper: false }); break;
    case 'papiers': {
      shape(ctx, rrect(620, 1260, 150, 72, 10), { fill: C.gold, line: L, seed: 1880 });
      if (!fin) [[160, 600, 0.3, 0], [930, 560, -0.25, 1], [420, 1010, 0.5, 2], [680, 990, -0.4, 3]].forEach(([x, y, a, i]) => {
        const d = Math.sin(twos(t) * 2 + i * 1.7) * 14; feuille(ctx, x, y + d, a + Math.sin(twos(t) + i) * 0.08, 0.8, 1885 + i * 10);
      });
      break;
    }
    case 'messages':
      if (!fin) [[0.7, 110, 1010, false], [1.1, 970, 990, true], [1.5, 120, 900, false], [1.9, 960, 880, true]].forEach(([t0, x, y, d], i) =>
        bulleMessage(ctx, x, y - Math.min(1, seg(t, t0, t0 + 1.4)) * 60, 120, d ? C.coral : C.navyL, back(seg(t, t0, t0 + 0.25), 1.9) * (1 - seg(t, t0 + 1.4, t0 + 1.7)), 1900 + i * 4, d));
      break;
    case 'fete': gateau(ctx, 540, 1180, t, 1920); ballon(ctx, 130, 860, 50, C.coral, C.coralD, t, 0); ballon(ctx, 960, 840, 50, C.navyL, C.navy, t, 1); break;
  }
}
/** Personnages en plus : famille recomposée (beau-parent et cadet), dessinés avec la même règle. */
export const enPlus = uv => uv === 'recomposee';

// ------------------------------------------------------------------ couleurs des étapes
// Chaque univers a sa propre suite de trois fonds : l'œil change de décor d'une vidéo à l'autre.
const E = (fond, sol, cercle, manche) => ({ fond, sol, cercle, manche });
const DEFAUT = [E(C.goldT, C.goldL, C.goldL, C.navy), E(C.navyT, C.navyL, C.navyL, C.coral), E(C.coralT, C.coralL, C.coralL, C.navy)];
const PALETTES = {
  horloge: [E(C.navyT, C.navyL, C.goldL, C.coral), E(C.goldT, C.goldL, C.navyL, C.navy), E(C.sageT, C.sageL, C.coralL, C.navy)],
  vacances: [E(C.navyT, C.goldL, C.goldL, C.coral), E(C.navyT, C.goldL, C.coralL, C.navy), E(C.navyT, C.goldL, C.sageL, C.coral)],
  echange: [E(C.coralT, C.coralL, C.navyL, C.navy), E(C.navyT, C.navyL, C.coralL, C.coral), E(C.goldT, C.goldL, C.sageL, C.navy)],
  argent: [E(C.sageT, C.sageL, C.goldL, C.navy), E(C.goldT, C.goldL, C.sageL, C.coral), E(C.sageT, C.sageL, C.goldL, C.navy)],
  ecole: [E(C.white, C.navyT, C.goldL, C.coral), E(C.white, C.coralT, C.navyL, C.navy), E(C.white, C.sageT, C.coralL, C.coral)],
  sante: [E(C.sageT, C.sageL, C.white, C.navy), E(C.navyT, C.navyL, C.sageL, C.coral), E(C.sageT, C.sageL, C.coralL, C.navy)],
  papiers: [E(C.paperD, C.goldL, C.white, C.navy), E(C.goldT, C.goldL, C.navyL, C.coral), E(C.paperD, C.coralL, C.white, C.navy)],
  messages: [E(C.navyT, C.navyL, C.coralL, C.coral), E(C.coralT, C.coralL, C.navyL, C.navy), E(C.navyT, C.navyL, C.goldL, C.coral)],
  recomposee: [E(C.coralT, C.coralL, C.sageL, C.navy), E(C.sageT, C.sageL, C.coralL, C.coral), E(C.goldT, C.goldL, C.navyL, C.navy)],
  distance: [E(C.sageT, C.sageL, C.navyL, C.coral), E(C.navyT, C.navyL, C.sageL, C.navy), E(C.sageT, C.sageL, C.goldL, C.coral)],
  fete: [E(C.coralT, C.coralL, C.goldL, C.navy), E(C.goldT, C.goldL, C.coralL, C.navy), E(C.navyT, C.navyL, C.goldL, C.coral)],
};
export const couleursEtapes = uv => PALETTES[uv] || DEFAUT;

// ------------------------------------------------------------------ fond des étapes
export function fondEtape(ctx, t, p, uv, e) {
  const n = p.numero, m = e.sol;
  ctx.save(); ctx.globalAlpha = 0.85;
  switch (uv) {
    case 'calendrier': case 'horloge':
      for (let r = 0; r < 9; r++) for (let c = 0; c < 7; c++) shape(ctx, rrect(40 + c * 146, 420 + r * 150, 120, 120, 14), { fill: (r + c + n) % 4 ? m : C.white, line: 0, grain: 0, off: [0, 0], seed: 2000 + r * 7 + c, alpha: 0.55 });
      break;
    case 'vacances':
      for (let i = 0; i < 4; i++) { const y = 1380 + i * 70; const pts = []; for (let x = -40; x <= 1120; x += 40) pts.push([x, y + Math.sin(x / 70 + twos(t) * 2 + i) * 10]); ink(ctx, pts, 8, { seed: 2100 + i, color: C.white, taper: false }); }
      shape(ctx, ellipse(960, 470, 70, 70, 32), { fill: C.gold, line: 4, seed: 2110 });
      break;
    case 'echange': case 'distance':
      for (let i = 0; i < 18; i++) ink(ctx, [[60 + i * 60, 470 + Math.sin(i * 0.8) * 120 + i * 40], [90 + i * 60, 470 + Math.sin(i * 0.8 + 0.4) * 120 + i * 40 + 18]], 9, { seed: 2200 + i, color: m, taper: false });
      break;
    case 'argent':
      for (let x = 0; x <= 1080; x += 60) ink(ctx, [[x, 380], [x, 1920]], 3, { seed: 2300 + x, color: m, taper: false, breaks: 0 });
      for (let y = 380; y <= 1920; y += 60) ink(ctx, [[0, y], [1080, y]], 3, { seed: 2400 + y, color: m, taper: false, breaks: 0 });
      break;
    case 'ecole':
      for (let y = 420; y <= 1920; y += 64) ink(ctx, [[0, y], [1080, y]], 3, { seed: 2500 + y, color: C.navyL, taper: false });
      ink(ctx, [[120, 380], [120, 1920]], 4, { seed: 2599, color: C.coral, taper: false });
      break;
    case 'sante':
      for (let r = 0; r < 12; r++) for (let c = 0; c < 9; c++) shape(ctx, rect(c * 124, 400 + r * 124, 118, 118), { fill: (r + c) % 2 ? C.white : m, line: 0, grain: 0, off: [0, 0], seed: 2600 + r * 9 + c, alpha: 0.6 });
      break;
    case 'papiers':
      [[150, 560, 0.3], [930, 620, -0.2], [170, 1650, -0.15], [920, 1700, 0.25]].forEach(([x, y, a], i) => feuille(ctx, x, y, a, 1.3, 2700 + i * 10));
      break;
    case 'messages':
      [[180, 560, false], [900, 640, true], [160, 1640, false], [910, 1700, true]].forEach(([x, y, d], i) => bulleMessage(ctx, x, y, 190, i % 2 ? C.coralL : C.navyL, 1, 2800 + i * 4, d));
      break;
    case 'recomposee':
      for (let i = 0; i < 12; i++) { const x = (i % 4) * 300 + 90, y = Math.floor(i / 4) * 560 + 520 + (i % 2) * 120; shape(ctx, [[x - 40, y], [x, y - 40], [x + 40, y], [x + 40, y + 40], [x - 40, y + 40]], { fill: m, line: 0, grain: 0, off: [0, 0], seed: 2900 + i }); }
      break;
    case 'fete':
      for (let i = 0; i < 40; i++) { const x = hash(i, 3) * 1080, y = 400 + ((hash(i, 7) * 1500 + twos(t) * 40 * (0.5 + hash(i, 9))) % 1500); ctx.save(); ctx.translate(x, y); ctx.rotate(twos(t) * 2 + i); shape(ctx, rect(-9, -5, 18, 10), { fill: [C.coral, C.gold, C.navyL, C.sage][i % 4], line: 0, grain: 0, off: [0, 0], seed: 3000 + i }); ctx.restore(); }
      break;
  }
  ctx.restore();
}

/** Accessoires au sol des étapes, aux deux coins (le cercle et la carte restent dégagés). */
export function solEtape(ctx, t, p, uv) {
  const g = 1330;
  switch (uv) {
    case 'calendrier': calendrierMural(ctx, 130, 1000, 1.1, C.navy, 3100); break;
    case 'horloge': horloge(ctx, 135, 1000, 90, t, 3110); break;
    case 'vacances': valise(ctx, 950, 1110, 1.05, C.coral, C.coralD); break;
    case 'echange': sacADos(ctx, 950, 1090, 1.1, C.navy, C.navyD, 3120); break;
    case 'argent': pile(ctx, 120, 1100, 6, 3130); pile(ctx, 960, 1100, 4, 3140); piece(ctx, 190, 1110, 30, 3145); break;
    case 'ecole': sacADos(ctx, 950, 1090, 1.1, C.coral, C.coralD, 3150); tableau(ctx, 150, 560, 3155); break;
    case 'sante': croix(ctx, 130, 1010, 1.2, C.sage, 3160); croix(ctx, 950, 560, 0.8, C.coral, 3165); break;
    case 'papiers': shape(ctx, rrect(40, 1030, 200, 80, 12), { fill: C.gold, line: L, seed: 3170 }); feuille(ctx, 140, 1000, -0.2, 1, 3175); break;
    case 'messages': bulleMessage(ctx, 150, 1040, 190, C.white, 1, 3190, false); break;
    case 'recomposee': doudou(ctx, 130, 1100, 1.2, 3195); break;
    case 'distance': train(ctx, 1000, 1138, 3180); break;
    case 'fete': ballon(ctx, 120, 820, 66, C.coral, C.coralD, t, 3); ballon(ctx, 960, 860, 66, C.gold, C.goldD, t, 4); break;
  }
  return g;
}
