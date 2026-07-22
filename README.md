# Coparentalité Zen — Application (Next.js 15 + Supabase)

## Démarrage
```bash
npm install
npm run dev        # http://localhost:3000 — mode démo (données fictives)
npm test           # 34 tests moteurs (planning + budget)
npm run typecheck  # TypeScript strict
npm run build      # build de production (vérifié : 12 routes)
```

## Mode démo vs production
Sans variables d'environnement, l'app tourne en **mode démonstration** : navigation
complète avec données fictives, bandeau « Version de démonstration » affiché.
Pour la production, créer `.env.local` :
```
NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
```
puis appliquer les migrations du dossier `supabase/migrations/` (voir RAPPORT-TESTS-BDD.md).

## Structure
- `src/lib/custody.ts`, `src/lib/money.ts` — moteurs métier testés (34 tests)
- `src/lib/demo-data.ts` — données fictives du mode démo
- `src/lib/supabase/` — clients navigateur et serveur
- `src/app/` — landing, connexion, inscription, et `/app/*` (accueil, planning, ajouter, dépenses, plus)
- `src/app/globals.css` — design tokens extraits du logo officiel
- `public/` — logo, symbole, icônes PWA, favicon, image Open Graph
- `supabase/` — migrations, RLS, tests d'isolation (voir zips précédents)

## État honnête (22/07/2026)
Fonctionnel et testé : moteurs, build, rendu SSR des 5 écrans, PWA manifest, mode démo.
Fonctionnel non testé en conditions réelles : formulaires Supabase Auth (nécessitent un projet Supabase).
Non développé : écrans détaillés du menu Plus, justificatifs, messagerie, rapports PDF, e-mails, Stripe.
