# Vidéos animées publiées automatiquement

Publication **entièrement automatique** : aucune validation humaine quotidienne. Les **contrôles bloquants**
du rendu remplacent la validation ; un seul contrôle rouge, et rien ne part.

## Circuit

```
GitHub Actions (nuit)                        Vercel (toutes les heures, via GitHub Actions « horloge »)
──────────────────────                       ─────────────────────────────────────────────────────────
scripts/videos/rendre.ts                     /api/marketing/horloge
  scénario (scenario-video.ts)                 enregistre les contenus des 2 semaines
  video-gabarit/build.sh                       YouTube : Short du jour      ┐ arrêt d'urgence → heure réglée
    voix → asr_fr.py (0 écart)                 Instagram, Facebook :        │ → vidéo « prete » (contrôles verts)
    image, musique, mixage, master             · jour de Reel : vidéo       │ → réservation idempotente
    controles.py (bloquants)                   · sinon : visuel illustré    ┘ → publication → issue
  dépôt dans « videos » (PRIVÉ)                récapitulatif du lundi
  marketing_videos.statut = prete | echec      envoi des alertes (courriel)
```

| Plateforme | Quoi | Quand |
|---|---|---|
| YouTube | une vidéo animée par jour (rotation de la banque, `shortDuJour`) | à l'heure réglée, chaque jour |
| Instagram, Facebook | vidéo animée les jours de Reel du générateur (lundi, jeudi, samedi) ; visuel illustré les autres jours | à l'heure réglée |
| TikTok | **à la main**, préparé depuis `/admin/videos` (voir plus bas) | quand Sekou le décide |
| Pinterest | flux RSS inchangé, soumis à l'arrêt d'urgence | — |

## Contrôles bloquants (`video-gabarit/controles.py`)

| Contrôle | Règle |
|---|---|
| voix | Whisper « small » via `asr_check.py` : 0 écart (homophones français exacts tolérés : -ez/-er/-é, pluriels muets) |
| lecture | `readcheck.mjs` : chaque texte affiché reste lisible assez longtemps |
| fichier | vidéo > 100 Ko, affiche et sous-titres présents |
| vignette | `affiche.jpg` en 1080×1920, < 2 Mo |
| format | 1080×1920, H.264 + AAC, 24 i/s |
| durée | 20 à 35 s (dans les limites de YouTube Shorts, des Reels et de TikTok) |
| sonie | −14 LUFS ± 1, crête vraie ≤ −1 dBTP |
| noir | aucune image noire (`blackdetect`) |

La base refuse une vidéo « prete » dont les contrôles ne sont pas tous verts (contrainte
`marketing_videos_prete_controlee`). Le code de publication le revérifie (`evaluerVideo`).

## Garanties de publication (`src/lib/marketing/publication-video.ts`)

- **Arrêt d'urgence** : réglage global + réglage par plateforme, relus au moment même de publier.
- **Idempotence** : une seule publication par vidéo et par plateforme (clé unique en base, réservation conditionnelle).
- **Reprise après interruption** : une réservation restée « envoyée » plus de 15 minutes passe « à vérifier » ;
  elle n'est **jamais** republiée automatiquement (un doublon public est pire qu'un oubli). L'admin permet de
  noter « vérifiée absente », ce qui autorise « Republier ».
- **Succès** : seulement si la plateforme renvoie un identifiant de publication.
- **Suspension automatique** : 2 échecs de publication consécutifs coupent la plateforme, avec alerte.
- **Pas de repli** : une vidéo absente ou refusée ne publie rien ce jour-là sur la plateforme (pas de planches).

## Secrets : où et pourquoi

| Où | Quoi | Pourquoi |
|---|---|---|
| **Vercel** (variables d'environnement) | jetons Meta, `YOUTUBE_*`, `RESEND_API_KEY`, `ADMIN_EMAILS`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | c'est Vercel qui publie et qui envoie les courriels ; les jetons OAuth YouTube sont en base, chiffrés avec `YOUTUBE_TOKEN_KEY` |
| **GitHub Actions** (secrets) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (rendu) ; `CRON_SECRET` (horloge) | le rendu dépose et écrit des statuts ; l'horloge ne fait que déclencher la route |

Le dépôt est **public** : ses journaux d'Actions le sont aussi. Aucun jeton de publication n'entre donc dans
Actions ; les secrets GitHub sont masqués dans les journaux et jamais transmis aux pull requests de forks ;
le rendu d'essai des pull requests n'utilise aucun secret. Les messages d'erreur passent par `expurger()`.

## Stockage

Espace **privé** `videos` (`<clé>/<empreinte>/video.mp4`, `affiche.jpg`, `sous-titres.srt`). Meta reçoit une
adresse signée de **15 minutes**, créée juste avant l'appel ; YouTube reçoit les octets ; l'admin, une adresse
de 10 minutes pour le lecteur. L'ancien espace `reels` devient privé (migration 00061).

## TikTok

**Publication à la main, préparée par l'administration.** Sous chaque vidéo prête, `/admin/videos`
propose « Préparer pour TikTok » : la légende (tirée de celle d'Instagram par `legendeTiktok`, sans
renvoi à la bio, avec l'adresse du site ou celle du planning de Noël pendant la campagne) part dans le
presse-papiers, puis « Partager la vidéo » ouvre la feuille de partage d'iOS (TikTok ou « Enregistrer
la vidéo »). Deux appuis : Safari refuse d'ouvrir le partage après l'attente du téléchargement.

Pourquoi pas l'API (vérifié le 15/11/2026) : les Content Sharing Guidelines de TikTok, section
« Intended Use », excluent explicitement « un outil qui aide à mettre en ligne du contenu sur le(s)
compte(s) que vous ou votre équipe gérez ». L'audit de la publication directe serait refusé ; sans
audit, tout part en « Moi uniquement », sur un compte privé, et chaque publication exige de toute façon
un geste humain (visibilité choisie sans valeur par défaut, consentement). L'application développeur
« Coparentalité Zen » (Login Kit + Content Posting API, domaine vérifié par
`public/tiktokp8BOBOGFrWiPqcnILYcrtHSXLROkgA55.txt`) existe chez TikTok mais **n'est pas soumise**.

## Réglages et exploitation

- `/admin/videos` : arrêt d'urgence, heure par plateforme, vidéos (lecteur, contrôles, statut et liens), Re-rendre, Republier, alertes.
- Les tâches planifiées de GitHub ne tournent **que depuis la branche par défaut** du dépôt (`main` aujourd'hui).
- Rendu manuel : Actions → « Vidéos animées — rendu » → *Run workflow* (champ « cle » facultatif).
- Voix hors ligne : variable de dépôt `VOIX_MOTEUR=kokoro`.

## Vignette et bandeau

`affiche.jpg` n'est plus une image tirée du film : c'est une vignette dessinée exprès (`?vignette=1` dans
`film.js`) — la question courte de `src/lib/marketing/vignettes.ts` en très gros sur fond marine, la scène
des deux maisons et la pastille « 3 gestes simples ». Une vignette par accroche de la banque, 34 caractères
au plus, aucun chiffre ajouté. Elle part comme couverture du Reel Instagram (`cover_url`), comme miniature du
Reel Facebook (`/{video}/thumbnails`) et comme miniature YouTube (`thumbnails.set`). Les deux dernières ne
bloquent jamais : un refus (chaîne YouTube non éligible, vidéo Facebook encore en traitement) laisse la
publication en place et crée une alerte « information », une seule par motif.

Le même texte reste en bandeau en haut de l'image pendant les trois étapes : quelle que soit l'image que
YouTube choisit au milieu du Short, elle porte l'accroche.

Les légendes Facebook passent par `legendeFacebook()` au moment de l'envoi : deux mots-dièse remontés en fin
de premier paragraphe (visibles avant « Voir plus »), les autres en bas, et aucun renvoi à « la bio ».

## Décors par sujet

`video-gabarit/decors.js` habille chaque vidéo selon la micro-niche de son scénario : onze univers
(`UNIVERS`), chacun avec ses accessoires d'accroche, les pictogrammes des bulles des parents (le même des
deux côtés), une suite de trois fonds d'étapes avec motif et accessoires de coin, et, pour les familles
recomposées, un beau-parent et un cadet. Les personnages (quatre allures de parents, quatre enfants) sont
choisis par la graine du scénario. Structure, durées et sons ne changent pas ; le contrôle de lecture et
les contrôles techniques s'appliquent à l'identique. Modifier ce fichier change l'empreinte du gabarit :
les vidéos pas encore publiées sont re-rendues la nuit suivante.
