import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  configurationMeta, configurationPrete, etatConfiguration, verifierConnexion,
  permissions, quotaPublication, aptitudes, expirationJeton, VERSION_GRAPH,
} from '@/lib/marketing/meta';
import { lireParametresPlateforme } from '@/lib/marketing/depot';
import { urlVisuelPublic } from '@/lib/marketing/signature';
import { genererSemaine } from '@/lib/marketing/generateur';

/**
 * État de la connexion Meta.
 *
 * Interroge réellement Meta plutôt que de se contenter de constater la
 * présence des variables : une variable renseignée ne prouve pas qu'un jeton
 * soit valide, ni qu'il porte les bonnes autorisations, ni qu'il désigne les
 * bons comptes. C'est la différence entre « ça devrait marcher » et une preuve.
 *
 * Réservée à l'administrateur, et muette sur les valeurs : la réponse ne
 * contient que des booléens, des noms de comptes et des noms d'autorisations.
 * Aucun jeton, aucun identifiant secret.
 */
export const dynamic = 'force-dynamic';

const REQUISES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
];

export async function GET() {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) return new NextResponse('Not found', { status: 404 });

  const brute = configurationMeta();
  const variables = etatConfiguration();
  const [instagramParametres, facebookParametres] = await Promise.all([
    lireParametresPlateforme('instagram'),
    lireParametresPlateforme('facebook'),
  ]);

  // Le visuel est le maillon le plus souvent en cause, et le seul que Meta
  // décrit mal : ses refus parlent de « type de média » quand l'adresse est
  // en réalité injoignable. On expose donc l'adresse exacte qu'il ira
  // chercher, pour qu'elle puisse être ouverte à la main.
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const premier = genererSemaine(new Date(), base).find((c) => c.format === 'publication');
  const urlVisuel = premier ? urlVisuelPublic(base, premier.reference, 0) : null;

  if (!brute) {
    return NextResponse.json({
      connecte: false,
      motif: 'Configuration incomplète.',
      variables,
      version_graph: VERSION_GRAPH,
    });
  }

  // On éprouve la configuration telle qu'elle servira à publier, jeton de
  // page dérivé au besoin. Vérifier autre chose que ce qui publie ne prouve
  // rien — la leçon a coûté deux jetons expirés.
  const prete = await configurationPrete();
  if (!prete.ok) {
    return NextResponse.json({
      connecte: false,
      motif: prete.erreur,
      variables,
      version_graph: VERSION_GRAPH,
    });
  }
  const config = prete.donnees!;

  const [identite, accordees, quota, capacites, echeance] = await Promise.all([
    verifierConnexion(config),
    permissions(config),
    quotaPublication(config),
    aptitudes(config),
    expirationJeton(config),
  ]);

  // La liste déclarative ne vaut que pour un jeton d'utilisateur : un jeton de
  // page renvoie une liste vide, qui se lirait à tort comme « aucun droit ».
  // Elle n'est donc affichée qu'à titre indicatif, et ne décide de rien.
  const obtenues = accordees.donnees ?? [];
  const manquantes = obtenues.length === 0
    ? []
    : REQUISES.filter((p) => !obtenues.includes(p));

  return NextResponse.json({
    // Le verdict repose sur ce que le jeton fait, pas sur ce qu'il déclare.
    connecte: identite.ok && capacites.instagram,
    version_graph: VERSION_GRAPH,
    variables,
    page: identite.donnees?.page ?? null,
    instagram: identite.donnees?.instagram ?? null,
    erreur_identite: identite.ok ? null : identite.erreur,
    permissions_declarees: obtenues,
    permissions_manquantes: manquantes,
    diagnostic_instagram: capacites.detailInstagram,
    diagnostic_facebook: capacites.detailFacebook,
    // Facebook et Instagram sont distingués : Facebook peut manquer sans
    // empêcher Instagram de publier, et l'inverse n'est pas vrai.
    peut_publier_instagram: capacites.instagram,
    peut_publier_facebook: capacites.facebook,
    quota_publications: quota.donnees ?? null,
    // Sans CRON_SECRET, aucune adresse ne peut être signée : le lien serait
    // vide et Meta n'aurait rien à récupérer.
    // L'échéance doit être lisible avant de publier, pas découverte à
    // l'échec : c'est ce qui manquait quand un jeton de deux heures a été
    // enregistré à la place d'un jeton de deux mois.
    jeton_expire_le: echeance.date,
    jeton_echeance_connue: echeance.connue,
    jeton_echeance_motif: echeance.motif ?? null,
    jeton_derive_automatiquement: config.jeton !== brute.jeton,
    visuel_signable: Boolean(urlVisuel),
    visuel_url: urlVisuel,
    // Conserver les réglages séparés évite qu'un diagnostic Instagram fasse
    // croire que Facebook est actif, ou inversement.
    reglages_instagram: {
      mode: instagramParametres?.mode ?? 'validation',
      actif: instagramParametres?.actif ?? false,
    },
    reglages_facebook: {
      mode: facebookParametres?.mode ?? 'validation',
      actif: facebookParametres?.actif ?? false,
    },
  });
}
