import { describe, it, expect } from 'vitest';
import { checkFile, buildStoragePath, formatBytes, MAX_JUSTIFICATIF_BYTES } from '../src/lib/files';

const HH = 'aaaaaaaa-0000-0000-0000-000000000001';
const FID = 'bbbbbbbb-1111-2222-3333-444444444444';

describe('checkFile — validation des justificatifs', () => {
  it('accepte PDF, JPEG, PNG, HEIC sous la limite', () => {
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/heic']) {
      expect(checkFile({ type, size: 1024, name: 'f' })).toEqual({ ok: true });
    }
  });
  it('rejette les types non autorisés (exécutables, SVG, zip…)', () => {
    for (const type of ['application/zip', 'image/svg+xml', 'text/html', 'application/x-msdownload']) {
      const r = checkFile({ type, size: 1024, name: 'f' });
      expect(r.ok).toBe(false);
    }
  });
  it('rejette un fichier vide et un fichier trop lourd', () => {
    expect(checkFile({ type: 'application/pdf', size: 0, name: 'f' }).ok).toBe(false);
    expect(checkFile({ type: 'application/pdf', size: MAX_JUSTIFICATIF_BYTES + 1, name: 'f' }).ok).toBe(false);
    expect(checkFile({ type: 'application/pdf', size: MAX_JUSTIFICATIF_BYTES, name: 'f' }).ok).toBe(true);
  });
});

describe('buildStoragePath — chemins Storage sûrs', () => {
  it('construit {foyer}/{uuid}.{ext} sans le nom d’origine', () => {
    expect(buildStoragePath(HH, 'application/pdf', FID)).toBe(`${HH}/${FID}.pdf`);
    expect(buildStoragePath(HH, 'image/jpeg', FID)).toBe(`${HH}/${FID}.jpg`);
  });
  it('rejette les identifiants non-UUID (injection de chemin impossible)', () => {
    expect(() => buildStoragePath('../autre-foyer', 'application/pdf', FID)).toThrow(/foyer invalide/);
    expect(() => buildStoragePath(HH, 'application/pdf', '../../etc/passwd')).toThrow(/fichier invalide/);
  });
});

describe('formatBytes', () => {
  it('formats lisibles en français', () => {
    expect(formatBytes(500)).toBe('500 o');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(1572864)).toBe('1,5 Mo');
  });
});
