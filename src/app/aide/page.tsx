import type { Metadata } from 'next';
import { Aide } from '@/components/aide';
import { legal } from '@/lib/legal';

/**
 * Page d'aide.
 *
 * Rendue côté serveur pour lire l'identité légale : les variables sans préfixe
 * NEXT_PUBLIC_ ne franchissent pas la frontière du navigateur, et l'adresse
 * d'assistance y apparaîtrait vide.
 */
export const metadata: Metadata = {
  title: 'Aide — Coparentalité Zen',
  description:
    'Diagnostic guidé, questions fréquentes et marche à suivre pour signaler un problème.',
};

export default function PageAide() {
  return <Aide courriel={legal.email} />;
}
