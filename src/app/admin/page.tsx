import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { enregistrerSemaine, lireParametres, lireStatuts } from '@/lib/marketing/depot';
import { semaineIso } from '@/lib/marketing/generateur';
import { urlVisuelPublic } from '@/lib/marketing/signature';
import { AdminSemaine, type ContenuAffiche } from '@/components/admin-semaine';

/**
 * Administration du dispositif de publication.
 *
 * Rendue à la demande, jamais mise en cache : son contenu dépend de qui
 * regarde. Un rendu statique servirait la même page à tout le monde, ce qui
 * reviendrait à n'avoir aucun contrôle d'accès.
 *
 * Un visiteur non autorisé reçoit un 404, pas un 403 : rien n'indique qu'il
 * existe ici quelque chose à forcer.
 */
export const dynamic = 'force-dynamic';

export default async function PageAdmin() {
  const supabase = await supabaseServer();
  if (!supabase) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const maintenant = new Date();

  // L'enregistrement est rejouable : ouvrir la page deux fois ne crée pas une
  // seconde série de brouillons, les références étant uniques en base.
  const contenus = await enregistrerSemaine(maintenant, base);
  const [parametres, statuts] = await Promise.all([
    lireParametres(),
    lireStatuts(contenus.map((c) => c.reference)),
  ]);

  const affiches: ContenuAffiche[] = contenus.map((c) => ({
    reference: c.reference,
    jour: c.jour,
    format: c.format,
    categorie: c.categorie,
    niche: c.niche,
    accroche: c.accroche,
    legendeInstagram: c.legendeInstagram,
    legendeFacebook: c.legendeFacebook,
    texteAlternatif: c.texteAlternatif,
    pages: c.pages,
    // L'adresse signée, celle-là même que Meta ira chercher. Faire pointer le
    // lien vers la version réservée à l'administrateur montrerait une image
    // que Meta ne voit pas : l'essai ne prouverait rien.
    urlsVisuels: c.pages.map((_, i) => urlVisuelPublic(base, c.reference, i) ?? ''),
    statut: statuts[c.reference]?.statut ?? 'en_attente',
  }));

  return (
    <AdminSemaine
      contenus={affiches}
      actif={parametres?.actif ?? false}
      mode={parametres?.mode ?? 'validation'}
      semaine={`semaine ${semaineIso(maintenant)}`}
    />
  );
}
