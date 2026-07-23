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
  await expect(page.getByRole('heading', { level: 1 })).toContainText('planning de garde');
  await expect(page.getByText('4,99 €/mois', { exact: true })).toBeVisible();
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
  for (const route of ['/app/planning', '/app/depenses', '/app/ajouter', '/app/plus', '/app/foyer', '/app/enfants']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/connexion/);
  }
});

test('connexion : champs, liens, message d’erreur explicite', async ({ page }) => {
  await page.goto('/connexion');
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

test('PWA : manifest servi avec les icônes officielles', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe('Coparentalité Zen');
  expect(m.icons.map((i: { src: string }) => i.src)).toEqual(['/icon-192.png', '/icon-512.png']);
  expect(m.start_url).toBe('/app/accueil');
});

test('métadonnées sociales et favicon présents', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fr_FR');
  const favicon = await page.request.get('/favicon.ico');
  expect(favicon.ok()).toBeTruthy();
});
