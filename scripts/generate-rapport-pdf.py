#!/usr/bin/env python3
"""
Coparentalité Zen — Générateur de rapport mensuel PDF (maquette de référence).
Produit le rapport de démonstration « Juillet 2026 » à partir des mêmes données
et des mêmes règles de calcul que l'application (centimes entiers, 50/50).
En production, ce gabarit sera porté côté serveur Node (même mise en page).
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Image, HRFlowable)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# --- Palette officielle (mesurée sur le logo) ---
NAVY   = colors.HexColor('#4E6381')
NAVYTX = colors.HexColor('#3D4F68')
CORAL  = colors.HexColor('#E4A196')
SAGE   = colors.HexColor('#9AA791')
CREAM  = colors.HexColor('#FCF9F6')
INK    = colors.HexColor('#101B2C')
LINE   = colors.HexColor('#E3DED8')
MUTED  = colors.HexColor('#F1EEEA')
OKBG   = colors.HexColor('#E9F2EB')

# --- Données de démonstration (identiques à src/lib/demo-data.ts) ---
PARENTS = {'p1': 'Camille', 'p2': 'Julien'}
CHILDREN = {'c1': 'Léa', 'c2': 'Noah'}
EXPENSES = [
    ('02/07/2026', 'Cantine juillet', 'Cantine', ['c1'], 'p1', 8550, 'Validée'),
    ('10/07/2026', 'Pharmacie', 'Pharmacie', ['c2'], 'p2', 2340, 'Validée'),
    ('15/07/2026', 'Stage multisports', 'Sport', ['c1', 'c2'], 'p1', 12000, 'À valider'),
    ('18/07/2026', 'Chaussures rentrée', 'Chaussures', ['c1'], 'p2', 'En attente', 6490, ),
]
EXPENSES = [
    ('02/07/2026', 'Cantine juillet', 'Cantine', ['c1'], 'p1', 8550, 'Validée'),
    ('10/07/2026', 'Pharmacie', 'Pharmacie', ['c2'], 'p2', 2340, 'Validée'),
    ('15/07/2026', 'Stage multisports', 'Sport', ['c1', 'c2'], 'p1', 12000, 'À valider'),
    ('18/07/2026', 'Chaussures rentrée', 'Chaussures', ['c1'], 'p2', 6490, 'En attente de réponse'),
]
CUSTODY = [
    ('01/07 → 03/07', 'Julien', 'Rythme régulier (une semaine sur deux)'),
    ('04/07 → 31/07', 'Camille', 'Vacances d’été — première moitié'),
]

def eur(cents: int) -> str:
    s = f"{cents // 100},{cents % 100:02d}"
    # séparateur de milliers fin
    e, c = s.split(',')
    e = ' '.join([e[max(0, i-3):i] for i in range(len(e), 0, -3)][::-1])
    return f"{e},{c} €"

def build(out='rapport-mensuel-juillet-2026.pdf', logo='public/logo-complet.png'):
    doc = SimpleDocTemplate(out, pagesize=A4,
                            leftMargin=18*mm, rightMargin=18*mm,
                            topMargin=16*mm, bottomMargin=18*mm,
                            title='Coparentalité Zen — Rapport mensuel Juillet 2026',
                            author='Coparentalité Zen')
    ss = getSampleStyleSheet()
    H1 = ParagraphStyle('H1', parent=ss['Title'], fontName='Helvetica-Bold',
                        fontSize=17, textColor=INK, alignment=0, spaceAfter=2)
    SUB = ParagraphStyle('SUB', parent=ss['Normal'], fontSize=10, textColor=NAVYTX)
    H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontName='Helvetica-Bold',
                        fontSize=12, textColor=NAVYTX, spaceBefore=12, spaceAfter=4)
    P = ParagraphStyle('P', parent=ss['Normal'], fontSize=9.5, textColor=INK, leading=13)
    SMALL = ParagraphStyle('SMALL', parent=ss['Normal'], fontSize=8, textColor=colors.HexColor('#4A5568'), leading=11)

    story = []

    # En-tête : logo discret (30 mm) + titre — le logo ne domine pas l'information
    head = Table([[Image(logo, width=30*mm, height=30*mm),
                   [Paragraph('Rapport mensuel — Juillet 2026', H1),
                    Paragraph('Coparentalité Zen · Foyer « Famille Démo » · Enfants : Léa et Noah', SUB),
                    Paragraph('Généré le 22/07/2026 · Document informatif', SMALL)]]],
                 colWidths=[34*mm, None])
    head.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                              ('LEFTPADDING', (0,0), (0,0), 0)]))
    story += [head, Spacer(1, 4), HRFlowable(width='100%', color=SAGE, thickness=1.2), Spacer(1, 8)]

    # Synthèse du solde
    story.append(Paragraph('Synthèse du mois', H2))
    total_validated = 8550 + 2340
    synth = Table([
        ['Dépenses validées du mois', eur(total_validated)],
        ['Part de Camille (50 %)', eur(4275 + 1170)],
        ['Part de Julien (50 %)', eur(4275 + 1170)],
        ['Solde au 31/07', 'Camille doit recevoir ' + eur(3105)],
    ], colWidths=[95*mm, None])
    synth.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'), ('FONTSIZE', (0,0), (-1,-1), 9.5),
        ('TEXTCOLOR', (0,0), (-1,-1), INK),
        ('BACKGROUND', (0,3), (-1,3), OKBG),
        ('FONTNAME', (0,3), (-1,3), 'Helvetica-Bold'),
        ('LINEBELOW', (0,0), (-1,2), 0.5, LINE),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
    ]))
    story += [synth,
              Paragraph('Le solde est calculé au centime près sur les dépenses validées par les deux parents, '
                        'selon la règle de partage du foyer (50/50). Les dépenses en attente ou à valider '
                        'ne sont pas comptées.', SMALL)]

    # Dépenses
    story.append(Paragraph('Dépenses du mois', H2))
    rows = [['Date', 'Dépense', 'Catégorie', 'Enfant(s)', 'Payée par', 'Montant', 'Statut']]
    for d, t, cat, kids, payer, cents, status in EXPENSES:
        rows.append([d, t, cat, ', '.join(CHILDREN[k] for k in kids), PARENTS[payer], eur(cents), status])
    tbl = Table(rows, colWidths=[19*mm, 36*mm, 22*mm, 22*mm, 20*mm, 22*mm, None], repeatRows=1)
    tbl.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('BACKGROUND', (0,0), (-1,0), NAVY), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, MUTED]),
        ('TEXTCOLOR', (0,1), (-1,-1), INK),
        ('GRID', (0,0), (-1,-1), 0.4, LINE),
        ('ALIGN', (5,0), (5,-1), 'RIGHT'),
        ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(tbl)

    # Remboursements
    story.append(Paragraph('Remboursements', H2))
    story.append(Paragraph('Aucun remboursement enregistré en juillet 2026.', P))

    # Garde
    story.append(Paragraph('Périodes de garde', H2))
    rows = [['Période', 'Chez', 'Origine']] + [list(r) for r in CUSTODY]
    ct = Table(rows, colWidths=[35*mm, 30*mm, None])
    ct.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BACKGROUND', (0,0), (-1,0), SAGE), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('TEXTCOLOR', (0,1), (-1,-1), INK),
        ('GRID', (0,0), (-1,-1), 0.4, LINE),
        ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(ct)
    story.append(Paragraph('Pendant les vacances scolaires, les règles de vacances remplacent le rythme régulier.', SMALL))

    # Contestations
    story.append(Paragraph('Contestations', H2))
    story.append(Paragraph('Aucune contestation en cours.', P))

    story += [Spacer(1, 14), HRFlowable(width='100%', color=LINE, thickness=0.8), Spacer(1, 6),
              Paragraph('Ce document est fourni à titre informatif par Coparentalité Zen. Il ne constitue ni une '
                        'décision judiciaire, ni une convention parentale, ni un conseil juridique professionnel. '
                        'Données de démonstration fictives.', SMALL)]

    doc.build(story)
    print('OK', out)

if __name__ == '__main__':
    build()
