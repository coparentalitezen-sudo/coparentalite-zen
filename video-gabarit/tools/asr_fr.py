"""asr_check.py de Lemo-Opuscar, avec une comparaison française des homophones.

    python tools/asr_fr.py lines.json voices_dir --lang fr --model small     (LIB dans l'environnement)

Le contrôle reste celui de la bibliothèque (Whisper, mot à mot, 0 écart exigé). Seule la
normalisation des mots change : en français, l'oreille ne distingue pas « rangez » de « ranger »,
« résumez » de « résumé », « parent » de « parents » ou « évite » de « évitent ». Whisper choisit
l'une ou l'autre graphie au hasard ; les tenir pour différentes refusait des voix parfaites.

Règles, appliquées aux deux côtés (texte attendu et transcription), après suppression des accents :
  * s / x final muet (pluriel) ;
  * -aient, -ais, -ait → e ; -ent final (verbe au pluriel) → e ;
  * -ez, -er, -ee(s), -es, -e → e (le son « é » / « e » final).
Rien d'autre n'est assoupli : un mot mal entendu, ajouté ou manquant reste un écart bloquant.
Les nombres en chiffres de la transcription sont lus en lettres (« 3 » = « trois »)."""
import os, re, sys, unicodedata

LIB = os.environ['LIB']; sys.path.insert(0, os.path.join(LIB, 'core', 'tts')); sys.path.insert(0, LIB)
import asr_check  # noqa: E402

UNITES = 'zero un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize'.split()
DIZAINES = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'}

def lettres(n):
    if n < 17: return [UNITES[n]]
    if n < 20: return ['dix', UNITES[n - 10]]
    if n < 70:
        d, u = divmod(n, 10)
        return [DIZAINES[d]] + ([] if u == 0 else (['et', 'un'] if u == 1 else [UNITES[u]]))
    if n < 80: return ['soixante'] + lettres(n - 60)
    if n == 80: return ['quatre', 'vingt']
    if n < 100: return ['quatre', 'vingt'] + lettres(n - 80)
    return [str(n)]

def sans_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))

def cle(w):
    if len(w) > 3: w = re.sub(r'[sx]$', '', w)
    w = re.sub(r'(aient|ais|ait)$', 'e', w)
    if len(w) > 4: w = re.sub(r'ent$', 'e', w)
    w = re.sub(r'(ez|er|ees|ee|es|e)$', 'e', w)
    return w

def norm_fr(s):
    s = sans_accents(s.lower()).replace('’', ' ').replace("'", ' ').replace('-', ' ')
    out = []
    for w in re.findall(r'[a-z0-9]+', s):
        if w.isdigit() and len(w) <= 2: out += lettres(int(w))
        else: out.append(w)
    return [cle(w) for w in out]

asr_check.norm_en = norm_fr
if __name__ == '__main__':
    sys.argv[0] = os.path.join(LIB, 'core', 'tts', 'asr_check.py')
    asr_check.main()
