"""Partition originale, calculée pour chaque vidéo : combo de jazz cool West-Coast, 120 BPM, swing.
vibraphone (accompagnement + un accord par étape) / flûte (mélodie de l'apport) / contrebasse en pizzicato (walking) / balais et claquements (synthèse).

    LIB=<bibliothèque> $LIB/.venv/bin/python music/score.py <dossier>   → <dossier>/music/score.wav

Lit <dossier>/events.json (exporté par la page) : la même chronologie que l'image.
  'silence'  : tout s'arrête pendant `duree` (le premier son après est le tampon) ;
  'accord'   : l'accord propre à l'étape n, frappé sur son premier temps ;
  'logo'     : l'accord final, en trémolo, jusqu'à la fin.
Trois ambiances (scenario.json « ambiance ») : la même grille transposée, pour que deux vidéos voisines ne sonnent pas pareil.
Déterministe : la graine du scénario fixe les round-robins et le grain des balais."""
import os, sys, json, math
LIB = os.environ['LIB']; sys.path.insert(0, LIB)
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
from core.audio import sampler as S
from core.audio.sfx import SR, add, limit

D = os.path.abspath(sys.argv[1])
E = json.load(open(os.path.join(D, 'events.json')))
SC = json.load(open(os.path.join(D, 'scenario.json')))
DUR = float(E['dur']); N = int(math.ceil(DUR * SR)); EV = E['ev']
S.seed(SC['graine'] % 100000); rng = np.random.default_rng(SC['graine'] % 100000)
TRANSPO = [0, -2, 2][SC.get('ambiance', 0)]
B = 0.5; BAR = 4 * B; SW = 0.62
stems = {k: np.zeros((N, 2), np.float32) for k in ('drums', 'bass', 'vib', 'lead')}

SIL = [(e['t'], e['t'] + e.get('duree', 0.5)) for e in EV if e['type'] == 'silence']
def OK(t): return 0 <= t < DUR - 0.05 and not any(a - 0.02 <= t < b for a, b in SIL)
def T(bar, beat=0.0):
    whole = math.floor(beat + 1e-9); frac = beat - whole
    if abs(frac - .5) < 1e-6: frac = SW
    return (bar - 1) * BAR + (whole + frac) * B
def M(p): return (S.midi(p) if isinstance(p, str) else p) + TRANSPO
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def motor(x, depth=.3, rate=5.0):
    tt = np.arange(len(x)) / SR; return (x * (1 - depth * (.5 + .5 * np.sin(2 * np.pi * rate * tt)))).astype(np.float32)
def vib(t, pitches, dur, vel=.45, trem=0.0, gain=1.0, pan=-.25, hard=False, force=False):
    if not (force or OK(t)): return
    for i, p in enumerate(pitches):
        x = S.note('vibraphone_hard' if hard else 'vibraphone', M(p), dur, vel=vel)
        if trem: x = motor(x, trem)
        add(stems['vib'], x, t + i * 0.006, gain, pan + (i - 1.5) * .1)
def bass(t, p, dur=.45, vel=.7, force=False):
    if not (force or OK(t)): return
    add(stems['bass'], S.note('jazz_bass', M(p), dur, vel=vel), t, 1.0, 0.05)
def flute(t, p, beats, vel=.5):
    if not OK(t): return
    add(stems['lead'], S.note('flute', M(p), max(.15, beats * B * .9), vel=vel, release=.1), t - .02, 1.0, .2)
def brush(t, accent=False):
    if not OK(t): return
    d = .16 if accent else .22; tt = np.arange(int(d * SR)) / SR
    x = bp(rng.standard_normal(len(tt)), 2500, 9000) * (np.exp(-tt / (.03 if accent else .09)))
    add(stems['drums'], x.astype(np.float32), t, .16 if accent else .07, .3 if accent else -.3)
def snap(t):
    if not OK(t): return
    d = .08; tt = np.arange(int(d * SR)) / SR
    x = bp(rng.standard_normal(len(tt)), 1500, 5000) * np.exp(-tt / .012) + np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt / .006) * .4
    add(stems['drums'], x.astype(np.float32), t, .22, .45)

CH = {
    'F6': (['A3', 'D4', 'F4', 'C5'], 'F2'), 'Fmaj7': (['A3', 'E4', 'G4', 'C5'], 'F2'), 'Fmaj9': (['A3', 'E4', 'G4', 'C5'], 'F2'),
    'Dm7': (['F3', 'C4', 'E4', 'A4'], 'D2'), 'Dm9': (['F3', 'C4', 'E4', 'A4'], 'D2'), 'Gm7': (['F3', 'Bb3', 'D4', 'A4'], 'G2'),
    'Gm9': (['F3', 'Bb3', 'D4', 'A4'], 'G2'), 'C7': (['E3', 'Bb3', 'D4', 'G4'], 'C2'), 'C13': (['E3', 'Bb3', 'D4', 'A4'], 'C2'),
}
CYCLE = [['F6'], ['Gm7', 'C7'], ['Fmaj7'], ['Dm7'], ['Gm7', 'C7'], ['Fmaj9'], ['Dm7'], ['Gm7', 'C7']]
NB = int(math.ceil(DUR / BAR)) + 1
BARS = {b: CYCLE[(b - 1) % len(CYCLE)] for b in range(1, NB + 1)}

# ---- contrebasse : fondamentale sur 1, notes de l'accord, approche chromatique vers la mesure suivante
for bar in range(1, NB):
    cs = BARS[bar]; nxt = S.midi(CH[BARS[bar + 1][0]][1])
    if len(cs) == 1:
        r = S.midi(CH[cs[0]][1]); walk = [r, r + (3 if cs[0].startswith(('D', 'G')) else 4), r + 7, nxt + (1 if (nxt - r) % 12 < 6 else -1)]
    else:
        a, b = S.midi(CH[cs[0]][1]), S.midi(CH[cs[1]][1]); walk = [a, a + 7, b, nxt + 1]
    for k, p in enumerate(walk):
        if T(bar, k) < DUR - 3.5: bass(T(bar, k), p, .44, .72 if k == 0 else .6)
# ---- balais à chaque temps, accent sur 2 et 4 ; claquements de doigts pendant l'apport
apport = next((e['t'] for e in EV if e['type'] == 'iris'), 0)
apports = [e['t'] for e in EV if e['type'] == 'iris']
t_apport = apports[1] if len(apports) > 1 else DUR
fin = next((e['t'] for e in EV if e['type'] == 'logo'), DUR - 3)
for bar in range(1, NB + 1):
    for k in range(4):
        if T(bar, k) > fin: continue
        brush(T(bar, k)); brush(T(bar, k + .5))
        if k in (1, 3): brush(T(bar, k), True)
        if k in (1, 3) and t_apport <= T(bar, k) < fin - 1: snap(T(bar, k))
# ---- vibraphone : accompagnement, sauf sur les frappes d'étape qui ont leur propre accord
ETAPES = {round(e['t'], 3): ['Fmaj9', 'Dm9', 'Gm9'][e.get('n', 0) % 3] for e in EV if e['type'] == 'accord'}
for bar in range(1, NB):
    for j, c in enumerate(BARS[bar]):
        t1 = T(bar, 2 * j)
        if t1 > fin - 0.6: continue
        if not any(abs(t1 - te) < 0.3 for te in ETAPES): vib(t1, CH[c][0], .35, .32)
        vib(T(bar, 2 * j + 1.5), CH[c][0], .25, .26)
for t, c in ETAPES.items():
    vib(t, CH[c][0] + ['E5' if c != 'Gm9' else 'D5'], 1.6, .62, trem=.3, gain=1.2, hard=True)
# coupure avant chaque silence : l'orchestre frappe puis se tait
for a, _ in SIL: vib(a - 0.5, CH['C7'][0], .4, .5)
# fin : les trois accords d'étape reviennent un par temps, puis l'accord final en trémolo sur le logo
for k, c in enumerate(['Fmaj9', 'Dm9', 'Gm9', 'C13']):
    vib(fin - 2.0 + k * B, CH[c][0], .45, .5, hard=True)
vib(fin, ['F3', 'A3', 'E4', 'G4', 'C5', 'A5'], max(1.0, DUR - fin), .55, trem=.35, gain=1.25, force=True)
bass(fin, 'F1', max(1.0, DUR - fin - 0.2), .7, force=True)
for i, p in enumerate(['F4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6']): vib(fin - 0.5 + i * .07, [p], .6, .28 + i * .03, pan=-.3 + i * .08)
# ---- flûte : une phrase sur l'apport, une courte réponse après chaque accord d'étape
MOTIF = [(0, 'A4', 1), (1, 'C5', .5), (1.5, 'D5', .5), (2, 'F5', 1.5), (3.5, 'E5', .5), (4, 'D5', 1), (5, 'C5', .5), (5.5, 'A4', 1.5), (7, 'F4', 1)]
if t_apport < fin:
    for beat, p, d in MOTIF:
        tt = t_apport + 0.6 + beat * B
        if tt + d * B < fin - 1.2: flute(tt, p, d, .48)
for t, c in ETAPES.items():
    for k, (beat, p) in enumerate([(2.5, 'F5'), (3, 'E5'), (3.5, 'C5'), (4, 'D5')]): flute(t + beat * B, p, .5 if k < 3 else 1.5, .42)

mix = stems['drums'] * 1.0 + stems['bass'] * 1.15 + stems['vib'] * .8 + stems['lead'] * .7
tt = np.arange(N) / SR; mix *= np.minimum(1, (DUR - tt) / 1.6)[:, None]
mix = limit(mix, .9)
os.makedirs(os.path.join(D, 'music'), exist_ok=True)
sf.write(os.path.join(D, 'music', 'score.wav'), mix.astype(np.float32), SR)
print('score.wav', round(DUR, 2), 's, crête', round(float(np.abs(mix).max()), 3))
