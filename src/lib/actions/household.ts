'use client';

/** Foyer : création et invitation du second parent. */
import { supabaseBrowser, ok, err, lisible, type ActionResult } from './core';

// ---------------- Invitations ----------------
export async function inviteParent(householdId: string, email: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_invitation', { p_household: householdId, p_email: email });
  if (error) return err(lisible('L’invitation n’a pas pu être créée. Vérifiez l’adresse.', error));
  return ok(data as string);
}

export async function acceptInvitation(token: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
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
  return ok(data as string);
}
