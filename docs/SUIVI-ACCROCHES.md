# Suivi hebdomadaire des accroches

Procédure suivie chaque lundi par une tâche planifiée Claude Code (après le
bilan marketing de 5 h 30). Elle utilise les skills Instagram du dépôt
(`.claude/skills/ig-*`, adaptés au français) et la voix de marque
(`.claude/instagram/voice.md`). Décision du fondateur : les changements partent
sans relecture, à condition que tous les contrôles passent (pull request en
fusion automatique, voir l'étape 9).

## Principe

Les mesures réelles décident ; le skill propose et filtre.

- `hookscore.py` écarte les accroches manifestement faibles mais prédit mal
  les vues (AUC 0,56 selon son auteur, confirmé par nos Shorts).
- Une accroche qui fait des vues reste, quelle que soit sa note : elle entre
  dans `src/lib/marketing/accroches-prouvees.ts`.
- Seules les accroches qui ont eu leur chance (publiées depuis au moins
  7 jours) et qui sont dans le tiers le plus bas sont remplacées.

## Étapes

1. **Partir de `develop` à jour.** `git fetch origin && git checkout -B suivi-accroches origin/develop && npm ci`.

2. **Relever les mesures** (Supabase, projet `CoparentaliteZen`, lecture seule) :

   ```sql
   -- Vues YouTube par accroche (Shorts publiés depuis au moins 7 jours)
   select accroche, sum(vues) vues, count(*) shorts, min(publie_le)::date premier
   from marketing_youtube_shorts
   where not essai and vues is not null and publie_le < now() - interval '7 days'
   group by accroche order by vues desc;

   -- Portée et interactions Meta par accroche (dernier relevé de chaque publication)
   with derniers as (
     select distinct on (publication_id) publication_id, portee, vues, interactions
     from marketing_mesures where publication_id is not null
     order by publication_id, releve_le desc)
   select c.accroche, count(*) publications, sum(d.portee) portee, sum(d.interactions) interactions
   from marketing_contenus c
   join marketing_publications p on p.contenu_id = c.id
   join derniers d on d.publication_id = p.id
   where p.publie_le < now() - interval '7 days'
   group by c.accroche order by portee desc nulls last;

   -- Clics vers le site par accroche
   select c.accroche, sum(v.clics) clics
   from marketing_visites v join marketing_contenus c on c.reference = v.contenu
   group by c.accroche order by clics desc;
   ```

   Les accroches publiées autrefois au vouvoiement correspondent à leur
   version actuelle au tutoiement.

3. **Analyser** comme `/ig-audit` : classer par multiple de la médiane (pas en
   valeur brute), repérer les formules (`hooks.json`, classées par
   `.claude/skills/ig-viral/swipe.py`) et les sujets qui sortent du lot.

4. **Mettre à jour `accroches-prouvees.ts`** : ajouter toute accroche en
   service qui atteint `SEUIL_PREUVE_VUES` (400 vues), avec la date et le
   nombre réellement relevés.

5. **Remplacer au plus 3 accroches** : celles du tiers le plus bas, publiées
   depuis au moins 7 jours, jamais une accroche prouvée. Pour chacune :
   - écrire 3 candidates inspirées des formules et des sujets qui marchent
     (champs `template_fr` / `example_fr` de `hooks.json`), au tutoiement ;
   - les noter avec `python3 .claude/skills/ig-reel/hookscore.py fichier.txt`
     et garder la meilleure, note **60 ou plus** ;
   - remplacer **au même rang** dans `banque.ts`, et la vignette de même rang
     dans `vignettes.ts` (34 caractères au plus, aucun chiffre).

6. **Règles qui ne se négocient pas** (AGENTS.md, banque.ts, voice.md) :
   aucun chiffre, statistique ni témoignage inventé ; aucun parent désigné
   fautif ; aucun conseil juridique ; pas de « dette », « ton ex »,
   « conflit », « guerre », « refusé », « ignoré » ; la phrase doit se dire à
   voix haute sans ambiguïté (elle est lue par la voix de synthèse puis
   vérifiée par Whisper). Ne pas toucher aux étapes, à l'apport, aux
   hashtags, ni au nombre d'accroches par sujet.

7. **Vérifier** : `npm run typecheck && npm test`. Si un contrôle échoue et
   ne se corrige pas simplement, **ne rien pousser** et le dire dans le
   journal.

8. **Journal** : ajouter en tête de `docs/JOURNAL-ACCROCHES.md` la date, le
   classement (5 meilleures, 5 moins bonnes), les accroches remplacées
   (avant → après, note, raison) et les accroches ajoutées aux prouvées.

9. **Publier** : un commit (« Suivi accroches : semaine du JJ/MM/AAAA ») sur
   une branche `suivi-accroches/AAAA-MM-JJ`, poussée, puis une pull request
   vers `develop` avec le résumé du journal. Activer la **fusion automatique**
   de la pull request : elle se fusionne seule quand la CI (« Contrôles ») est
   verte, et reste ouverte sinon. Si la fusion automatique n'est pas
   disponible, laisser la pull request ouverte et le signaler. Si rien n'est
   à changer, seulement le journal.
