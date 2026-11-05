"""Clé phonétique française d'une phrase, pour comparer une voix à son texte (voir asr_fr.py).
Module pur, sans dépendance : testé par tests/videos-phonetique.test.ts."""
import re, unicodedata

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

ABREVIATIONS = {'km': 'kilometres', 'kg': 'kilos', 'h': 'heures', 'min': 'minutes'}

def centaines(n):
    if n < 100: return lettres(n)
    c, r = divmod(n, 100)
    tete = ['cent'] if c == 1 else lettres(c) + ['cent']
    return tete + (lettres(r) if r else [])

def mot_phonetique(w):
    """Clé phonétique d'un mot : ce qui s'entend, pas ce qui s'écrit."""
    if w in ('et', 'est', 'es'): return 'e'
    if w == 'c': return 's'                   # « c' » élidé : « c'est » = « s'est »
    for a, b in (('eau', 'o'), ('au', 'o'), ('ph', 'f'), ('qu', 'k'), ('mpt', 'nt'), ('ss', 's'),
                 ('ai', 'e'), ('ei', 'e'), ('y', 'i'), ('h', '')):
        w = w.replace(a, b)
    w = re.sub(r'c(?=[eiy])', 's', w); w = w.replace('c', 'k')
    w = re.sub(r'(aient|ait|ais)$', 'e', w)
    if len(w) > 4: w = re.sub(r'ent$', 'e', w)
    w = re.sub(r'(ez|er|ees|ee|es)$', 'e', w)
    if len(w) > 1: w = re.sub(r'[sx]+$', '', w)      # « aux » = « au »
    if len(w) > 2: w = re.sub(r'[std]+$', '', w)
    if len(w) > 2: w = re.sub(r'e$', '', w)
    w = re.sub(r'(.)\1+', r'\1', w)          # lettres doublées : une seule s'entend
    return w

def norm_fr(s):
    s = sans_accents(s.lower().replace('ç', 's')).replace('’', ' ').replace("'", ' ').replace('-', ' ')
    mots = []
    for w in re.findall(r'[a-z0-9]+', s):
        if w.isdigit() and len(w) <= 3: mots += centaines(int(w))
        else: mots.append(ABREVIATIONS.get(w, w))
    # Une seule clé pour toute la phrase : « évitent » et « et vite », « par enfant » et « parents-fans »
    # s'entendent de la même façon ; un mot faux, ajouté ou manquant change la clé.
    return [''.join(mot_phonetique(w) for w in mots)]

