// Pictogrammes du gabarit, dessinés dans une boîte de 200 unités centrée sur l'origine.
// Même grammaire que le moteur : aplats décalés de leur trait, trait cassé, une seule ombre plate.
import { shape, ink, ellipse, rect, rrect, spline, star, sparkle, text, TAU } from './engine/toon.js';
import { C } from './engine/chars.js';

const L = 6;
const ombre = (pts, col, a = 0.35) => [{ pts, color: col, alpha: a }];

const DESSINS = {
  calendrier() {
    shape(this, rrect(-74, -64, 148, 138, 16), { fill: C.white, line: L, seed: 301 });
    shape(this, rrect(-74, -64, 148, 40, 12), { fill: C.coral, line: 0, seed: 302, off: [0, 0], grain: 0.1 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
      shape(this, rect(-52 + c * 28, -8 + r * 25, 18, 15), { fill: (r + c) % 2 ? C.navy : C.coral, line: 0, grain: 0, seed: 303 + r * 4 + c });
    [-38, 38].forEach((x, i) => ink(this, [[x, -82], [x, -54]], 7, { seed: 320 + i, taper: false, color: C.ink }));
  },
  soleil(t = 0) {
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.6; ink(this, [[Math.cos(a) * 58, Math.sin(a) * 58], [Math.cos(a) * 86, Math.sin(a) * 86]], 7, { seed: 340 + i, color: C.ink, taper: false }); }
    shape(this, ellipse(0, 0, 48, 48, 32), { fill: C.gold, line: 5, seed: 351, shade: ombre(ellipse(14, 14, 48, 48, 32), C.goldD) });
  },
  sac() {
    shape(this, rrect(-72, -40, 144, 110, 22), { fill: C.navy, line: L, seed: 361, shade: ombre(rect(20, -40, 52, 110), C.navyD) });
    ink(this, spline([[-34, -40], [-30, -84], [30, -84], [34, -40]], false, 8), 9, { seed: 362, color: C.ink, taper: false });
    shape(this, rrect(-40, -6, 80, 36, 10), { fill: C.coralL, line: 4, seed: 363 });
  },
  euro() {
    shape(this, ellipse(0, 0, 70, 70, 40), { fill: C.gold, line: L, seed: 330, shade: ombre(ellipse(14, 14, 70, 70, 40), C.goldD, 0.4) });
    text(this, '€', 0, 34, { font: '96px Slab', fill: C.ink, align: 'center' });
  },
  recu() {
    const zig = []; for (let i = 0; i <= 8; i++) zig.push([-60 + i * 15, 82 + (i % 2) * 10]);
    shape(this, [[-60, -86], [60, -86], ...zig.reverse()], { fill: C.white, line: L, seed: 920 });
    for (let i = 0; i < 3; i++) ink(this, [[-38, -46 + i * 26], [38 - i * 12, -46 + i * 26]], 5, { seed: 921 + i, color: C.navyL, taper: false });
    shape(this, ellipse(0, 46, 20, 20, 18), { fill: C.coral, line: 4, seed: 925 });
  },
  cartable() {
    shape(this, rrect(-78, -46, 156, 120, 18), { fill: C.coral, line: L, seed: 371, shade: ombre(rect(22, -46, 56, 120), C.coralD) });
    shape(this, rrect(-78, -46, 156, 46, 18), { fill: C.coralD, line: 4, seed: 372 });
    shape(this, rrect(-14, -12, 28, 24, 6), { fill: C.gold, line: 4, seed: 373 });
    ink(this, spline([[-30, -46], [-26, -80], [26, -80], [30, -46]], false, 8), 9, { seed: 374, color: C.ink, taper: false });
  },
  trousse() {
    shape(this, rrect(-80, -54, 160, 118, 20), { fill: C.white, line: L, seed: 381 });
    shape(this, [[-16, -34], [16, -34], [16, -6], [44, -6], [44, 26], [16, 26], [16, 54], [-16, 54], [-16, 26], [-44, 26], [-44, -6], [-16, -6]],
      { fill: C.coral, line: 4, seed: 382 });
    ink(this, spline([[-26, -54], [-22, -82], [22, -82], [26, -54]], false, 8), 8, { seed: 383, color: C.ink, taper: false });
  },
  dossier() {
    shape(this, [[-84, -56], [-26, -56], [-12, -40], [84, -40], [84, 66], [-84, 66]], { fill: C.goldL, line: L, seed: 391 });
    shape(this, rrect(-60, -60, 110, 70, 6), { fill: C.white, line: 4, seed: 392 });
    shape(this, [[-84, -20], [84, -20], [84, 66], [-84, 66]], { fill: C.gold, line: L, seed: 393, shade: ombre(rect(30, -20, 54, 86), C.goldD) });
  },
  bulle() {
    shape(this, spline([[-80, -50], [0, -78], [80, -50], [84, 20], [30, 46], [-6, 82], [-14, 46], [-80, 20]], true, 8), { fill: C.white, line: L, seed: 401 });
    [-34, 0, 34].forEach((x, i) => shape(this, ellipse(x, -8, 11, 11, 14), { fill: C.navy, line: 0, seed: 402 + i, grain: 0 }));
  },
  cle() {
    shape(this, ellipse(-42, 0, 42, 42, 30), { fill: C.gold, line: L, seed: 411 });
    shape(this, ellipse(-42, 0, 14, 14, 16), { fill: C.paper, line: 4, seed: 412 });
    shape(this, [[0, -10], [88, -10], [88, 10], [72, 10], [72, 32], [56, 32], [56, 10], [0, 10]], { fill: C.gold, line: L, seed: 413 });
  },
  maisons() {
    [[-44, C.navyL, C.navyD, 421], [44, C.coralL, C.coralD, 425]].forEach(([x, col, colD, s]) => {
      shape(this, rect(x - 38, -10, 76, 72), { fill: col, line: 5, seed: s });
      shape(this, [[x - 52, -6], [x, -60], [x + 52, -6]], { fill: colD, line: 5, seed: s + 1 });
      shape(this, rect(x - 11, 26, 22, 36), { fill: C.paper, line: 4, seed: s + 2 });
    });
  },
  train() {
    shape(this, rrect(-70, -74, 140, 130, 28), { fill: C.sage, line: L, seed: 431, shade: ombre(rect(26, -74, 44, 130), C.sageD) });
    shape(this, rrect(-50, -54, 100, 46, 10), { fill: C.white, line: 4, seed: 432 });
    [-36, 36].forEach((x, i) => shape(this, ellipse(x, 24, 13, 13, 14), { fill: C.gold, line: 4, seed: 433 + i }));
    ink(this, [[-54, 80], [-74, 96]], 6, { seed: 436, color: C.ink, taper: false }); ink(this, [[54, 80], [74, 96]], 6, { seed: 437, color: C.ink, taper: false });
  },
  horloge(t = 0) {
    shape(this, ellipse(0, 0, 82, 82, 48), { fill: C.white, line: L, seed: 441 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ink(this, [[Math.cos(a) * 62, Math.sin(a) * 62], [Math.cos(a) * 70, Math.sin(a) * 70]], 4, { seed: 442 + i, color: C.ink, taper: false }); }
    const a = -Math.PI / 2 + t * 0.8;
    ink(this, [[0, 0], [0, -50]], 8, { seed: 455, color: C.ink, taper: false });
    ink(this, [[0, 0], [Math.cos(a) * 58, Math.sin(a) * 58]], 5, { seed: 456, color: C.coralD, taper: false });
    shape(this, ellipse(0, 0, 9, 9, 10), { fill: C.coral, line: 0, seed: 457 });
  },
  gateau() {
    shape(this, rrect(-80, -6, 160, 76, 12), { fill: C.coralL, line: L, seed: 461 });
    ink(this, spline([[-80, 14], [-50, 30], [-20, 12], [10, 30], [40, 12], [80, 28]], false, 8), 8, { seed: 462, color: C.white, taper: false });
    [-40, 0, 40].forEach((x, i) => {
      shape(this, rect(x - 7, -52, 14, 46), { fill: [C.navy, C.gold, C.sage][i], line: 3.5, seed: 463 + i });
      shape(this, spline([[x, -82], [x + 9, -64], [x, -54], [x - 9, -64]], true, 6), { fill: C.gold, line: 3, seed: 467 + i });
    });
  },
  stylo() {
    shape(this, rrect(-62, -76, 108, 150, 10), { fill: C.white, line: L, seed: 471 });
    for (let i = 0; i < 4; i++) ink(this, [[-42, -46 + i * 28], [24 - (i % 2) * 18, -46 + i * 28]], 5, { seed: 472 + i, color: C.navyL, taper: false });
    this.save(); this.translate(40, 20); this.rotate(0.7);
    shape(this, rect(-12, -76, 24, 112), { fill: C.coral, line: 4.5, seed: 477 });
    shape(this, [[-12, 36], [12, 36], [0, 62]], { fill: C.goldL, line: 4.5, seed: 478 });
    this.restore();
  },
  photo() {
    shape(this, rrect(-84, -48, 168, 112, 18), { fill: C.navy, line: L, seed: 481, shade: ombre(rect(30, -48, 54, 112), C.navyD) });
    shape(this, rrect(-38, -70, 60, 26, 8), { fill: C.navyD, line: 4, seed: 482 });
    shape(this, ellipse(0, 8, 38, 38, 32), { fill: C.white, line: 5, seed: 483 });
    shape(this, ellipse(0, 8, 20, 20, 24), { fill: C.sage, line: 4, seed: 484 });
  },
  coche() {
    shape(this, ellipse(0, 0, 80, 80, 48), { fill: C.sage, line: L, seed: 491 });
    ink(this, [[-36, 0], [-8, 28], [40, -30]], 16, { seed: 492, color: C.white, taper: false });
  },
  liste() {
    shape(this, rrect(-66, -82, 132, 164, 12), { fill: C.white, line: L, seed: 501 });
    for (let i = 0; i < 3; i++) {
      shape(this, rrect(-46, -48 + i * 40, 22, 22, 4), { fill: i < 2 ? C.sage : C.paper, line: 3.5, seed: 502 + i });
      ink(this, [[-12, -37 + i * 40], [44, -37 + i * 40]], 5, { seed: 506 + i, color: C.navyL, taper: false });
    }
  },
  oeil() {
    shape(this, spline([[-88, 0], [0, -56], [88, 0], [0, 56]], true, 10), { fill: C.white, line: L, seed: 511 });
    shape(this, ellipse(0, 0, 32, 32, 30), { fill: C.navy, line: 4, seed: 512 });
    shape(this, ellipse(0, 0, 13, 13, 16), { fill: C.ink, line: 0, seed: 513, grain: 0 });
    sparkle(this, 10, -12, 9, { fill: C.white });
  },
  epingle() {
    shape(this, ellipse(0, -30, 54, 54, 40), { fill: C.coral, line: L, seed: 521, shade: ombre(ellipse(12, -18, 54, 54, 40), C.coralD) });
    shape(this, [[-24, 14], [24, 14], [0, 86]], { fill: C.coralD, line: 5, seed: 522 });
    shape(this, ellipse(0, -30, 18, 18, 18), { fill: C.white, line: 4, seed: 523 });
  },
};

export const NOMS = Object.keys(DESSINS);

/** Dessine le pictogramme `nom` centré en (cx, cy), à la taille `size` (pixels). */
export function picto(ctx, nom, cx, cy, size, t = 0) {
  const f = DESSINS[nom] || DESSINS.calendrier;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 200, size / 200);
  f.call(ctx, t);
  ctx.restore();
}
export const etoile = star;
