'use client';

/** Foyer : création et invitation du second parent. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

// ---------------- Invitations ----------------
/**
 * Crée un lien d'invitation.
 *
 * L'adresse e-mail verrouille l'invitation à une personne précise : le lien
 * transféré ne sert alors à rien. Sans adresse, le lien devient le seul
 * secret — d'où l'avertissement affiché à l'écran.
 */
export interface LienInvitation {
  jeton: string;
  /** Code à six chiffres, uniquement si l'invitation n'a pas d'adresse. */
  code: string | null;
}

export async function inviteParent(
  householdId: string, email: string, telephone?: string | null,
): Promise<ActionResult<LienInvitation>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_invitation', {
    p_household: householdId,
    p_email: email.trim() || null,
    p_phone: telephone?.trim() || null,
  });
  // Le détail accompagne le message : sans lui, un refus de la base est
  // indiscernable d'un bouton resté sans effet.
  if (error) return err(
    lisible('L’invitation n’a pas pu être créée. Vérifiez les coordonnées.', error),
    detail(error),
  );
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return ok({
    jeton: l.jeton as string,
    code: (l.code as string) ?? null,
  });
}

export async function acceptInvitation(
  token: string, code?: string,
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token, p_code: code ?? null });
  if (error) {
    const raw = error.message ?? '';
    const message = raw.includes('expiré') ? 'Cette invitation a expiré. Demandez-en une nouvelle.'
      : raw.includes('déjà') ? 'Cette invitation a déjà été utilisée.'
      : raw.includes('révoquée') ? 'Cette invitation a été révoquée — utilisez le lien le plus récent.'
      : raw.includes('introuvable') || raw.toLowerCase().includes('uuid') ? 'Lien incomplet ou erroné : recopiez-le en entier.'
      : raw.includes('autre adresse e-mail') ? 'Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec le compte destinataire.'
      : raw.includes('autre foyer') ? 'Vous appartenez déjà à un autre foyer. Quittez-le avant de rejoindre celui-ci.'
      : raw.includes('déjà membre') ? 'Vous êtes déjà membre de ce foyer.'
      : raw.includes('aucune adresse') ? 'Cette invitation n’est rattachée à aucune adresse e-mail : demandez-en une nouvelle.'
      : raw.includes('Authentification') ? 'Connectez-vous d’abord, puis rouvrez ce lien.'
      : lisible('Cette invitation n’a pas pu être acceptée.', error);
    return err(message);
  }
  // Retour nul = code de confirmation erroné. La base ne lève pas d'exception
  // dans ce cas, sans quoi le comptage des tentatives serait annulé.
  if (data === null) return err('CODE_INCORRECT');
  return ok(data as string);
}


/**
 * Nomme le second parent avant son inscription.
 *
 * Le premier parent peut ainsi configurer entièrement son foyer — rythme,
 * vacances, dépenses — puis inviter l'autre une fois tout prêt. À
 * l'acceptation de l'invitation, le compte réel prend la place du profil
 * provisoire et hérite de tout ce qui lui était rattaché.
 */
export async function nommerSecondParent(
  householdId: string, prenom: string,
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  if (!prenom.trim()) return err('Indiquez le prénom du second parent.');
  const { data, error } = await supabase.rpc('nommer_second_parent', {
    p_household: householdId, p_prenom: prenom.trim(),
  });
  if (error) return err(lisible('Le second parent n’a pas pu être enregistré.', error));
  return ok(data as string);
}


/** Cette invitation demandera-t-elle un code ? Consultable sans compte. */
export async function invitationExigeCode(jeton: string): Promise<ActionResult<boolean>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('invitation_exige_code', { p_token: jeton });
  if (error) return err(lisible('Invitation illisible.', error), detail(error));
  return ok(Boolean(data));
}

/** Essais restants avant révocation, pour l'annoncer au destinataire. */
export async function tentativesRestantes(jeton: string): Promise<ActionResult<number>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('invitation_tentatives_restantes', {
    p_token: jeton,
  });
  if (error) return err(lisible('Information indisponible.', error));
  return ok(Number(data ?? 0));
}
