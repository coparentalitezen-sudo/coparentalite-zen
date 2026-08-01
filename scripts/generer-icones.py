#!/usr/bin/env python3
"""
Génération des icônes et écrans de démarrage de Coparentalité Zen.

POURQUOI CE SCRIPT
Le symbole source est détouré et ne contient aucun texte. Il est replacé
avec une zone de sécurité suffisante pour les masques iOS et Android. Toute icône générée avec une marge insuffisante se retrouve
rognée : iOS applique un masque à coins arrondis, Android un masque circulaire.
Le logo doit donc être recadré sur son contenu réel, puis replacé avec des
marges conformes aux recommandations des deux plateformes.

RÈGLES APPLIQUÉES
  * Icône « any »      : le symbole occupe 66 % de la largeur — visible en entier,
                         quelle que soit la forme du masque appliqué.
  * Icône « maskable » : Android garantit uniquement un cercle de 80 % du
                         canevas. Un carré inscrit dans ce cercle mesure
                         0,8 / √2 ≈ 56 % du côté. Le logo est donc limité à
                         54 % pour rester intact même sur un masque circulaire.
  * Apple touch icon   : fond opaque obligatoire (iOS ne gère pas la
                         transparence), symbole à 62 %.
  * Écrans de démarrage: logo à 46 % de la largeur de l'écran, centré
                         optiquement (légèrement au-dessus du milieu).

Usage : python3 scripts/generer-icones.py
"""

from PIL import Image
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / 'public'

CREME = (252, 249, 246, 255)          # --color-cream, fond de l'application

# Proportion de la LARGEUR du canevas occupée par le logo
PART_ANY = 0.66
PART_MASKABLE = 0.52
PART_APPLE = 0.62
PART_SPLASH = 0.34


def symbole_recadre() -> Image.Image:
    """Le symbole, débarrassé de ses marges transparentes."""
    im = Image.open(PUBLIC / 'symbole.png').convert('RGBA')
    boite = im.split()[-1].getbbox()
    return im.crop(boite) if boite else im


def poser(logo: Image.Image, taille: int, part: int | float,
          fond, decalage_vertical: float = 0.0) -> Image.Image:
    """
    Place le logo dans un canevas carré, ratio préservé, sans jamais le rogner.
    `part` est la fraction de la largeur du canevas occupée par le logo.
    """
    canevas = Image.new('RGBA', (taille, taille), fond)
    largeur_cible = max(1, int(taille * part))
    hauteur_cible = max(1, round(largeur_cible * logo.height / logo.width))

    # Si le logo est plus haut que large, c'est la hauteur qui contraint
    if hauteur_cible > taille * part:
        hauteur_cible = max(1, int(taille * part))
        largeur_cible = max(1, round(hauteur_cible * logo.width / logo.height))

    redimensionne = logo.resize((largeur_cible, hauteur_cible), Image.LANCZOS)
    x = (taille - largeur_cible) // 2
    y = (taille - hauteur_cible) // 2 + int(taille * decalage_vertical)
    canevas.alpha_composite(redimensionne, (x, y))
    return canevas


def poser_rectangle(logo: Image.Image, largeur: int, hauteur: int,
                    part: float, fond) -> Image.Image:
    """Écran de démarrage : canevas au format de l'appareil, logo centré."""
    canevas = Image.new('RGBA', (largeur, hauteur), fond)
    largeur_cible = max(1, int(largeur * part))
    hauteur_cible = max(1, round(largeur_cible * logo.height / logo.width))
    redimensionne = logo.resize((largeur_cible, hauteur_cible), Image.LANCZOS)
    x = (largeur - largeur_cible) // 2
    # Centre optique : légèrement au-dessus du centre géométrique
    y = int(hauteur * 0.46) - hauteur_cible // 2
    canevas.alpha_composite(redimensionne, (x, y))
    return canevas


def main() -> None:
    logo = symbole_recadre()
    print(f'symbole recadré : {logo.size}  (ratio {logo.width / logo.height:.2f})')

    dossier_icones = PUBLIC / 'icons'
    dossier_splash = PUBLIC / 'splash'
    dossier_icones.mkdir(parents=True, exist_ok=True)
    dossier_splash.mkdir(parents=True, exist_ok=True)

    # ---- Icônes standard : le logo doit rester entier sous tout masque ----
    for t in (16, 32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024):
        poser(logo, t, PART_ANY, CREME).save(dossier_icones / f'icon-{t}.png', optimize=True)

    # ---- Maskable : contraint par le cercle de sécurité d'Android ----
    for t in (192, 512):
        poser(logo, t, PART_MASKABLE, CREME).save(
            dossier_icones / f'maskable-{t}.png', optimize=True)

    # ---- Apple : fond opaque, pas de transparence ----
    for t in (120, 152, 167, 180):
        poser(logo, t, PART_APPLE, CREME).convert('RGB').save(
            dossier_icones / f'apple-touch-icon-{t}.png', optimize=True)
    poser(logo, 180, PART_APPLE, CREME).convert('RGB').save(
        PUBLIC / 'apple-touch-icon.png', optimize=True)

    # ---- Chemins historiques conservés ----
    poser(logo, 192, PART_ANY, CREME).save(PUBLIC / 'icon-192.png', optimize=True)
    poser(logo, 512, PART_ANY, CREME).save(PUBLIC / 'icon-512.png', optimize=True)

    # ---- Favicon multi-résolutions ----
    poser(logo, 48, PART_ANY, CREME).convert('RGB').save(
        PUBLIC / 'favicon.ico', format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)])

    # ---- Écrans de démarrage iOS ----
    # (largeur px, hauteur px) — portrait, appareils courants
    ecrans = [
        (1290, 2796), (1179, 2556), (1284, 2778), (1170, 2532),
        (1125, 2436), (1242, 2688), (828, 1792), (1242, 2208),
        (750, 1334), (640, 1136),
        (1536, 2048), (1668, 2388), (2048, 2732),
    ]
    for largeur, hauteur in ecrans:
        poser_rectangle(logo, largeur, hauteur, PART_SPLASH, CREME) \
            .convert('RGB').save(dossier_splash / f'{largeur}x{hauteur}.png',
                                 optimize=True, quality=92)

    print(f'{len(list(dossier_icones.iterdir()))} icônes, {len(ecrans)} écrans de démarrage')

    # ---- Contrôle : le logo est-il bien entier dans chaque icône ? ----
    erreurs = 0
    for fichier in sorted(dossier_icones.glob('*.png')):
        im = Image.open(fichier).convert('RGBA')
        # On mesure le contenu qui diffère du fond
        difference = Image.new('RGBA', im.size, CREME)
        boite = None
        pixels_im = im.load()
        pixels_fond = difference.load()
        gauche = haut = None
        droite = bas = 0
        for y in range(im.height):
            for x in range(im.width):
                if pixels_im[x, y] != pixels_fond[x, y]:
                    if gauche is None or x < gauche: gauche = x
                    if haut is None or y < haut: haut = y
                    droite = max(droite, x)
                    bas = max(bas, y)
        if gauche is None:
            print(f'  ⚠ {fichier.name} : image vide')
            erreurs += 1
            continue
        marge = min(gauche, haut, im.width - 1 - droite, im.height - 1 - bas)
        if marge < 1:
            print(f'  ⚠ {fichier.name} : le logo touche le bord')
            erreurs += 1
    print('contrôle : aucun logo rogné' if erreurs == 0 else f'contrôle : {erreurs} problème(s)')


if __name__ == '__main__':
    main()
