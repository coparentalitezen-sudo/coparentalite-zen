export const LEGAL_VERSION = '2026-08-02';

export const legal = {
  nom: process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || 'Coparentalité Zen',
  forme: process.env.NEXT_PUBLIC_LEGAL_FORM?.trim() || 'Éditeur indépendant',
  siren: process.env.NEXT_PUBLIC_LEGAL_SIREN?.trim() || 'À compléter',
  adresse: process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || 'À compléter',
  responsable: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR?.trim() || 'À compléter',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'contact@coparentalitezen.fr',
  mediation: process.env.NEXT_PUBLIC_MEDIATOR?.trim() || 'À compléter avant commercialisation publique',
};
