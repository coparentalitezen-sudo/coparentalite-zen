import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Réponse JSON avec encodage déclaré.
 *
 * Sans « charset=utf-8 », un navigateur interprète les accents comme du
 * latin-1 : « clés » devient « clÃ©s ». Ces routes étant consultées à la main
 * pour diagnostiquer, leurs messages doivent rester lisibles.
 */
function reponseJSON(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}


/**
 * État de la configuration serveur.
 *
 * Dit quelles variables d'environnement sont présentes — jamais leur valeur.
 * Sans cela, une variable oubliée se diagnostique par tâtonnement, ce qui a
 * coûté plusieurs allers-retours.
 *
 * Réservé aux membres d'un foyer : la liste des services configurés n'a pas à
 * être publique.
 */
export const dynamic = 'force-dynamic';

function presente(nom: string): boolean {
  const v = process.env[nom];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Rôle porté par une clé Supabase, sans jamais révéler la clé elle-même.
 *
 * Les clés « anon » et « service_role » sont deux JWT visuellement identiques
 * — tous deux commencent par « eyJhbGci ». Les confondre donne une
 * configuration en apparence correcte mais des appels refusés, sans que rien
 * ne l'indique. Lire le rôle inscrit dans la clé lève l'ambiguïté.
 */
function roleDeLaCle(cle: string | undefined): string {
  if (!cle) return 'absente';
  const valeur = cle.trim();

  // Clés de nouvelle génération : le préfixe suffit
  if (valeur.startsWith('sb_secret_')) return 'service_role (clé secrète)';
  if (valeur.startsWith('sb_publishable_')) return 'anon (clé publiable) — INCORRECTE ICI';

  // Clés historiques : JWT dont on lit la charge utile, sans vérifier la
  // signature (on ne cherche qu'à identifier le rôle déclaré).
  const parties = valeur.split('.');
  if (parties.length !== 3) return 'format non reconnu';
  try {
    const brut = parties[1].replace(/-/g, '+').replace(/_/g, '/');
    const charge = JSON.parse(
      Buffer.from(brut, 'base64').toString('utf8'),
    ) as { role?: string };
    const role = charge.role ?? 'non précisé';
    return role === 'service_role' ? role : `${role} — INCORRECTE ICI`;
  } catch {
    return 'illisible';
  }
}

export async function GET() {
  const supabase = await supabaseServer();
  if (!supabase) {
    return reponseJSON({ message: 'Service indisponible.' }, 503);
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return reponseJSON({ message: 'Connectez-vous.' }, 401);
  }
  const { data: membre } = await supabase
    .from('household_members').select('household_id')
    .eq('profile_id', user.id).is('deleted_at', null);
  if (!membre || membre.length === 0) {
    return reponseJSON({ message: 'Accès réservé aux membres d’un foyer.' }, 403);
  }

  const variables = {
    supabase_url: presente('NEXT_PUBLIC_SUPABASE_URL'),
    supabase_cle_publique: presente('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabase_cle_service: presente('SUPABASE_SERVICE_ROLE_KEY'),
    cron_secret: presente('CRON_SECRET'),
    stripe_cle: presente('STRIPE_SECRET_KEY'),
    stripe_webhook: presente('STRIPE_WEBHOOK_SECRET'),
    stripe_mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live'
      : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'inconnu',
    mentions_legales: presente('NEXT_PUBLIC_LEGAL_NAME')
      && presente('NEXT_PUBLIC_LEGAL_SIREN')
      && presente('NEXT_PUBLIC_LEGAL_ADDRESS')
      && presente('NEXT_PUBLIC_SUPPORT_EMAIL'),
    // Notifications poussées : la clé publique atteint le navigateur, la
    // privée signe les envois. Les deux sont nécessaires.
    push_cle_publique: presente('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    push_cle_privee: presente('VAPID_PRIVATE_KEY'),
    push_contact: presente('VAPID_CONTACT'),
  };

  const roleService = roleDeLaCle(process.env.SUPABASE_SERVICE_ROLE_KEY);

  /**
   * Ce que le serveur calcule réellement comme offre, foyer par foyer.
   *
   * Quand la base porte un abonnement actif et que l'écran continue d'annoncer
   * l'offre gratuite, seul ce relevé départage les deux hypothèses : un droit
   * mal calculé, ou un droit rattaché à un autre foyer que celui consulté. Un
   * compte appartenant à plusieurs foyers rend la seconde très facile.
   */
  const foyers: Record<string, unknown>[] = [];
  for (const m of membre) {
    const hid = m.household_id as string;
    const { data, error } = await supabase.rpc('household_entitlement', { p_household: hid });
    const ligne = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    foyers.push({
      foyer: hid.slice(0, 8),
      offre: error ? `erreur : ${error.message}`
        : ligne?.illimite ? 'Zen Plus' : 'gratuite',
      periodicite: ligne?.periodicite_active ?? null,
      abonnement_actif: ligne?.abonnement_actif ?? null,
      horizon: ligne?.horizon ?? null,
    });
  }

  return reponseJSON({
    version: process.env.NEXT_PUBLIC_VERSION
      ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    variables,
    role_de_la_cle_service: roleService,
    // Un compte peut appartenir à plusieurs foyers : le droit se lit par foyer.
    vos_foyers: foyers,
    // Ce que chaque manque empêche concrètement
    consequences: [
      !variables.supabase_cle_service
        && 'Import des vacances scolaires impossible (SUPABASE_SERVICE_ROLE_KEY manquante).',
      !variables.cron_secret
        && 'Synchronisation hebdomadaire automatique inactive (CRON_SECRET manquante).',
      (!variables.stripe_cle || !variables.stripe_webhook)
        && 'Paiements indisponibles (clés Stripe manquantes).',
      variables.stripe_mode !== 'live'
        && 'Stripe n’est pas en mode live : aucun paiement réel ne sera encaissé.',
      !variables.mentions_legales
        && 'Identité légale incomplète : renseignez les variables NEXT_PUBLIC_LEGAL_* avant vente publique.',
      (!variables.push_cle_publique || !variables.push_cle_privee)
        && 'Notifications poussées inactives (clés VAPID manquantes) : '
           + 'les alertes restent consultables dans l’application.',
      roleService.includes('INCORRECTE')
        && `SUPABASE_SERVICE_ROLE_KEY contient une clé de rôle « ${roleService.split(' ')[0]} » : `
           + 'les traitements sans utilisateur seront refusés. Utilisez la clé service_role.',
    ].filter(Boolean),
  });
}
