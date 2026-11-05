// Gabarit « Coparentalité Zen » — vidéo verticale 1080×1920, style Mid-century Cartoon.
// Un seul gabarit pour tous les sujets : accroche (deux maisons, l'enfant sur la couture) → trois étapes
// numérotées (médaillon, appel en cercle, carte) → ce que l'application apporte → les deux moitiés se
// referment, iris sur l'enfant qui devient l'anneau du logo officiel, adresse du site tenue immobile.
// Toutes les durées viennent de minutage.mjs, donc de la durée réelle de chaque voix.
import { setClock, shape, plane, ink, rays, ellipse, rect, rrect, spline, move, star, sparkle, text, fit, measure,
  paperFinish, clamp, lerp, seg, ss, eo, eio, back, twos, TAU, hash } from './engine/toon.js';
import { C, drawPerson, drawPhone, drawHand, armMix, KARIM, JULIE, KID } from './engine/chars.js';
import { picto } from './icones.js';
import { minuter } from './minutage.mjs';

export const W = 1080, H = 1920;
const CAP_BOTTOM = 1560;             // la carte de sous-titre reste au-dessus de l'interface des plateformes
let SC = null, M = null, LOGO = null, EVS = [];
const P = {};                        // plans par identifiant

export function setup(scenario, durees, logo) {
  SC = scenario; LOGO = logo;
  M = minuter(scenario.lignes.map(l => ({ id: l.id, role: l.role, numero: l.numero, texte: l.texte })), durees);
  for (const p of M.plans) P[p.id] = p;
  construireEvenements();
  return M;
}
export const duree = () => M.duree;
export const minutage = () => M;
export function events() { return EVS; }
export function subs() { return M.sousTitres.map(s => ({ t0: s.t0, t1: s.t1, text: s.texte })); }
const ligne = id => SC.lignes.find(l => l.id === id);
const plan = t => M.plans.find(p => t >= p.t0 && t < p.t1) || M.plans[M.plans.length - 1];

// ------------------------------------------------------------------ outils
const pop = (t, t0, d = 0.26) => back(seg(t, t0, t0 + d), 1.9);
function bg(ctx, col) { ctx.fillStyle = col; ctx.fillRect(-3000, -3000, W + 6000, H + 6000); }
function cam(ctx, cx, cy, z = 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy); }
function coeur(cx, cy, s) { const pts = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; pts.push([cx + 16 * Math.sin(a) ** 3 * s, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s]); } return pts; }
function maison(ctx, cx, by, w, h, col, colD, seed) {
  const rh = w * 0.42;
  shape(ctx, rect(cx - w / 2, by - h, w, h), { fill: col, line: 3.6, seed, grain: 0.3, breaks: 0.22, shade: [{ pts: rect(cx + w * 0.18, by - h - 4, w * 0.4, h + 8), color: colD, alpha: 0.35 }] });
  shape(ctx, [[cx - w / 2 - 26, by - h + 4], [cx, by - h - rh], [cx + w / 2 + 26, by - h + 4]], { fill: colD, line: 3.6, seed: seed + 1, grain: 0.3, breaks: 0.2 });
  shape(ctx, rect(cx - w * 0.12, by - h * 0.46, w * 0.24, h * 0.46), { fill: C.paper, line: 3, seed: seed + 2, grain: 0.1 });
  shape(ctx, rect(cx - w * 0.38, by - h * 0.8, w * 0.18, w * 0.16), { fill: C.goldL, line: 3, seed: seed + 3, grain: 0.1 });
  shape(ctx, rect(cx + w * 0.2, by - h * 0.8, w * 0.18, w * 0.16), { fill: C.goldL, line: 3, seed: seed + 4, grain: 0.1 });
}
function bulle(ctx, t, t0, cx, cy, r, queue, nom) {
  const k = pop(t, t0, 0.3); if (k <= 0) return;
  const wob = Math.sin(twos(t) * 5 + cx) * 0.03;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob); ctx.scale(k, k); ctx.translate(-cx, -cy);
  [[0.22, 0.5], [0.12, 0.78]].forEach(([rr, u], i) => shape(ctx, ellipse(lerp(cx, queue[0], u), lerp(cy, queue[1], u), r * rr, r * rr, 18), { fill: C.white, line: 3.4, seed: 380 + i }));
  shape(ctx, ellipse(cx, cy, r, r * 0.92, 48), { fill: C.white, line: 4.2, seed: 383, grain: 0.15 });
  if (nom) picto(ctx, nom, cx, cy + 4, r * 1.15, t);
  else text(ctx, '?', cx, cy + r * 0.38, { font: `${Math.round(r * 1.05)}px Slab`, fill: C.ink, plate: C.goldL, off: [4, 3], align: 'center' });
  ctx.restore();
}
function medaillon(ctx, t, t0, x, y, r, interieur) {
  const k = pop(t, t0, 0.24); if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.rotate((1 - k) * 0.4);
  star(ctx, 0, 0, r * 1.22, { n: 16, inner: 0.84, fill: C.white, off: [0, 0] });
  shape(ctx, ellipse(0, 0, r, r, 64), { fill: C.gold, line: 5, seed: 730, grain: 0.3 });
  interieur(ctx, r);
  ctx.restore();
}
const interieurCoeur = (ctx, r) => shape(ctx, coeur(0, 4, r * 0.034), { fill: C.coral, line: 4.5, seed: 735, grain: 0.2 });
const interieurNumero = n => (ctx, r) => text(ctx, String(n), 0, r * 0.38, { font: `${Math.round(r * 1.1)}px Slab`, fill: C.ink, plate: C.white, off: [5, 5], align: 'center' });
function enTete(ctx, t, p) {
  const k = eo(seg(twos(t), p.t0 + 0.05, p.t0 + 0.45)); if (k <= 0) return;
  ctx.save(); ctx.translate(-(1 - k) * 700, 0);
  shape(ctx, ellipse(116, 196, 56, 56, 40), { fill: C.ink, line: 0, seed: 700, grain: 0.1, off: [0, 0] });
  text(ctx, String(p.numero), 116, 220, { font: '66px Slab', fill: C.paper, align: 'center' });
  text(ctx, `ÉTAPE ${p.numero} SUR 3`, 196, 210, { font: '600 34px Jost', fill: C.ink, track: 6 });
  ctx.restore();
}
function cercle(ctx, t, t0, cx, cy, r, interieur, fond) {
  const k = back(seg(t, t0, t0 + 0.32), 1.5); if (k <= 0) return;
  const R = r * k;
  shape(ctx, ellipse(cx, cy, R + 18, R + 18, 72), { fill: C.white, line: 4.5, seed: 720, grain: 0.15, breaks: 0.05 });
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  ctx.fillStyle = fond; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.translate(cx, cy); ctx.scale(k, k); interieur(ctx); ctx.restore();
  ink(ctx, ellipse(cx, cy, R, R, 72), 4, { closed: true, seed: 721, breaks: 0.1, color: C.ink });
}
// un avant-bras qui entre hors champ : manche en ruban, main gantée
function main(ctx, depuis, pos, a, forme, manche, k = 2) {
  const pts = [depuis, [lerp(depuis[0], pos[0], 0.5), lerp(depuis[1], pos[1], 0.5) + 10], [pos[0] - Math.cos(a) * 10 * k, pos[1] - Math.sin(a) * 10 * k]];
  const Q = spline(pts, false, 8);
  ink(ctx, Q, 26 * k * 0.9, { seed: 740, taper: false, wob: 0.06, color: C.ink });
  ink(ctx, move(Q, 3, 2), 17 * k * 0.9, { seed: 741, taper: false, wob: 0.05, color: manche });
  drawHand(ctx, pos[0], pos[1], a, forme, 1, k, '#F0C7A4');
}
// carte de texte : bloc papier, liseré d'encre décalé, étoile en puce
const CARTE = { x: 90, w: 900, px: 60 };
function carte(ctx, t, t0, str, y) {
  const k = pop(t, t0, 0.3); if (k <= 0) return null;
  const f = fit(ctx, str, '600 {px}px Jost', CARTE.px, CARTE.w - 150, 3, 40);
  const lh = f.px * 1.22, h = 60 + lh * f.lines.length;
  ctx.save(); ctx.translate(W / 2, y + h / 2); ctx.scale(k, k); ctx.translate(-W / 2, -(y + h / 2));
  shape(ctx, rrect(CARTE.x, y, CARTE.w, h, 22), { fill: C.white, line: 4, seed: 710, grain: 0.15, off: [7, 6] });
  star(ctx, CARTE.x + 52, y + 30 + lh * 0.5, 20, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0], rot: t * 0.6 });
  f.lines.forEach((l, i) => text(ctx, l, CARTE.x + 92, y + 30 + lh * (i + 0.5) + f.px * 0.34, { font: f.font, fill: C.ink }));
  ctx.restore();
  return { x0: CARTE.x, y0: y, x1: CARTE.x + CARTE.w, y1: y + h };
}
function titreHaut(ctx, t, t0, str) {
  const k = eo(seg(twos(t), t0, t0 + 0.4)); if (k <= 0) return;
  const f = fit(ctx, str, '{px}px Slab', 76, 960, 3, 48);
  const lh = f.px * 1.14;
  ctx.save(); ctx.translate(0, -(1 - k) * 260);
  const h = lh * f.lines.length + 70, haut = 210 - f.px * 0.95 - 30;
  shape(ctx, rrect(40, haut, 1000, h, 28), { fill: C.white, line: 4, seed: 712, grain: 0.15, off: [7, 6] });
  f.lines.forEach((l, i) => text(ctx, l, W / 2, 210 + i * lh, { font: f.font, fill: C.ink, plate: C.goldL, off: [5, 5], align: 'center', maxW: 1000 }));
  ctx.restore();
}

// ------------------------------------------------------------------ deux maisons (accroche et fin)
const SOL = 1330;
const REPOS_F = { a1: 1.36, a2: 1.5 }, REPOS_B = { a1: 1.78, a2: 1.64 };
const TEL_F = { a1: 1.85, a2: -2.35 }, TEL_B = { a1: 1.29, a2: -0.79 };
const HAUT_F = { a1: -0.95, a2: -1.25 }, HAUT_B = { a1: -2.19, a2: -1.89 };
// u : temps depuis le début de la fin (0 = accroche). Fin compressée : fusion 0→0,9 s, iris 0,9→1,4 s.
function maisons(ctx, t, u) {
  const fin = u > 0;
  const ouvre = fin ? eio(seg(u, 0.35, 0.9)) : 0, rapproche = fin ? eio(seg(u, 0, 0.5)) : 0;
  bg(ctx, C.paper);
  if (fin) rays(ctx, 540, 1000, 30, 1500, C.sageL, { alpha: 0.5 * ouvre, rot: 0.2 });
  const z = fin ? 1 : lerp(1, 1.04, ss(t / Math.max(3, P.accroche.t1)));
  ctx.save(); cam(ctx, 540, 1000, z);
  [[0, C.navyT, C.navyL, C.navyD, -1], [1, C.coralT, C.coralL, C.coralD, 1]].forEach(([i, mur, sol, sombre, sgn]) => {
    ctx.save(); ctx.translate(sgn * ouvre * 620, 0);
    const x0 = i ? 540 : -400, x1 = i ? 1480 : 540;
    plane(ctx, rect(x0, -400, x1 - x0, SOL + 400), mur);
    plane(ctx, rect(x0, SOL, x1 - x0, 1200), sol);
    ink(ctx, [[x0 + (i ? 30 : 40), SOL], [x1 - (i ? 40 : 30), SOL]], 4, { seed: 200 + i, breaks: 0.3, color: C.ink });
    maison(ctx, i ? 900 : 180, SOL - 4, 230, 210, i ? C.coralL : C.navyL, sombre, 210 + i * 10);
    ctx.restore();
  });
  if (!fin) ink(ctx, [[540, -100], [540, SOL + 600]], 5, { seed: 230, breaks: 0.25, color: C.ink });
  else plane(ctx, rect(-400, SOL, 1900, 1200), C.sageT, { alpha: ouvre });
  const tw = twos(t), heureux = fin;
  const cligne = b => [1.7, 3.9].some(x => tw > x + b && tw < x + b + 0.13) ? 1 : 0;
  const saut = fin ? -Math.abs(Math.sin(clamp(u / 0.5) * Math.PI * 2)) * 10 : 0;
  // les deux parents : mêmes gestes, mêmes expressions, aucun n'est désigné
  drawPerson(ctx, { ...KARIM, x: lerp(290, 345, rapproche), y: SOL + saut, s: 1.2, face: heureux ? 'happy' : 'worried', look: heureux ? [4, 0] : [6, 8], blink: cligne(0),
    armF: TEL_F, armB: REPOS_B, handF: 'grip', phone: 'F', screen: heureux ? 'week' : 'question' });
  drawPerson(ctx, { ...JULIE, x: lerp(790, 735, rapproche), y: SOL + saut, s: 1.2, face: heureux ? 'happy' : 'worried', look: heureux ? [-4, 0] : [-6, 8], blink: cligne(0.4),
    armB: TEL_B, armF: REPOS_F, handB: 'grip', phone: 'B', screen: heureux ? 'week' : 'question' });
  const regard = fin ? [0, -4] : tw < 1 ? [0, 0] : tw < 2 ? [-9, 2] : tw < 3 ? [9, 2] : [0, -3];
  const leve = fin ? (twos(u) >= 0.62 ? 1 : twos(u) >= 0.54 ? 0.5 : 0) : 0;
  const bond = fin ? -back(seg(u, 0.62, 0.8), 2) * 26 * (1 - seg(u, 0.8, 1.0)) : 0;
  drawPerson(ctx, { ...KID, x: 540, y: SOL + bond, s: 0.82, face: fin ? (leve ? 'happy' : 'neutral') : (tw > 3 ? 'wow' : 'neutral'), look: regard, blink: cligne(0.9),
    armF: armMix(REPOS_F, HAUT_F, leve), armB: armMix(REPOS_B, HAUT_B, leve), handF: 'open', handB: 'open' });
  if (!fin) {
    [[0.9, 290, 930], [1.6, 790, 930]].forEach(([tb, x, y], i) => { const k = seg(t, tb, tb + 0.35); if (k > 0 && k < 1) for (let j = 0; j < 3; j++) { const a = -2.4 + j * 0.5 + (i ? Math.PI * 0.55 : 0); ink(ctx, [[x + Math.cos(a) * 70, y + Math.sin(a) * 70], [x + Math.cos(a) * 92, y + Math.sin(a) * 92]], 4, { seed: 250 + j, color: C.ink, taper: false }); } });
    bulle(ctx, t, 0.6, 230, 545, 82, [280, 680], null);
    bulle(ctx, t, 1.3, 850, 545, 82, [800, 680], null);
    bulle(ctx, t, 2.0, 540, 720, 104, [540, 860], ligne('accroche').pictogramme);
  } else {
    const kc = pop(u, 0.66, 0.3);
    if (kc > 0) {
      ctx.save(); ctx.translate(540, 760); ctx.scale(kc, kc); shape(ctx, coeur(0, 0, 4.6), { fill: C.coral, line: 5, seed: 260 }); ctx.restore();
      [[430, 820, 26], [660, 790, 32], [470, 690, 20], [620, 680, 22]].forEach(([x, y, r], i) => sparkle(ctx, x, y, r * kc * (0.8 + 0.2 * Math.sin(twos(t) * 6 + i)), { fill: i % 2 ? C.gold : C.white }));
    }
  }
  ctx.restore();
  if (!fin) titreHaut(ctx, t, 0.15, ligne('accroche').texte);
}

// ------------------------------------------------------------------ les trois étapes
const ETAPES = [
  { fond: C.goldT, sol: C.goldL, cercle: C.goldL, manche: C.navy },
  { fond: C.navyT, sol: C.navyL, cercle: C.navyL, manche: C.coral },
  { fond: C.coralT, sol: C.coralL, cercle: C.coralL, manche: C.navy },
];
const CERCLE = { x: 540, y: 760, r: 250 };
const Y_CARTE = 1150;
function sceneEtape(ctx, t, p) {
  const e = ETAPES[p.numero - 1], l = ligne(p.id);
  bg(ctx, e.fond);
  plane(ctx, rect(-200, 1330, 1500, 900), e.sol);
  ctx.save(); cam(ctx, 540, 900, lerp(1, 1.04, ss(seg(t, p.t0, p.t1))));
  rays(ctx, CERCLE.x, CERCLE.y, 28, 900, C.white, { alpha: 0.35, rot: 0.1 + t * 0.03 });
  const tTape = p.voix.t + 0.55;
  cercle(ctx, t, p.t0 + 0.15, CERCLE.x, CERCLE.y, CERCLE.r, c2 => {
    const k = 1 + 0.06 * Math.sin(clamp(seg(t, tTape, tTape + 0.25)) * Math.PI);
    c2.scale(k, k); picto(c2, l.pictogramme, 0, 0, 300, t);
  }, e.cercle);
  // la main : entrée, recul (anticipation), toucher sur le temps, rebond, sortie
  const entre = eo(seg(t, tTape - 0.6, tTape - 0.2)), ant = ss(seg(t, tTape - 0.2, tTape - 0.05)), act = eo(seg(t, tTape - 0.05, tTape));
  const reb = Math.sin(clamp(seg(t, tTape, tTape + 0.2)) * Math.PI), part = ss(seg(t, tTape + 0.55, tTape + 1.0));
  if (entre > 0 && part < 1) {
    const bout = [CERCLE.x + CERCLE.r * 0.62, CERCLE.y + CERCLE.r * 0.62];
    const hx = lerp(1300, bout[0] + 80, entre) + ant * 40 - act * 40 + reb * 8 + part * 700;
    const hy = lerp(1750, bout[1] + 60, entre) + ant * 36 - act * 36 + reb * 6 + part * 600;
    main(ctx, [1260, 1820], [hx, hy], Math.atan2(-60, -80), 'point', e.manche, 2.2);
  }
  const anneau = seg(t, tTape, tTape + 0.45);
  if (anneau > 0 && anneau < 1) ink(ctx, ellipse(CERCLE.x, CERCLE.y, CERCLE.r + 30 + anneau * 70, CERCLE.r + 30 + anneau * 70, 60), 6 * (1 - anneau), { closed: true, seed: 880, color: C.ink });
  if (t > tTape && t < tTape + 0.6) [[-1, -1], [1, -0.7], [0.8, 1]].forEach(([dx, dy], i) => sparkle(ctx, CERCLE.x + dx * (CERCLE.r + 40), CERCLE.y + dy * (CERCLE.r + 30), 26 * (1 - seg(t, tTape, tTape + 0.6)), { fill: i % 2 ? C.gold : C.white }));
  carte(ctx, t, p.voix.t, l.texte, Y_CARTE);
  ctx.restore();
  enTete(ctx, t, p);
}

// ------------------------------------------------------------------ ce que l'application apporte
function ecranAppli(ctx, sx, sy, sw) {
  const k = sw / 360;
  ctx.fillStyle = C.sage; ctx.fillRect(sx, sy, sw, 92 * k);
  text(ctx, 'Cette semaine', sx + 24 * k, sy + 60 * k, { font: `600 ${Math.round(30 * k)}px Jost`, fill: C.white });
  const g = 8 * k, cw = (sw - 48 * k - g * 6) / 7;
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, i) => {
    const x = sx + 24 * k + i * (cw + g), y = sy + 128 * k;
    shape(ctx, rrect(x, y, cw, 92 * k, 8 * k), { fill: i < 4 ? C.navy : C.coral, line: 2.4, seed: 600 + i, grain: 0.2, off: [3, 2] });
    text(ctx, d, x + cw / 2, y + 60 * k, { font: `600 ${Math.round(28 * k)}px Jost`, fill: C.white, align: 'center' });
  });
  [['Planning', C.coral], ['Dépenses', C.sage], ['Documents', C.gold]].forEach(([a, dot], i) => {
    const y = sy + (252 + i * 112) * k;
    shape(ctx, rrect(sx + 24 * k, y, sw - 48 * k, 92 * k, 12 * k), { fill: C.paper, line: 2.4, seed: 610 + i, grain: 0.1, off: [3, 2] });
    shape(ctx, ellipse(sx + 58 * k, y + 46 * k, 13 * k, 13 * k, 16), { fill: dot, line: 2, seed: 620 + i, grain: 0 });
    text(ctx, a, sx + 86 * k, y + 56 * k, { font: `600 ${Math.round(26 * k)}px Jost`, fill: C.ink });
  });
}
function sceneApport(ctx, t, p) {
  bg(ctx, C.paper);
  rays(ctx, 540, 960, 30, 1500, C.sageL, { alpha: 0.55, rot: t * 0.04 });
  ctx.save(); cam(ctx, 540, 960, lerp(1, 1.035, ss(seg(t, p.t0, p.t1))));
  const ec = clamp(seg(t, p.t0 + 0.4, p.t0 + 1.2));
  if (ec > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, 140, 60 + ec * 980, 240); ctx.clip();
    text(ctx, 'Avec Coparentalité Zen', 540, 290, { font: '700 92px Oleo', fill: C.ink, plate: C.sage, off: [6, 5], align: 'center', maxW: 1000 }); ctx.restore(); }
  const kp = pop(t, p.t0 + 0.3, 0.34);
  if (kp > 0) { ctx.save(); ctx.translate(540, 860); ctx.scale(kp, kp); ctx.rotate(-0.035);
    shape(ctx, rrect(-200 + 14, -340 + 18, 400, 680, 66), { fill: C.paperD, line: 0, off: [0, 0], grain: 0.1, alpha: 0.6 });
    drawPhone(ctx, 0, 0, 400, 680, { screen: (c2, sx, sy, sw) => ecranAppli(c2, sx, sy, sw) }); ctx.restore(); }
  const l = ligne('apport');
  cercle(ctx, t, p.voix.t + 0.4, 850, 1180, 120, c2 => picto(c2, l.pictogramme, 0, 0, 170, t), C.sageT);
  ctx.restore();
}

// ------------------------------------------------------------------ fin : iris sur l'enfant, logo officiel, adresse
const LOGO_C = [540, 860], LOGO_ANNEAU = 360, LOGO_TAILLE = 1254 * LOGO_ANNEAU / 591;
function sceneFin(ctx, t) {
  const f = M.fin;
  if (t < f.logo) return maisons(ctx, t, Math.max(1e-3, t - f.t0));
  bg(ctx, C.paper);
  rays(ctx, LOGO_C[0], LOGO_C[1], 30, 1600, C.sageL, { alpha: 0.6, rot: 0.2 + Math.min(t - f.logo, 1) * 0.02 });
  const kp = pop(t, f.logo + 0.05, 0.3);
  if (kp > 0) { ctx.save(); ctx.translate(540, 300); ctx.scale(kp, kp);
    shape(ctx, rrect(-300, -46, 600, 92, 46), { fill: C.white, line: 4, seed: 1100, grain: 0.15, off: [5, 4] });
    star(ctx, -250, 0, 18, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0] }); star(ctx, 250, 0, 18, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0] });
    text(ctx, SC.fin.puce, 0, 14, { font: '600 40px Jost', fill: C.ink, align: 'center', maxW: 440 }); ctx.restore(); }
  const ks = pop(t, f.site, 0.3);
  if (ks > 0) { ctx.save(); ctx.translate(540, 1352); ctx.scale(ks, ks);
    text(ctx, SC.fin.site, 0, 0, { font: '66px Slab', fill: C.ink, plate: C.goldL, off: [5, 4], align: 'center', maxW: 980 }); ctx.restore(); }
}
// dessiné après le grain de papier : le logo reste intact, puis le masque d'iris
function surcoucheFin(ctx, t) {
  const f = M.fin, ti = f.logo - 0.5;
  if (t < ti) return;
  const k = eio(seg(t, ti, f.logo));
  const de = [540, SOL - 0.82 * 330];
  const cx = lerp(de[0], LOGO_C[0], k), cy = lerp(de[1], LOGO_C[1], k), r = lerp(980, LOGO_ANNEAU, k);
  if (t >= f.logo && LOGO) ctx.drawImage(LOGO, LOGO_C[0] - LOGO_TAILLE / 2, LOGO_C[1] - LOGO_TAILLE / 2, LOGO_TAILLE, LOGO_TAILLE);
  const rOut = t < f.logo ? r : lerp(LOGO_ANNEAU + 2, 1500, eo(seg(t, f.logo + 0.05, f.logo + 0.45)));
  if (rOut < 1450) {
    ctx.save(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20); ctx.arc(cx, cy, t < f.logo ? r : rOut, 0, TAU, true); ctx.fill(); ctx.restore();
    if (t < f.logo) ink(ctx, ellipse(cx, cy, r, r, 90), 7, { closed: true, seed: 960, color: C.sage });
  }
}

// ------------------------------------------------------------------ sous-titres incrustés
// Accroche et étapes : le texte prononcé est déjà à l'image (titre, carte) ; la carte de sous-titre
// n'est dessinée que pour l'apport, pour ne pas écrire deux fois la même phrase.
const SANS_CARTE = new Set(['accroche', 'etape']);
function sousTitre(ctx, t) {
  const p = M.plans.find(q => q.sousTitre && t >= q.sousTitre.t0 && t < q.sousTitre.t1);
  if (!p || SANS_CARTE.has(p.role)) return;
  const s = p.sousTitre;
  const a = Math.min(ss(seg(t, s.t0, s.t0 + 0.16)), 1 - ss(seg(t, s.t1 - 0.16, s.t1)));
  const f = fit(ctx, s.texte, '500 {px}px Jost', 46, 880, 3, 34);
  const w = Math.max(...f.lines.map(l => measure(ctx, l, f.font))) + 130, lh = f.px * 1.25, h = 40 + lh * f.lines.length, x = W / 2 - w / 2, y = CAP_BOTTOM - h;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 10);
  shape(ctx, rrect(x, y, w, h, 16), { fill: C.white, line: 3.2, seed: 901, grain: 0.15, breaks: 0.08, off: [5, 5] });
  star(ctx, x + 34, y + h / 2, 15, { n: 8, inner: 0.4, fill: C.gold, off: [0, 0], rot: t * 0.8 });
  star(ctx, x + w - 34, y + h / 2, 15, { n: 8, inner: 0.4, fill: C.gold, off: [0, 0], rot: -t * 0.8 });
  f.lines.forEach((l, i) => text(ctx, l, W / 2, y + 20 + lh * (i + 0.5) + f.px * 0.34, { font: f.font, fill: C.ink, align: 'center' }));
  ctx.restore();
}

/** Tous les textes visibles à t, pour readcheck.mjs (texte complet dès la première image). */
export function texts(t) {
  const out = [], p = plan(t);
  if (p.role === 'accroche' && t >= 0.15) out.push({ id: 'accroche', text: ligne('accroche').texte, x0: 40, y0: 120, x1: 1040, y1: 470 });
  if (p.role === 'etape') {
    out.push({ id: 'entete' + p.numero, text: `ÉTAPE ${p.numero} SUR 3`, x0: 60, y0: 140, x1: 700, y1: 250 });
    if (t >= p.voix.t + 0.3) out.push({ id: 'carte' + p.numero, text: ligne(p.id).texte, x0: CARTE.x, y0: Y_CARTE, x1: CARTE.x + CARTE.w, y1: Y_CARTE + 300 });
  }
  if (p.role === 'apport') {
    if (t >= p.t0 + 1.2) out.push({ id: 'kicker', text: 'Avec Coparentalité Zen', x0: 40, y0: 160, x1: 1040, y1: 360 });
    const s = p.sousTitre; if (t >= s.t0 && t < s.t1) out.push({ id: 'st-apport', text: s.texte, x0: 100, y0: 1300, x1: 980, y1: CAP_BOTTOM });
  }
  if (p.role === 'fin') {
    if (t >= M.fin.logo + 0.35) out.push({ id: 'puce', text: SC.fin.puce, x0: 240, y0: 254, x1: 840, y1: 346 });
    if (t >= M.fin.site + 0.3) out.push({ id: 'site', text: SC.fin.site, x0: 60, y0: 1290, x1: 1020, y1: 1380 });
  }
  return out;
}

// ------------------------------------------------------------------ rendu et transitions
function dessinerPlan(ctx, t, p) {
  ctx.save();
  if (p.role === 'accroche') maisons(ctx, t, 0);
  else if (p.role === 'etape') sceneEtape(ctx, t, p);
  else if (p.role === 'apport') sceneApport(ctx, t, p);
  else sceneFin(ctx, t);
  ctx.restore();
}
function iris(ctx, t, ta, tb, avant, apres, foyer) {
  const k = eio(seg(t, ta, tb));
  dessinerPlan(ctx, avant.t1 - 1e-3, avant);
  const cx = lerp(foyer[0], W / 2, k), cy = lerp(foyer[1], H / 2, k), r = lerp(110, 1250, k * k);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); dessinerPlan(ctx, Math.max(t, apres.t0 + 1e-3), apres); ctx.restore();
  ink(ctx, ellipse(cx, cy, r, r, 90), 7, { closed: true, seed: 965, color: C.ink });
}
function volet(ctx, t, d, avant, apres, sens) {
  const k = eio(seg(t, apres.t0, apres.t0 + d));
  dessinerPlan(ctx, avant.t1 - 1e-3, avant);
  ctx.save(); ctx.beginPath();
  if (sens === 'haut') ctx.rect(0, H * (1 - k), W, H); else ctx.rect(0, 0, W * k, H);
  ctx.clip(); dessinerPlan(ctx, t, apres); ctx.restore();
  if (sens === 'haut') ink(ctx, [[-10, H * (1 - k)], [W + 10, H * (1 - k)]], 6, { seed: 963, color: C.ink });
  else ink(ctx, [[W * k, -10], [W * k, H + 10]], 6, { seed: 964, color: C.ink });
}
const TAMPON = 0.42, IRIS = 0.45, VOLET = 0.32;
export function renderFilm(ctx, t, Q) {
  setClock(t);
  const p = plan(t), A = P.accroche, E1 = P.e1, E2 = P.e2, E3 = P.e3, AP = P.apport;
  ctx.save();
  if (p === A && t >= A.t1 - TAMPON) { dessinerPlan(ctx, t, A); medaillon(ctx, t, A.t1 - TAMPON, 540, 640, 110, interieurNumero(1)); }
  else if (p === E1 && t < E1.t0 + IRIS) iris(ctx, t, E1.t0, E1.t0 + IRIS, A, E1, [540, 640]);
  else if (p === E2 && t < E2.t0 + VOLET) volet(ctx, t, VOLET, E1, E2, 'haut');
  else if (p === E3 && t < E3.t0 + VOLET) volet(ctx, t, VOLET, E2, E3, 'cote');
  else if (p === E3 && t >= E3.t1 - TAMPON) { dessinerPlan(ctx, t, E3); medaillon(ctx, t, E3.t1 - TAMPON, CERCLE.x, CERCLE.y, 120, interieurCoeur); }
  else if (p === AP && t < AP.t0 + IRIS) iris(ctx, t, AP.t0, AP.t0 + IRIS, E3, AP, [CERCLE.x, CERCLE.y]);
  else dessinerPlan(ctx, t, p);
  ctx.restore();
  paperFinish(ctx, W, H, 0.9);
  if (p.role === 'fin') surcoucheFin(ctx, t);
  if (!(Q && Q.has('nosubs'))) sousTitre(ctx, t);
}

// ------------------------------------------------------------------ événements sonores (les mêmes instants que l'image)
function construireEvenements() {
  EVS = []; const ev = (t, type, o = {}) => EVS.push({ t: +t.toFixed(4), type, ...o });
  for (const p of M.plans) if (p.voix) ev(p.voix.t, 'vo', { id: p.id });
  const A = P.accroche;
  ev(0.0, 'pop', { gain: 0.4 }); ev(0.15, 'slide', { gain: 0.5 });
  ev(0.6, 'bulle', { pan: -0.4 }); ev(1.3, 'bulle', { pan: 0.4, hauteur: 1 }); ev(2.0, 'bulle', { pan: 0, hauteur: 2 });
  ev(0.9, 'vibre', { pan: -0.4 }); ev(1.6, 'vibre', { pan: 0.4 });
  // le silence avant le premier tampon : c'est lui, le premier son de la démonstration
  ev(A.t1 - TAMPON - 0.5, 'silence', { duree: 0.5 });
  ev(A.t1 - TAMPON, 'tampon'); ev(A.t1, 'iris', { dur: IRIS });
  ['e1', 'e2', 'e3'].forEach((id, i) => {
    const p = P[id], tTape = p.voix.t + 0.55;
    if (i > 0) { ev(p.t0, 'papier'); ev(p.t0 + 0.05, 'slide', { gain: 0.6 }); }
    ev(p.t0, 'accord', { n: i });
    ev(p.t0 + 0.15, 'pop', { gain: 0.6 });
    ev(tTape - 0.6, 'whoosh', { dur: 0.35, gain: 0.35 }); ev(tTape, 'tap'); ev(tTape + 0.02, 'pop', { gain: 0.4 });
    ev(p.voix.t, 'pop', { gain: 0.5 }); ev(p.voix.t + 0.3, 'ding', { gain: 0.45 });
  });
  const E3 = P.e3, AP = P.apport, F = M.fin;
  ev(E3.t1 - TAMPON, 'tampon'); ev(AP.t0, 'iris', { dur: IRIS });
  ev(AP.t0 + 0.4, 'stylo', { dur: 0.8 }); ev(AP.t0 + 0.3, 'pop', { gain: 0.6 }); ev(AP.voix.t + 0.4, 'pop', { gain: 0.5 });
  ev(F.t0 - 0.5, 'silence', { duree: 0.5 });
  ev(F.t0, 'whoosh', { dur: 0.5, gain: 0.5 }); ev(F.t0 + 0.35, 'papier', { pan: -0.5 }); ev(F.t0 + 0.4, 'papier', { pan: 0.5 });
  ev(F.t0 + 0.66, 'pop', { gain: 0.7 }); ev(F.t0 + 0.7, 'etincelle');
  ev(F.logo - 0.5, 'iris', { dur: 0.5 }); ev(F.logo, 'ding', { gain: 0.8 }); ev(F.logo, 'logo');
  ev(F.logo + 0.05, 'pop', { gain: 0.5 }); ev(F.site, 'pop', { gain: 0.5 });
  EVS.sort((a, b) => a.t - b.t);
}
