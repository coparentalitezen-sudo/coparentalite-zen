/**
 * Envoi de courriels par Resend.
 *
 * Une dépendance de moins : l'API tient en un appel HTTP, et le paquet
 * officiel n'apporterait qu'une couche à tenir à jour.
 *
 * Le gabarit visuel vit dans emails/base.html et n'est pas dupliqué ici : les
 * notifications ont besoin d'un cadre sobre, pas d'une mise en page nouvelle.
 */

export interface ConfigEmail {
  cle: string;
  expediteur: string;
  origine: string;
}

export function configEmail(): ConfigEmail | null {
  const cle = process.env.RESEND_API_KEY?.trim();
  if (!cle) return null;
  const expediteur = process.env.EMAIL_FROM?.trim()
    || 'Coparentalité Zen <notifications@coparentalitezen.fr>';
  const origine = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return { cle, expediteur, origine };
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Gabarit d'une notification.
 *
 * Sobre à dessein. Ces messages annoncent des changements de garde à des
 * parents séparés : ils doivent se lire en trois secondes, sans images ni
 * couleurs qui les feraient ressembler à une réclame.
 */
export function gabaritNotification(
  prenom: string, titre: string, corps: string | null, lien: string | null,
): { html: string; texte: string } {
  const bouton = lien
    ? `<p style="margin:24px 0 0;"><a href="${echapper(lien)}"
         style="background:#2B4257;color:#fff;text-decoration:none;padding:12px 22px;
                border-radius:10px;display:inline-block;font-weight:700;">Ouvrir l’application</a></p>`
    : '';

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#FAF7F2;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
      <p style="margin:0 0 24px;font-size:13px;color:#7A8794;">Coparentalité Zen</p>
      <div style="background:#fff;border-radius:20px;padding:24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#7A8794;">Bonjour ${echapper(prenom)},</p>
        <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#1B2B3A;">${echapper(titre)}</h1>
        ${corps ? `<p style="margin:0;font-size:15px;line-height:1.55;color:#3E4C5A;">${echapper(corps)}</p>` : ''}
        ${bouton}
      </div>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9AA5B1;">
        Vous recevez ce message parce que vous suivez ce type d’événement.
        Vous pouvez le désactiver dans l’application, rubrique Notifications.
      </p>
    </div></body></html>`;

  const texte = [
    `Bonjour ${prenom},`, '', titre, corps ?? '', '',
    lien ? `Ouvrir : ${lien}` : '', '',
    'Pour ne plus recevoir ce type de message : rubrique Notifications de l’application.',
  ].filter((l) => l !== null).join('\n');

  return { html, texte };
}

/**
 * Remet un message à Resend.
 *
 * Rend null si tout va bien, le motif sinon. L'appelant trace l'un comme
 * l'autre : un échec silencieux vaudrait pire qu'un envoi manqué, puisqu'il
 * laisserait croire que le parent a été prévenu.
 */
export async function envoyerEmail(
  config: ConfigEmail,
  destinataire: string,
  objet: string,
  html: string,
  texte: string,
): Promise<string | null> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cle}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.expediteur,
        to: [destinataire],
        subject: objet,
        html,
        text: texte,
      }),
    });
    if (r.ok) return null;
    const detail = await r.text();
    return `${r.status} · ${detail.slice(0, 160)}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
