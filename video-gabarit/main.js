// Contrat de page Lemo-Opuscar : window.READY, window.render(t), window.DUR, window.EV, window.TEXTS
// Le dossier de rendu contient scenario.json (écrit par scripts/videos) et voices/dur.json (synthèse vocale).
import { textures } from './engine/toon.js';
const Q = new URLSearchParams(location.search);
const cv = document.getElementById('c'), g = cv.getContext('2d');
cv.width = innerWidth; cv.height = innerHeight;
await Promise.all(['700 80px Oleo', '400 80px Oleo', '80px Slab', '400 40px Jost', '500 40px Jost', '600 40px Jost'].map(f => document.fonts.load(f)));
textures();
const scenario = await (await fetch('scenario.json')).json();
const durees = await (await fetch('voices/dur.json')).json();
const logo = new Image(); logo.src = 'assets/logo.png'; await logo.decode();
const film = await import('./film.js');
film.setup(scenario, durees, logo);
window.DUR = film.duree(); window.EV = film.events(); window.SRT = film.subs(); window.MINUTAGE = film.minutage();
window.TEXTS = t => film.texts(t);
const sx = cv.width / film.W, sy = cv.height / film.H;
window.render = t => { g.setTransform(sx, 0, 0, sy, 0, 0); film.renderFilm(g, t, Q); };
window.READY = true;
