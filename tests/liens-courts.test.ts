import { describe, expect, it } from 'vitest';
import { GET as ouvrirInstagram } from '../src/app/i/route';
import { GET as ouvrirFacebook } from '../src/app/f/route';

describe('liens courts des réseaux sociaux', () => {
  it('redirige /i vers le quiz avec une origine Instagram contrôlée', () => {
    const reponse = ouvrirInstagram(new Request(
      'https://coparentalitezen.fr/i?utm_source=parametre_hostile',
    ));

    expect(reponse.status).toBe(307);
    expect(reponse.headers.get('location')).toBe(
      'https://coparentalitezen.fr/quiz?utm_source=instagram&utm_medium=organic_social&utm_campaign=lancement_quiz&utm_content=bio_reel',
    );
  });

  it('redirige /f vers le quiz avec une origine Facebook contrôlée', () => {
    const reponse = ouvrirFacebook(new Request('https://coparentalitezen.fr/f'));

    expect(reponse.status).toBe(307);
    expect(reponse.headers.get('location')).toBe(
      'https://coparentalitezen.fr/quiz?utm_source=facebook&utm_medium=organic_social&utm_campaign=lancement_quiz&utm_content=publication',
    );
  });
});
