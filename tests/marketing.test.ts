import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nettoyerValeur, lireOrigine, construireLien } from '../src/lib/marketing/utm';
import {
  estAdministrateur, administrateurs, administrationConfiguree,
} from '../src/lib/marketing/administration';

describe('nettoyage des paramètres reçus d’une URL', () => {
  it('conserve une valeur normale', () => {
    expect(nettoyerValeur('instagram')).toBe('instagram');
  });

  it('met en minuscules et coupe les espaces', () => {
    expect(nettoyerValeur('  Instagram  ')).toBe('instagram');
  });

  it('retire tout caractère hors du jeu autorisé', () => {
    expect(nettoyerValeur('<script>alert(1)</script>')).toBe('scriptalert1script');
  });

  it('borne la longueur à 64 caractères', () => {
    expect(nettoyerValeur('a'.repeat(200))).toHaveLength(64);
  });

  it('accepte une valeur absente', () => {
    expect(nettoyerValeur(null)).toBe('');
    expect(nettoyerValeur(undefined)).toBe('');
  });
});

describe('lecture de l’origine', () => {
  it('ne fabrique aucune origine pour une visite directe', () => {
    expect(lireOrigine('')).toBeNull();
    expect(lireOrigine('?page=2')).toBeNull();
  });

  it('lit les trois paramètres attendus', () => {
    const o = lireOrigine('?utm_source=instagram&utm_campaign=acquisition&utm_content=c-042');
    expect(o).toEqual({ source: 'instagram', campagne: 'acquisition', contenu: 'c-042' });
  });

  it('range une source isolée sous des valeurs explicites', () => {
    expect(lireOrigine('?utm_source=facebook'))
      .toEqual({ source: 'facebook', campagne: 'inconnue', contenu: 'inconnu' });
  });

  it('accepte un URLSearchParams', () => {
    const o = lireOrigine(new URLSearchParams({ utm_source: 'instagram' }));
    expect(o?.source).toBe('instagram');
  });
});

describe('construction du lien à publier', () => {
  const lien = construireLien('https://coparentalitezen.fr',
    { source: 'instagram', campagne: 'acquisition', contenu: 'c-042' });

  it('déclare toujours un trafic organique', () => {
    expect(lien).toContain('utm_medium=organic_social');
  });

  it('reprend la source et le contenu', () => {
    expect(lien).toContain('utm_source=instagram');
    expect(lien).toContain('utm_content=c-042');
  });

  it('accepte un chemin autre que la racine', () => {
    const l = construireLien('https://coparentalitezen.fr',
      { source: 'facebook', campagne: 'acquisition', contenu: 'c-1' }, '/inscription');
    expect(new URL(l).pathname).toBe('/inscription');
  });
});

describe('administrateur de la plateforme', () => {
  beforeEach(() => { delete process.env.ADMIN_EMAILS; });
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it('n’ouvre rien tant que la variable est absente', () => {
    expect(administrationConfiguree()).toBe(false);
    expect(estAdministrateur('sekou@exemple.fr')).toBe(false);
  });

  it('reconnaît une adresse déclarée, quelle que soit la casse', () => {
    process.env.ADMIN_EMAILS = 'Sekou@Exemple.fr';
    expect(estAdministrateur('sekou@exemple.fr')).toBe(true);
    expect(estAdministrateur('SEKOU@EXEMPLE.FR')).toBe(true);
  });

  it('accepte plusieurs adresses séparées par des virgules', () => {
    process.env.ADMIN_EMAILS = 'a@exemple.fr, b@exemple.fr';
    expect(administrateurs()).toEqual(['a@exemple.fr', 'b@exemple.fr']);
    expect(estAdministrateur('b@exemple.fr')).toBe(true);
  });

  it('refuse une adresse non déclarée', () => {
    process.env.ADMIN_EMAILS = 'a@exemple.fr';
    expect(estAdministrateur('intrus@exemple.fr')).toBe(false);
  });

  it('refuse une valeur vide ou absente', () => {
    process.env.ADMIN_EMAILS = 'a@exemple.fr';
    expect(estAdministrateur('')).toBe(false);
    expect(estAdministrateur(null)).toBe(false);
    expect(estAdministrateur('   ')).toBe(false);
  });

  it('ignore une entrée qui n’est pas une adresse', () => {
    process.env.ADMIN_EMAILS = 'tout, a@exemple.fr';
    expect(administrateurs()).toEqual(['a@exemple.fr']);
  });
});

describe('leçon de la migration 00044', () => {
  it('n’emploie plus d’index unique partiel comme cible d’un on conflict', async () => {
    // PostgreSQL n'infère pas un index partiel pour un « on conflict (col) »
    // sans en répéter la condition : toutes les écritures échouaient en
    // silence. Une contrainte unique ordinaire autorise déjà plusieurs NULL.
    const fs = await import('node:fs/promises');
    const dossier = 'supabase/migrations';
    const fichiers = (await fs.readdir(dossier)).filter((f) => f.endsWith('.sql'));

    const sql = (await Promise.all(
      fichiers.map((f) => fs.readFile(`${dossier}/${f}`, 'utf8')),
    )).join('\n');

    // La migration 00044 doit supprimer les index fautifs et poser les
    // contraintes qui les remplacent.
    expect(sql).toContain('drop index if exists idx_marketing_contenus_reference');
    expect(sql).toContain('marketing_contenus_reference_unique unique (reference)');
    expect(sql).toContain('marketing_opportunites_reference_unique unique (reference)');
  });
});

describe('leçon de la migration 00045', () => {
  it('donne à chaque plateforme ses propres réglages', async () => {
    // Un réglage partagé entre canaux indépendants est une commande à
    // distance involontaire : activer la publication automatique pour l'un
    // l'activait pour les autres, sans que personne ne l'ait voulu.
    const fs = await import('node:fs/promises');
    const sql = await fs.readFile(
      'supabase/migrations/00045_parametres_par_plateforme.sql', 'utf8');

    expect(sql).toContain('add column if not exists plateforme');
    expect(sql).toContain('marketing_parametres_plateforme_unique unique (plateforme)');
    // Les nouveaux canaux naissent fermés : hériter d'un réglage activé par
    // erreur reviendrait à propager l'erreur.
    expect(sql).toContain("'instagram', 'validation', false");
    expect(sql).toContain("'pinterest', 'validation', false");
  });

  it('n’interroge plus la ligne unique par son ancienne clé', async () => {
    const fs = await import('node:fs/promises');
    const depot = await fs.readFile('src/lib/marketing/depot.ts', 'utf8');
    expect(depot).not.toContain("eq('id', true)");
    expect(depot).toContain("eq('plateforme'");
  });
});
