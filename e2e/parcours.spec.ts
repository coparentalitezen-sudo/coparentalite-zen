import { test, expect } from '@playwright/test';

/**
 * E2E — parcours réels dans Chromium sur le build de production (mode démo).
 * Ce que ces tests prouvent : navigation, rendu, formulaire d'ajout avec calcul
 * de partage en direct, validations, garde du planning, accessibilité de base.
 * Ce qu'ils ne prouvent PAS : l'authentification Supabase réelle (pas de projet
 * dans cet environnement) — signalé dans le rapport final.
 */

test('page commerciale : promesse, tarifs, mention légale', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('planning de garde');
  await expect(page.getByText('4,99 €/mois', { exact: true })).toBeVisible();
  // la mention légale doit être visible en pied de page (celle de la FAQ est repliée)
  await expect(page.locator('footer')).toContainText('ne remplace ni une décision judiciaire');
  // et la même mention est bien présente dans la FAQ (repliée par défaut)
  await page.getByRole('group').filter({ hasText: 'convention parentale' }).first().click();
  await expect(page.getByText('Il ne remplace ni une décision judiciaire').first()).toBeVisible();
});

test('navigation basse : les 5 onglets mènent aux bons écrans', async ({ page }) => {
  await page.goto('/app/accueil');
  await page.getByRole('link', { name: 'Planning' }).click();
  await expect(page.getByRole('heading', { name: /Juillet 2026/ })).toBeVisible();
  await page.getByRole('link', { name: 'Dépenses' }).click();
  await expect(page.getByRole('heading', { name: 'Dépenses' })).toBeVisible();
  await page.getByRole('link', { name: 'Ajouter' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une dépense' })).toBeVisible();
  await page.getByRole('link', { name: 'Plus', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plus' })).toBeVisible();
});

test('accueil : solde exact et prochain changement calculés par les moteurs', async ({ page }) => {
  await page.goto('/app/accueil');
  await expect(page.getByText('Vous devez recevoir 31,05 €')).toBeVisible();
  await expect(page.getByText(/Prochain changement le/)).toBeVisible();
});

test('planning : bandeau démo et priorité des vacances visibles', async ({ page }) => {
  await page.goto('/app/planning');
  await expect(page.getByText('Version de démonstration')).toBeVisible();
  await expect(page.getByText('remplacent le rythme habituel')).toBeVisible();
  // 22 juillet = vacances première moitié → Camille (badge C dans la cellule du jour)
  const today = page.locator('[class*="ring-navy"]');
  await expect(today).toContainText('22');
});

test('ajout de dépense : validation, aperçu 60/40 exact, confirmation', async ({ page }) => {
  await page.goto('/app/ajouter');

  // validation : montant manquant
  await page.getByRole('button', { name: 'Enregistrer la dépense' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('titre');

  await page.getByPlaceholder('Cantine, pharmacie…').fill('Test E2E');
  await page.getByPlaceholder('24,90').fill('100,01');
  await page.getByRole('button', { name: '60 / 40' }).click();

  // aperçu : plus fort reste → 60,01 € / 40,00 € (mêmes règles que le moteur testé)
  await expect(page.getByText('60,01')).toBeVisible();
  await expect(page.getByText('40,00')).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer la dépense' }).click();
  await expect(page.getByRole('heading', { name: 'Dépense enregistrée' })).toBeVisible();
});

test('ajout de dépense : un justificatif au mauvais format est refusé', async ({ page }) => {
  await page.goto('/app/ajouter');
  await page.setInputFiles('input[type="file"]', {
    name: 'script.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ'),
  });
  await expect(page.locator('p[role="alert"]')).toContainText('Formats acceptés');
});

test('foyer : export RGPD et double confirmation de suppression', async ({ page }) => {
  await page.goto('/app/foyer');
  await expect(page.getByRole('heading', { name: 'Paramètres du foyer' })).toBeVisible();

  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  await expect(page.getByRole('status')).toContainText('Mode démo');

  // suppression du compte : demande une confirmation explicite
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await expect(page.getByText('Cette action est définitive')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toBeVisible();
});

test('invitation : page d’acceptation accessible par lien', async ({ page }) => {
  await page.goto('/invitation/12345678-1234-1234-1234-123456789012');
  await expect(page.getByRole('heading', { name: /Invitation à rejoindre un foyer/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accepter l’invitation' })).toBeVisible();
});

test('auth : pages connexion, inscription, mot de passe oublié rendues', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await expect(page.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();
  await page.goto('/mot-de-passe-oublie');
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
});

test('PWA : manifest servi avec les icônes officielles', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe('Coparentalité Zen');
  expect(m.icons.map((i: { src: string }) => i.src)).toEqual(['/icon-192.png', '/icon-512.png']);
});
