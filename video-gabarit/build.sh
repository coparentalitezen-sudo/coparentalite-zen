#!/bin/sh
# Rend UNE vidéo à partir d'un dossier qui contient scenario.json et lines.json (écrits par scripts/videos/scenario.ts).
#   LIB=<Lemo-Opuscar> sh video-gabarit/build.sh <dossier>
# Sorties dans <dossier> : video.mp4, affiche.jpg, sous-titres.srt, controles.json.
# Code de sortie : 0 si la vidéo est produite ET que tous les contrôles bloquants passent ; 1 sinon (le détail est dans controles.json).
# Variables : VOIX_MOTEUR = edge (défaut, voix « fr-FR-DeniseNeural », en ligne) | kokoro (« ff_siwis », hors ligne) ;
#             RENDU_TRAVAILLEURS (défaut 3) ; ffmpeg ≥ 7 doit être le premier sur le PATH.
set -eu
GAB=$(cd "$(dirname "$0")" && pwd)
D=$(cd "$1" && pwd)
: "${LIB:?LIB doit désigner la bibliothèque Lemo-Opuscar}"; export LIB
PY="$LIB/.venv/bin/python"
MOTEUR=${VOIX_MOTEUR:-edge}
TRAV=${RENDU_TRAVAILLEURS:-3}
[ -f "$D/scenario.json" ] && [ -f "$D/lines.json" ] || { echo "scenario.json ou lines.json manquant dans $D"; exit 1; }
ffmpeg -version | head -1 | grep -Eq 'version n?([7-9]|[1-9][0-9])\.' || { echo "ffmpeg ≥ 7 requis en tête du PATH"; exit 1; }

# 0. le gabarit est copié dans le dossier de rendu : la page y trouve scenario.json et voices/
cp "$GAB"/index.html "$GAB"/main.js "$GAB"/film.js "$GAB"/minutage.mjs "$GAB"/icones.js "$D"/
rm -rf "$D/engine" "$D/fonts" "$D/assets"
cp -r "$GAB/engine" "$GAB/fonts" "$GAB/assets" "$D"/
mkdir -p "$D/out"
rm -f "$D/video.mp4" "$D/controles.json" "$D/out/asr.log" "$D/out/readcheck.log"

# 1. voix, vérifiée par asr_check.py (0 écart exigé). Jusqu'à 3 essais, le débit change d'un essai à l'autre.
# Le texte comparé est le texte PRONONCÉ (« say »), pas l'affiché.
"$PY" -c "import json,sys; L=json.load(open(sys.argv[1])); json.dump([{**l,'text':l.get('asr') or l.get('say') or l['text']} for l in L], open(sys.argv[2],'w'), ensure_ascii=False)" "$D/lines.json" "$D/out/lines_asr.json"
VOIX_OK=0
for DEBIT in -2% +0% -6%; do
  rm -rf "$D/voices"
  "$PY" -c "import json,sys; L=json.load(open(sys.argv[1])); [l.__setitem__('rate', sys.argv[2]) for l in L]; json.dump(L, open(sys.argv[1],'w'), ensure_ascii=False, indent=1)" "$D/lines.json" "$DEBIT"
  if [ "$MOTEUR" = kokoro ]; then "$PY" -I "$GAB/tools/kokoro.py" "$D/lines.json" "$D/voices"
  else "$PY" -I "$GAB/tools/tts_edge.py" "$D/lines.json" "$D/voices"; fi
  if "$PY" "$GAB/tools/asr_fr.py" "$D/out/lines_asr.json" "$D/voices" --lang fr --model "${WHISPER_MODEL:-small}" > "$D/out/asr.log" 2>&1; then VOIX_OK=1; break; fi
  echo "voix : écart détecté au débit $DEBIT, nouvel essai"; grep -E "^(OK|DIFF)|mismatches" "$D/out/asr.log"
done
cp "$D/out/asr.log" "$D/out/asr-final.log"

# 2. chronologie, partition, mixage — seulement si la voix est bonne (sinon les contrôles diront pourquoi)
if [ "$VOIX_OK" = 1 ]; then
  cd "$LIB"
  node core/render/events.mjs "$D" --size 1080x1920
  "$PY" "$GAB/music/score.py" "$D"
  "$PY" "$GAB/mix.py" "$D"
  node "$GAB/tools/cues.mjs" "$D" > "$D/out/cues.json"
  "$PY" -c "import json,sys; c=json.load(open(sys.argv[1])); json.dump(c['srt'], open(sys.argv[2],'w'), ensure_ascii=False); json.dump(c['minutage'], open(sys.argv[3],'w'), ensure_ascii=False, indent=1)" "$D/out/cues.json" "$D/out/srt.json" "$D/minutage.json"
  "$PY" core/render/srt.py "$D/out/srt.json" "$D/sous-titres.srt"
  # 3. image, puis contrôle du temps de lecture de chaque texte affiché
  node core/render/readcheck.mjs "$D" --size 1080x1920 > "$D/out/readcheck.log" 2>&1 && echo ok > "$D/out/readcheck.ok" || rm -f "$D/out/readcheck.ok"
  node core/render/video.mjs "$D" --fps 24 --workers "$TRAV" --size 1080x1920 --out "$D/out/image.mp4"
  sh core/render/mux.sh "$D/out/image.mp4" "$D/out/mix.wav" "$D/video.mp4" 24 1 > "$D/out/mux.log" 2>&1 || { cat "$D/out/mux.log"; rm -f "$D/video.mp4"; }
  node core/render/still.mjs "$D" 2.6 --size 1080x1920 --q nosubs=1 --out "$D/out" > /dev/null && \
    ffmpeg -loglevel error -y -i "$D/out/t_2.6.jpg" -q:v 3 "$D/affiche.jpg"
fi

# 4. contrôles bloquants : tous doivent passer, sinon aucune publication
"$PY" "$GAB/controles.py" "$D" --voix "$VOIX_OK"
