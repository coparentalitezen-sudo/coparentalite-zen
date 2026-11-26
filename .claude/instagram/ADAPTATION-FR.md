# Adaptation française des skills Instagram (@coparentalitezen)

Faite le 17/11/2026 sur les skills installées dans ~/.claude/skills/.

## Ce qui a changé
- ig-reel/hookscore.py : mots accentués, élisions (l', n', j'), chiffres en
  lettres et en euros, mots de tension, ouvertures faibles et salutations FR,
  tutoiement. Les notes anglaises sont identiques à avant.
- ig-reel/hooks.json : les 26 formules ont une version FR (template_fr,
  example_fr, on_screen_fr) et une détection FR ajoutée à "match"
  (l'original est gardé dans "match_en").
- ig-viral/swipe.py : comptage des mots accentués.
- ig-caption/caption.py : hashtags accentués, majuscules accentuées, appels à l'action FR (« Écris ZEN en commentaire », « lien en bio », « enregistre ce post »...).
- ig-human/slop.json : ~85 expressions FR (remplacées automatiquement) et
  10 tournures FR signalées (« Ce n'est pas juste X, c'est Y », « N'hésite
  pas », « Découvrez », préambule, appel à s'abonner, vouvoiement, mots à
  éviter de la marque, sujets juridiques...).
- ig-human/humanize.py : détecte un texte français ; garde l'espace avant
  ; : ! ? ; n'insère jamais de mot anglais dans un texte français.
- ig-human/detect.py : mots accentués, pronoms et élisions FR.

## Sauvegarde de l'original
~/.claude/instagram/backup-skills-en/  (ig-reel, ig-human, ig-caption, ig-viral)
Pour revenir à l'original : recopier ces dossiers dans ~/.claude/skills/.

## Après une mise à jour du skill depuis GitHub
Les fichiers JSON se refont avec :
  python3 ~/.claude/instagram/patch_hooks_fr.py ~/.claude/skills/ig-reel/hooks.json
  python3 ~/.claude/instagram/patch_slop_fr.py  ~/.claude/skills/ig-human/slop.json
Les changements dans les .py sont à refaire : demander à Claude
« réapplique ADAPTATION-FR.md ».
