"""asr_check.py de Lemo-Opuscar, avec une comparaison française des homophones.

    python tools/asr_fr.py lines.json voices_dir --lang fr --model small     (LIB dans l'environnement)

Le contrôle reste celui de la bibliothèque (Whisper, mot à mot, 0 écart exigé). Seule la
normalisation des mots change : en français, l'oreille ne distingue pas « rangez » de « ranger »,
« résumez » de « résumé », « parent » de « parents » ou « évite » de « évitent ». Whisper choisit
l'une ou l'autre graphie au hasard ; les tenir pour différentes refusait des voix parfaites.

Les deux côtés (texte attendu, transcription) sont réduits à une clé phonétique de la phrase entière :
accents retirés, graphies d'un même son confondues (eau/au/o, qu/k, c/s, ai/é, -ez/-er/-é, lettres
finales muettes, lettres doublées), mots recollés (« évitent » = « et vite »). Les nombres en chiffres et
quelques abréviations (km) sont lus en lettres. Deux phrases qui s'entendent pareil passent ; un mot faux,
ajouté ou manquant change la clé et reste un écart bloquant."""
import os, sys

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
from phonetique_fr import norm_fr  # noqa: E402
LIB = os.environ['LIB']; sys.path.insert(0, os.path.join(LIB, 'core', 'tts')); sys.path.insert(0, LIB)
import asr_check  # noqa: E402

asr_check.norm_en = norm_fr
if __name__ == '__main__':
    sys.argv[0] = os.path.join(LIB, 'core', 'tts', 'asr_check.py')
    asr_check.main()
