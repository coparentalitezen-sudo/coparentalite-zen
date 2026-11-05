"""Contrôles BLOQUANTS d'une vidéo rendue. Ils remplacent la validation humaine : un seul échec, aucune publication.

    python controles.py <dossier> --voix 0|1   → <dossier>/controles.json ; code de sortie 0 si tout passe, 1 sinon.

| contrôle    | règle |
|-------------|-------|
| voix        | asr_check.py (Whisper « small », français) : 0 écart sur toutes les lignes |
| lecture     | readcheck.mjs : chaque texte affiché reste lisible assez longtemps |
| fichier     | video.mp4 présent et non vide (> 100 Ko), affiche et sous-titres présents |
| format      | 1080×1920, H.264 + AAC, 24 i/s |
| duree       | 20 à 35 s (dans les limites de YouTube Shorts, Reels Instagram/Facebook et TikTok) |
| sonie       | −14 LUFS ± 1, crête vraie ≤ −1 dBTP (ffmpeg ebur128) |
| noir        | aucune image noire (ffmpeg blackdetect, 0,1 s, seuil 10 %) |
Aucun secret n'est lu ni écrit ici ; les messages ne contiennent que des mesures."""
import json, os, re, subprocess, sys

D = os.path.abspath(sys.argv[1])
voix_ok = '--voix' in sys.argv and sys.argv[sys.argv.index('--voix') + 1] == '1'
V = os.path.join(D, 'video.mp4')
DUREE_MIN, DUREE_MAX = 20.0, 35.0
res = []

def c(nom, ok, mesure=None, detail=''):
    res.append({'nom': nom, 'ok': bool(ok), 'mesure': mesure, 'detail': detail[:400]})

def lire(p):
    try: return open(p, encoding='utf-8', errors='replace').read()
    except OSError: return ''

# voix
asr = lire(os.path.join(D, 'out', 'asr-final.log'))
m = re.search(r'mismatches:\s*(\d+)', asr)
ecarts = int(m.group(1)) if m else None
c('voix', voix_ok and ecarts == 0, ecarts, '' if voix_ok and ecarts == 0 else (asr.strip().splitlines() or ['vérification vocale non exécutée'])[-1])

# lecture
c('lecture', os.path.exists(os.path.join(D, 'out', 'readcheck.ok')), None,
  '' if os.path.exists(os.path.join(D, 'out', 'readcheck.ok')) else (lire(os.path.join(D, 'out', 'readcheck.log')).strip().splitlines() or ['readcheck non exécuté'])[-1])

# fichier
taille = os.path.getsize(V) if os.path.exists(V) else 0
annexes = all(os.path.exists(os.path.join(D, f)) and os.path.getsize(os.path.join(D, f)) > 0 for f in ('affiche.jpg', 'sous-titres.srt'))
c('fichier', taille > 100_000 and annexes, taille, '' if taille > 100_000 and annexes else 'vidéo absente, vide, ou affiche / sous-titres manquants')

def ffprobe():
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration',
                              '-of', 'json', V], capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout or '{}')
    except Exception:
        return {}

if taille > 0:
    p = ffprobe(); st = p.get('streams', [])
    vid = next((s for s in st if s.get('codec_type') == 'video'), {}); aud = next((s for s in st if s.get('codec_type') == 'audio'), {})
    fmt_ok = vid.get('width') == 1080 and vid.get('height') == 1920 and vid.get('codec_name') == 'h264' and aud.get('codec_name') == 'aac' and vid.get('r_frame_rate') == '24/1'
    c('format', fmt_ok, f"{vid.get('width')}x{vid.get('height')} {vid.get('codec_name')}/{aud.get('codec_name')} {vid.get('r_frame_rate')}")
    duree = float(p.get('format', {}).get('duration') or 0)
    c('duree', DUREE_MIN <= duree <= DUREE_MAX, round(duree, 2), '' if DUREE_MIN <= duree <= DUREE_MAX else f'hors de {DUREE_MIN:g}–{DUREE_MAX:g} s')
    # sonie : intégrée et crête vraie
    e = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', V, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=300).stderr
    resume = e[e.rfind('Summary:'):] if 'Summary:' in e else ''
    mi = re.search(r'I:\s*(-?[\d.]+)\s*LUFS', resume); mp = re.search(r'Peak:\s*(-?[\d.]+|-inf)\s*dBFS', resume)
    lufs = float(mi.group(1)) if mi else None
    crete = float(mp.group(1)) if mp and mp.group(1) != '-inf' else None
    c('sonie', lufs is not None and abs(lufs + 14) <= 1 and crete is not None and crete <= -1.0, {'lufs': lufs, 'crete_dbtp': crete},
      '' if lufs is not None and abs(lufs + 14) <= 1 and crete is not None and crete <= -1.0 else 'sonie hors de −14 ± 1 LUFS ou crête > −1 dBTP')
    # images noires
    b = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', V, '-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=300).stderr
    noirs = re.findall(r'black_start:([\d.]+)', b)
    c('noir', not noirs, len(noirs), '' if not noirs else 'image noire à ' + ', '.join(f'{float(x):.2f} s' for x in noirs[:5]))
else:
    for nom in ('format', 'duree', 'sonie', 'noir'): c(nom, False, None, 'vidéo absente')

ok = all(r['ok'] for r in res)
json.dump({'ok': ok, 'controles': res}, open(os.path.join(D, 'controles.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in res: print(('✓' if r['ok'] else '✗'), r['nom'], r['mesure'] if r['mesure'] is not None else '', r['detail'])
sys.exit(0 if ok else 1)
