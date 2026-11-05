"""Voix hors ligne (Kokoro « ff_siwis », Apache-2.0) : convertit lines.json au format de core/tts/tts.py puis l'appelle.
   python tools/kokoro.py lines.json voices_dir   (LIB dans l'environnement)"""
import json, os, sys, runpy, tempfile
lines = json.load(open(sys.argv[1], encoding='utf-8'))
k = [{'id': l['id'], 'text': l.get('say') or l['text'], 'voice': 'ff_siwis', 'lang': 'fr-fr', 'speed': 0.95} for l in lines]
tmp = os.path.join(sys.argv[2], 'lines_kokoro.json'); os.makedirs(sys.argv[2], exist_ok=True)
json.dump(k, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
lib = os.environ['LIB']; sys.argv = [lib + '/core/tts/tts.py', tmp, sys.argv[2]]
runpy.run_path(sys.argv[0], run_name='__main__')
