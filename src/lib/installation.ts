/**
 * Détection de la plateforme et de l'état d'installation.
 *
 * L'application s'installe différemment selon l'appareil, et l'invitation à
 * le faire n'a aucun sens une fois l'installation effectuée. Ces fonctions
 * pures permettent de tester ces cas sans navigateur.
 */

export type Plateforme = 'ios' | 'android' | 'bureau' | 'inconnue';

/**
 * L'application tourne-t-elle depuis l'écran d'accueil ?
 *
 * Deux signaux, car aucun n'est universel : `display-mode: standalone` est la
 * norme, `navigator.standalone` la propriété historique de Safari sur iOS.
 */
export function estInstallee(
  correspond: (requete: string) => boolean,
  standaloneIOS: boolean | undefined,
): boolean {
  return correspond('(display-mode: standalone)')
    || correspond('(display-mode: fullscreen)')
    || correspond('(display-mode: minimal-ui)')
    || standaloneIOS === true;
}

/** Plateforme déduite de l'agent utilisateur. */
export function detecterPlateforme(agent: string, tactile = false): Plateforme {
  if (/iPad|iPhone|iPod/.test(agent)) return 'ios';
  // Depuis iPadOS 13, un iPad se présente comme un Mac : seul le tactile
  // permet de les distinguer.
  if (/Macintosh/.test(agent) && tactile) return 'ios';
  if (/Android/.test(agent)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(agent)) return 'bureau';
  return 'inconnue';
}

export interface EtapeInstallation {
  numero: number;
  texte: string;
}

/**
 * Marche à suivre, propre à chaque plateforme.
 *
 * Les intitulés reprennent ceux affichés par le système, pour qu'un parent
 * retrouve exactement ce qu'il lit à l'écran.
 */
export function etapesInstallation(plateforme: Plateforme): EtapeInstallation[] {
  switch (plateforme) {
    case 'ios':
      return [
        { numero: 1, texte: 'Touchez le bouton Partager, en bas de l’écran' },
        { numero: 2, texte: 'Faites défiler et choisissez « Sur l’écran d’accueil »' },
        { numero: 3, texte: 'Touchez « Ajouter », en haut à droite' },
      ];
    case 'android':
      return [
        { numero: 1, texte: 'Ouvrez le menu ⋮, en haut à droite' },
        { numero: 2, texte: 'Choisissez « Installer l’application »' },
        { numero: 3, texte: 'Confirmez avec « Installer »' },
      ];
    case 'bureau':
      return [
        { numero: 1, texte: 'Cliquez sur l’icône d’installation, dans la barre d’adresse' },
        { numero: 2, texte: 'Confirmez avec « Installer »' },
      ];
    default:
      return [
        { numero: 1, texte: 'Ouvrez le menu de votre navigateur' },
        { numero: 2, texte: 'Cherchez « Installer » ou « Ajouter à l’écran d’accueil »' },
      ];
  }
}

/** Ce que l'installation apporte concrètement, selon la plateforme. */
export function beneficesInstallation(plateforme: Plateforme): string[] {
  const communs = [
    'Ouverture directe depuis l’écran d’accueil',
    'Affichage plein écran, sans barre de navigateur',
  ];
  if (plateforme === 'ios') {
    // Sur iPhone, c'est la seule façon d'obtenir les alertes : la mention
    // n'est pas un argument commercial mais une information nécessaire.
    return [...communs, 'Alertes sur votre téléphone — indispensable sur iPhone'];
  }
  return [...communs, 'Alertes sur votre téléphone, même application fermée'];
}

/**
 * Sur Android, seul Chrome produit une installation acceptée par Play Protect.
 *
 * Chrome fait générer l'APK de la PWA (WebAPK) par Google, qui cible une
 * version récente d'Android. Les autres navigateurs (Samsung Internet, Edge,
 * Opera, Xiaomi…) fabriquent leur propre APK, qui cible une version ancienne :
 * Play Protect le bloque alors comme « appli non sécurisée ». Les navigateurs
 * intégrés (Instagram, Facebook, WebView) ne savent pas installer du tout.
 */
const NAVIGATEURS_NON_CHROME =
  /SamsungBrowser|EdgA|EdgiOS|OPR|OPT|Opera|Firefox|FxiOS|MiuiBrowser|XiaoMi|YaBrowser|UCBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|DuckDuckGo|Brave|Vivaldi|Silk|FBAN|FBAV|Instagram|Snapchat|TikTok|musical_ly|Pinterest|; wv\)/i;

export function estChromeAndroid(agent: string): boolean {
  if (!/Android/.test(agent)) return false;
  if (!/Chrome\/\d/.test(agent)) return false;
  return !NAVIGATEURS_NON_CHROME.test(agent);
}

/**
 * Lien qui rouvre la page courante dans Chrome sur Android.
 *
 * Si Chrome est absent, Android suit `browser_fallback_url` vers sa fiche
 * Play Store plutôt que d'échouer en silence.
 */
export function lienOuvrirDansChrome(url: string): string {
  const cible = new URL(url);
  const secours = encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome');
  return `intent://${cible.host}${cible.pathname}${cible.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${secours};end`;
}
