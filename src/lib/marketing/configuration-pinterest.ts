/** Configuration publique partagée entre la balise du site et l'administration. */
export const PINTEREST_DOMAIN_VERIFICATION =
  process.env.NEXT_PUBLIC_PINTEREST_DOMAIN_VERIFY?.trim()
  || '188783d6df41954e9533962958e31521';
