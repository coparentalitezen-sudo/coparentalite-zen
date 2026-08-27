# 10 — Tests

Étape 10 du mode opératoire.

Principe directeur, vérifié sur Coparentalité Zen : **chaque règle de test
vient d'un défaut réellement rencontré.** Un test qui ne protège de rien
finit par être contourné. Si une modification fait échouer l'un de ces tests,
c'est presque toujours la modification qu'il faut revoir — pas le test.

---

## 1. Les six niveaux

| Niveau | Outil | Ce qu'il prouve | Coût |
|---|---|---|---|
| Unitaire | Vitest | les fonctions pures calculent juste | faible |
| SQL / RLS | `scripts/test-sql.sh` | les migrations s'appliquent, l'isolation tient | moyen |
| Intégration | Vitest + doublures | les routes enchaînent correctement | moyen |
| E2E | Playwright | l'application se charge et redirige | élevé |
| Mobile / PWA | manuel, appareil réel | l'installation fonctionne vraiment | élevé |
| Paiement | Stripe Test | l'argent produit le bon droit | élevé |

## 2. Tests unitaires

Cible : **toute logique exprimable en fonction pure**. C'est la raison pour
laquelle les moteurs de Coparentalité Zen sont écrits en fonctions pures — ils
sont testables sans base, sans navigateur, en millisecondes.

À extraire systématiquement en fonction pure :
calculs monétaires, règles de quota, validation de fichiers, détection de
plateforme, transformation de dates, formatage.

Exemple de rigueur atteinte : la répartition monétaire est vérifiée sur
**3 000 combinaisons** — la somme des parts égale toujours exactement le
total.

```bash
npm test                                    # tout
npx vitest run tests/money.test.ts          # un fichier
npx vitest run tests/money.test.ts -t "nom" # un cas
```

⚠ L'alias `@` doit être déclaré dans `vitest.config.ts`. Sans lui, tout module
de `src/` utilisant `@/...` est intestable — et on finit par écrire du code
applicatif en imports relatifs pour contourner l'outillage.

## 3. Tests SQL — le niveau le plus rentable

`scripts/test-sql.sh` applique **toutes** les migrations sur une base vierge,
puis exécute chaque suite sur **un clone frais du même gabarit**.

L'isolation par clone n'est pas un luxe : les suites créent des données qui,
partagées, déclencheraient les verrous métier d'une suite à l'autre — un échec
qui ne dirait rien du produit.

### Le banc doit mentir le moins possible

C'est **la** leçon de ce projet. Le banc de test reproduit l'environnement
Supabase réel, pas un environnement commode :

| Élément reproduit | Pourquoi |
|---|---|
| `pgcrypto` dans le schéma **`extensions`** | l'installer dans `public` masque un bug réel : `gen_random_bytes` devenait introuvable en production alors que les tests passaient |
| rôle **`service_role`** | son absence a laissé passer un `permission denied` jusqu'en production |
| `grant service_role to <app> with inherit false` | permet de **basculer** vers le rôle pour le tester, sans jamais en hériter — sinon tous les contrôles d'isolation deviennent faux |
| schéma `auth` et `auth.uid()` | fournis par Supabase, à simuler ailleurs |
| **aucun privilège que le rôle applicatif n'aurait pas** | les fonctions `SECURITY DEFINER` masquent les droits manquants : des tests peuvent passer alors que la lecture directe échoue en production |

### Ce que chaque suite doit couvrir

Pour toute table métier :

- [ ] un membre lit ses données
- [ ] un non-membre ne lit **rien**, même en connaissant l'identifiant
- [ ] un rôle en lecture seule ne peut pas écrire
- [ ] les contraintes d'intégrité rejettent les valeurs incohérentes
- [ ] l'écriture directe sur une table verrouillée **échoue**
- [ ] les fonctions serveur refusent un appelant non autorisé
- [ ] `service_role` peut exécuter ce dont il a besoin, et rien de plus

```bash
npm run test:sql                                          # PostgreSQL local
PGHOST=localhost PGUSER=postgres PGPASSWORD=… npm run test:sql
```

Ordre imposé des jeux d'essai : ils se dépendent, l'ordre alphabétique ne
convient pas — le script le déclare explicitement.

## 4. Tests d'intégration

Routes API testées avec des doublures : webhook Stripe (signature valide,
signature invalide, événement rejoué), idempotence, export RGPD, tâches
planifiées (avec et sans `CRON_SECRET`).

## 5. Tests de bout en bout

Playwright, build de production sur un port dédié.

Ce qu'ils prouvent : les pages publiques répondent, la garde
d'authentification redirige, les redirections fonctionnent, le manifeste et le
service worker sont servis.

Ce qu'ils **ne** prouvent pas : les parcours connectés, qui exigent un compte
réel. Ceux-là sont couverts par les tests SQL et la vérification manuelle.

⚠ **Sauter honnêtement plutôt qu'échouer inutilement.** Les tests exigeant une
base réelle sont explicitement sautés en CI, avec le motif affiché :

```ts
const BASE_REELLE = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return url !== '' && !url.includes('exemple.supabase.co');
})();

const exigeBase = () => test.skip(!BASE_REELLE,
  'Exige une base Supabase joignable : la garde d’authentification l’interroge.');
```

Motif inscrit dans le code de Coparentalité Zen : *une chaîne toujours rouge
ne protège de rien — elle apprend à ignorer le rouge, ce qui est pire que de
n'avoir aucune vérification.*

## 6. Tests mobile et PWA

Non automatisables, **obligatoires avant la bêta**, sur appareil réel :
voir la liste de `06-PWA.md` § 6.

Un émulateur ne prouve rien sur iOS : les limitations de WebKit (Push,
`mailto:`, purge du stockage, cache d'icônes) ne s'y manifestent pas.

## 7. Tests de paiement

Liste complète dans `08-STRIPE.md` § 8. Le cas le plus souvent oublié :
**suppression de compte avec abonnement actif** — l'abonnement doit être
résilié avant l'anonymisation.

## 8. Parcours utilisateur complet

Une fois par cycle de bêta, à la main, sur un appareil réel, **du début à la
fin** :

1. découverte de la page publique
2. inscription + confirmation d'e-mail
3. acceptation des CGU (vérifier la ligne dans `consent_logs`)
4. installation sur l'écran d'accueil
5. configuration initiale
6. usage métier principal
7. activation des notifications, réception d'une alerte réelle
8. souscription payante
9. usage d'une fonctionnalité réservée
10. export des données (vérifier le contenu, pas seulement le code 200)
11. résiliation depuis le portail
12. suppression du compte
13. **reconnexion impossible** avec les mêmes identifiants

Ce parcours révèle des choses qu'aucun test automatique ne voit — un mot
maladroit, une étape qui n'a pas de sens, un écran vide sans explication.

## 9. Intégration continue

Deux jobs parallèles + un verdict bloquant (voir `03-GITHUB-VERCEL.md` § 5).

⚠ **La CI doit se déclencher sur la branche qui déploie.** Sur Coparentalité
Zen elle ne tourne que sur `main` alors que la production part de `develop` :
la branche vérifiée n'est pas celle qui est livrée. Corrigé dans le socle.

## 10. Ce qu'il faut refuser

- un test qui reproduit l'implémentation au lieu de vérifier une règle ;
- un test rendu vert en assouplissant l'assertion ;
- un banc de test plus permissif que la production (le péché originel de ce
  projet) ;
- une suite qui dépend de l'ordre d'exécution ;
- un test qui exige un service externe sans possibilité de saut explicite.

## 11. Volume de référence

Coparentalité Zen, à titre d'ordre de grandeur atteignable par une personne
seule :

| Niveau | Volume constaté |
|---|---|
| Unitaires | 43 fichiers de test |
| SQL | 21 suites + 3 jeux d'essai, sur 49 migrations |
| E2E | 1 fichier de parcours |
| Assertions SQL | plusieurs centaines |

⚠ Point de vigilance : `supabase/tests/00046_verification.sql` (12 scénarios de
vérification du paiement partagé) **n'a jamais été exécuté**. Un test écrit et
jamais lancé n'est pas un test. Le socle ajoute une vérification de CI : toute
suite présente dans `supabase/tests/` doit être exécutée par le banc, sinon
échec.
