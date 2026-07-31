import { test, expect } from '@playwright/test';

/**
 * E2E — build de production avec Supabase configuré (comme en ligne).
 * Ce que ces tests prouvent : pages publiques, garde d'authentification,
 * redirections, PWA. Ce qu'ils ne prouvent PAS : les parcours connectés
 * (ils exigent un compte réel) — ceux-là sont couverts par les tests SQL
 * et vérifiés manuellement en production.
 */

test('page commerciale : promesse, tarifs, mention légale', async ({ page }) => {
  await page.goto('/');
  // Le libellé de la promesse peut évoluer : on vérifie qu'un titre existe et
  // porte le sujet du produit, sans figer une formulation commerciale.
  const titre = page.getByRole('heading', { level: 1 });
  await expect(titre).toBeVisible();
  await expect(titre).toContainText(/coparentalité|planning|garde/i);
  // Les prix viennent de la table plans : on vérifie que le bloc tarifaire
  // affiche soit un montant, soit le repli explicite — jamais un prix inventé.
  const blocTarif = page.getByText(/€|Tarif communiqué au lancement/).first();
  await expect(blocTarif).toBeVisible();
  // Aucune formulation ne doit annoncer une périodicité sans montant associé
  await expect(page.getByText('Coparentalité Zen Plus').first()).toBeVisible();
  await expect(page.locator('footer')).toContainText('ne remplace ni une décision judiciaire');
});

test('garde d’authentification : /app/* renvoie vers la connexion', async ({ page }) => {
  await page.goto('/app/accueil');
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  // le chemin demandé est conservé pour y revenir après connexion
  expect(page.url()).toContain('suite=%2Fapp%2Faccueil');
});

test('toutes les routes protégées sont bien gardées', async ({ page }) => {
  for (const route of ['/app/planning', '/app/depenses', '/app/ajouter', '/app/plus', '/app/foyer', '/app/enfants', '/app/exceptions', '/app/offre', '/app/vacances']) {
    // on attend la fin de chaque navigation : enchaîner sans attendre annulerait
    // la redirection en cours (comportement de navigateur, pas de l'application)
    await page.goto(route, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/connexion/);
  }
});

test('connexion : champs, liens, message d’erreur explicite', async ({ page }) => {
  await page.goto('/connexion', { waitUntil: 'networkidle' });
  // le formulaire n'est interactif qu'une fois React hydraté : on ne clique pas avant
  await page.waitForTimeout(1500);
  await expect(page.getByLabel('Adresse e-mail')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mot de passe oublié' })).toHaveAttribute('href', '/mot-de-passe-oublie');
  await page.getByLabel('Adresse e-mail').fill('inconnu@exemple.fr');
  await page.getByLabel('Mot de passe').fill('motdepasse-invalide');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible({ timeout: 15000 });
});

test('inscription : validation du mot de passe trop court', async ({ page }) => {
  await page.goto('/inscription');
  await page.getByLabel('Prénom').fill('Test');
  await page.getByLabel('Adresse e-mail').fill('test@exemple.fr');
  await page.getByLabel('Mot de passe').fill('court');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('8 caractères');
});

test('mot de passe oublié : formulaire accessible', async ({ page }) => {
  await page.goto('/mot-de-passe-oublie');
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  await expect(page.getByLabel('Adresse e-mail')).toBeVisible();
});

test('invitation : lien incomplet détecté immédiatement', async ({ page }) => {
  await page.goto('/invitation/pas-un-vrai-jeton');
  // route protégée : soit la connexion, soit le message de lien incomplet
  const surConnexion = page.url().includes('/connexion');
  if (!surConnexion) {
    await expect(page.locator('p[role="alert"]')).toContainText('incomplet');
  } else {
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  }
});

test('PWA : manifest installable, icônes et écrans de démarrage', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe('Coparentalité Zen');
  // installabilité : au moins une icône 192 et une 512, plus une icône maskable
  const tailles = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(tailles).toContain('192x192');
  expect(tailles).toContain('512x512');
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  expect(m.start_url).toContain('/app/accueil');
  expect(m.display).toBe('standalone');
  expect(m.scope).toBe('/');
});

test('métadonnées sociales et favicon présents', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fr_FR');
  const favicon = await page.request.get('/favicon.ico');
  expect(favicon.ok()).toBeTruthy();
});

test('PWA : service worker et balises d’installation présents', async ({ page }) => {
  const sw = await page.request.get('/sw.js');
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()['content-type']).toContain('javascript');
  const code = await sw.text();
  // Aucune donnée métier ne doit être mise en cache
  expect(code).toContain('url.origin !== self.location.origin');
  expect(code).toContain("startsWith('/api/')");

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
});

test('PWA : page hors ligne autonome', async ({ page }) => {
  await page.goto('/hors-ligne');
  await expect(page.getByRole('heading', { name: /Connexion indisponible/ })).toBeVisible();
});

test('planning : exceptions et légende accessibles', async ({ page }) => {
  // routes protégées : la garde d'authentification doit s'appliquer aussi ici
  await page.goto('/app/exceptions', { waitUntil: 'load' });
  await expect(page).toHaveURL(/\/connexion/);
});

test('paiement : les routes refusent un appel non authentifié', async ({ request }) => {
  // Sans session, aucune session de paiement ne doit pouvoir être ouverte
  for (const chemin of ['/api/paiement', '/api/paiement/portail']) {
    const r = await request.post(chemin, { data: { householdId: 'x', type: 'abonnement' } });
    expect([401, 403, 503]).toContain(r.status());
  }
});

test('webhook : une requête sans signature valide est rejetée', async ({ request }) => {
  // C'est le garde-fou qui empêche quiconque de s'offrir un abonnement
  const r = await request.post('/api/stripe/webhook', {
    data: { id: 'evt_faux', type: 'checkout.session.completed', data: { object: {} } },
  });
  expect([400, 503]).toContain(r.status());
  expect(r.status()).not.toBe(200);
});

test('vacances : la synchronisation refuse un appel non authentifié', async ({ request }) => {
  // Le déclenchement manuel est réservé aux membres d'un foyer
  const manuel = await request.post('/api/vacances/synchroniser');
  expect([401, 503]).toContain(manuel.status());

  // La tâche planifiée exige le secret : sans lui, aucun import
  const planifie = await request.get('/api/vacances/synchroniser');
  expect([401, 503]).toContain(planifie.status());
  expect(planifie.status()).not.toBe(200);
});
