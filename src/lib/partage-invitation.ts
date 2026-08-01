/**
 * Transmission du lien d'invitation.
 *
 * L'application n'envoie pas le message elle-même : elle ouvre l'application
 * de messagerie du téléphone avec un texte prêt. Ce choix évite un service
 * tiers payant, mais surtout : le second parent reçoit le message depuis un
 * numéro qu'il connaît, pas d'un expéditeur anonyme qu'il prendrait pour du
 * démarchage.
 *
 * Fonctions pures, testables sans navigateur.
 */

/**
 * Numéro français ramené au format international.
 * « 06 12 34 56 78 » et « +33 6 12 34 56 78 » donnent tous deux « +33612345678 ».
 */
export function normaliserTelephone(saisie: string): string | null {
  const brut = saisie.replace(/[\s.\-()]/g, '');
  if (!brut) return null;

  if (/^\+\d{8,15}$/.test(brut)) return brut;
  // 0X XX XX XX XX → indicatif français
  if (/^0\d{9}$/.test(brut)) return `+33${brut.slice(1)}`;
  // 33XXXXXXXXX sans le plus
  if (/^33\d{9}$/.test(brut)) return `+${brut}`;
  return null;
}

/** Affichage lisible : « +33612345678 » → « 06 12 34 56 78 ». */
export function formaterTelephone(numero: string): string {
  const n = normaliserTelephone(numero);
  if (!n) return numero;
  if (n.startsWith('+33') && n.length === 12) {
    const local = `0${n.slice(3)}`;
    return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  return n;
}

/**
 * Message d'invitation.
 *
 * Court à dessein : un SMS long est tronqué, et le lien doit rester visible
 * sans avoir à déplier le message. Le prénom de l'expéditeur rassure sur
 * l'origine.
 */
export function messageInvitation(prenomExpediteur: string, lien: string): string {
  const de = prenomExpediteur.trim() || 'Votre coparent';
  return `${de} vous invite à rejoindre Coparentalité Zen pour partager le `
    + `planning de garde et les dépenses des enfants : ${lien}`;
}

/** Lien « sms: » ouvrant la messagerie avec le texte prêt. */
export function lienSMS(numero: string | null, message: string): string {
  const n = numero ? normaliserTelephone(numero) : null;
  // Le séparateur diffère selon la plateforme : « & » sur iOS, « ? » ailleurs.
  // « ?body= » fonctionne sur les deux quand le numéro est présent.
  const corps = encodeURIComponent(message);
  return n ? `sms:${n}?&body=${corps}` : `sms:?&body=${corps}`;
}

/** Lien « mailto: » pour transmettre par courriel. */
export function lienCourriel(adresse: string, message: string): string {
  const sujet = encodeURIComponent('Rejoignez-moi sur Coparentalité Zen');
  return `mailto:${adresse}?subject=${sujet}&body=${encodeURIComponent(message)}`;
}
