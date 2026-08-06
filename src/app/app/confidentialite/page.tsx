import { legal } from '@/lib/legal';
import ConfidentialiteClient from './client';

/**
 * L'adresse de contact vient d'une variable sans préfixe public : elle ne
 * franchit pas la frontière du navigateur. Cette page la lit donc côté
 * serveur et la transmet en propriété, plutôt que de laisser le composant
 * client la chercher dans un environnement où elle n'existe pas.
 */
export default function Confidentialite() {
  return <ConfidentialiteClient contact={legal.email} />;
}
