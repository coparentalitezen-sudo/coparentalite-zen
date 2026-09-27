import { urlVisuelPublic } from './signature';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Garder la rotation initiale pour que les URL datées déjà publiées ne changent pas. */
const HISTOIRES_ORIGINALES = [
  ['garde', 'Ce week-end, qui accueille les enfants ?', 'Le planning est visible par chacun.'],
  ['depenses', 'Le reçu du sport, il est où ?', 'La dépense est retrouvée au même endroit.'],
  ['vacances', 'Qui prend la première semaine ?', 'Les dates sont posées dans le calendrier.'],
  ['garde', 'Le sac de classe est chez qui ?', 'Préparez le prochain passage de relais.'],
  ['depenses', 'Cette sortie a déjà été payée ?', 'Retrouvez le montant partagé.'],
  ['vacances', 'Les billets sont pris pour quelles dates ?', 'Consultez les périodes prévues ensemble.'],
  ['garde', 'Vendredi, on se retrouve à quelle heure ?', 'Le planning donne un repère aux deux parents.'],
  ['depenses', 'Qui a avancé les frais scolaires ?', 'Un suivi commun évite de chercher les reçus.'],
  ['vacances', 'Le départ approche, tout est calé ?', 'Un calendrier aide à anticiper.'],
  ['garde', 'Une semaine sur deux : laquelle ?', 'Visualisez les jours de garde.'],
  ['depenses', 'Il reste quoi à régulariser ?', 'Suivez les dépenses à vérifier.'],
  ['vacances', 'Les vacances changent le rythme ?', 'Voyez les dates au même endroit.'],
  ['garde', 'Qui récupère les enfants demain ?', 'Un coup d’œil au planning suffit.'],
  ['depenses', 'Le montant était de combien ?', 'La dépense enregistrée reste consultable.'],
  ['vacances', 'Cette semaine, c’est chez qui ?', 'Retrouvez la répartition prévue.'],
  ['garde', 'Deux agendas, deux versions ?', 'Partagez un même calendrier de garde.'],
  ['depenses', 'Cette activité concerne quel enfant ?', 'Gardez le détail avec la dépense.'],
  ['vacances', 'Quand préparer la valise ?', 'Les dates sont claires avant le départ.'],
] as const;

/** À partir du 28 septembre, sept scènes et quatre semaines de textes distincts. */
const HISTOIRES_NOUVELLES = [
  ['sac', 'Le sac de sport est resté chez l’autre parent ?', 'Préparez les affaires pour le prochain relais.'],
  ['rendezvous', 'Le rendez-vous chez le dentiste, c’est quand ?', 'Retrouvez la date dans le même calendrier.'],
  ['changement', 'Un train en retard change le passage de relais ?', 'Notez le changement pour que chacun ait le bon repère.'],
  ['scolarite', 'Quel jour a lieu son activité après l’école ?', 'Gardez son emploi du temps sous les yeux.'],
  ['garde', 'Ce samedi, les enfants dorment où ?', 'Le planning de garde est visible par chacun.'],
  ['depenses', 'Qui a payé les fournitures ?', 'Suivez les dépenses partagées au même endroit.'],
  ['vacances', 'Les vacances commencent quel jour ?', 'Les dates sont posées dans le calendrier.'],
  ['sac', 'La carte Vitale est dans quel sac ?', 'Listez les affaires à prévoir avant le rendez-vous.'],
  ['rendezvous', 'Qui accompagne l’enfant à sa consultation ?', 'Notez le rendez-vous et son accompagnant.'],
  ['changement', 'Le relais doit se faire plus tard ?', 'Consultez le changement prévu ensemble.'],
  ['scolarite', 'Mercredi, école ou activité ?', 'Retrouvez les créneaux de la semaine.'],
  ['garde', 'Semaine paire ou impaire ?', 'Visualisez les jours de garde.'],
  ['depenses', 'Où est passé le justificatif ?', 'Conservez le détail avec la dépense.'],
  ['vacances', 'La valise part chez qui ?', 'Anticipez les périodes de vacances.'],
  ['sac', 'Les baskets sont dans l’autre maison ?', 'Préparez les affaires du prochain jour.'],
  ['rendezvous', 'Le contrôle médical approche ?', 'Le rendez-vous a sa place dans le planning.'],
  ['changement', 'Un imprévu bouleverse jeudi ?', 'Proposez un ajustement de garde.'],
  ['scolarite', 'Qui récupère l’enfant après l’activité ?', 'L’emploi du temps éclaire l’organisation.'],
  ['garde', 'Qui accueille les enfants dimanche ?', 'Partagez un même calendrier de garde.'],
  ['depenses', 'La cantine a déjà été réglée ?', 'Retrouvez le montant enregistré.'],
  ['vacances', 'Première ou deuxième semaine ?', 'Consultez la répartition prévue.'],
  ['sac', 'Encore un cahier oublié au relais ?', 'Pensez aux affaires à emporter.'],
  ['rendezvous', 'La consultation tombe pendant sa garde ?', 'Voyez la date et la personne qui accompagne.'],
  ['changement', 'Il faut échanger deux jours ?', 'Posez la proposition dans le planning.'],
  ['scolarite', 'L’emploi du temps a changé ?', 'Mettez les créneaux à jour.'],
  ['garde', 'Demain, c’est chez quel parent ?', 'Un coup d’œil au planning suffit.'],
  ['depenses', 'Il reste combien à régulariser ?', 'Un solde partagé aide à s’y retrouver.'],
  ['vacances', 'Le départ est prévu pour quand ?', 'Les dates sont claires avant le voyage.'],
] as const;

type Theme = 'garde' | 'depenses' | 'vacances' | 'sac' | 'rendezvous' | 'changement' | 'scolarite';

const SCENES: Record<Theme, { fichier: string; description: string }> = {
  garde: {
    fichier: 'weekend-garde.jpg',
    description: 'Deux parents consultent leur planning de garde et accueillent leur fille.',
  },
  depenses: {
    fichier: 'depenses-activite.jpg',
    description: 'Une mère retrouve un reçu, puis les parents consultent les dépenses de leur fille.',
  },
  vacances: {
    fichier: 'vacances-partagees.jpg',
    description: 'Deux parents consultent les dates de vacances et leur fille prépare sa valise.',
  },
  sac: {
    fichier: 'sac-oublie.jpg',
    description: 'Un père retrouve un sac oublié et sa fille le récupère auprès de sa mère.',
  },
  rendezvous: {
    fichier: 'rendez-vous-medical.jpg',
    description: 'Une mère cherche un rendez-vous médical puis les parents consultent leur téléphone.',
  },
  changement: {
    fichier: 'changement-relais.jpg',
    description: 'Un retard de train bouleverse un relais, puis les parents accueillent leur fils sereinement.',
  },
  scolarite: {
    fichier: 'emploi-du-temps.jpg',
    description: 'Deux parents consultent l’emploi du temps scolaire et leur fille prépare son cartable.',
  },
};

export interface HistoireQuotidienne {
  jour: string;
  theme: Theme;
  question: string;
  solution: string;
  fichier: string;
  texteAlternatif: string;
  legende: string;
}

export function histoireDuJour(jour: string): HistoireQuotidienne | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const instant = Date.parse(`${jour}T00:00:00Z`);
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== jour) return null;

  const debutNouvelleRotation = Date.parse('2026-09-28T00:00:00Z');
  const histoires = instant < debutNouvelleRotation ? HISTOIRES_ORIGINALES : HISTOIRES_NOUVELLES;
  const indice = Math.floor((instant < debutNouvelleRotation ? instant : instant - debutNouvelleRotation) / 86_400_000) % histoires.length;
  const [theme, question, solution] = histoires[indice];
  const scene = SCENES[theme];
  return {
    jour, theme, question, solution, fichier: scene.fichier,
    texteAlternatif: `${scene.description} Texte : « ${question} » « ${solution} » Installer l’application : www.coparentalitezen.fr. Lien dans ma bio.`,
    legende: `${question}\n\n${solution} Coparentalité Zen aide à organiser le quotidien des parents séparés.\n\nInstallez l’application sur www.coparentalitezen.fr — lien dans ma bio.\n\n#Coparentalite #ParentsSepares #OrganisationFamiliale`,
  };
}

export function urlVisuelQuotidien(jour: string, base: string): string | null {
  if (!histoireDuJour(jour)) return null;
  const jeton = urlVisuelPublic(base, `quotidien-${jour}`, 0);
  if (!jeton) return null;
  const url = new URL('/api/marketing/visuel-quotidien', base);
  url.searchParams.set('jour', jour);
  url.searchParams.set('jeton', new URL(jeton).searchParams.get('jeton') ?? '');
  return url.toString();
}

/**
 * Quand la réserve est vide, prépare exactement une histoire pour ce jour.
 * Une deuxième invocation du cron ne réinsère ni ne republie le même visuel.
 */
export async function assurerVisuelDuJour(
  service: Pick<SupabaseClient, 'from'>,
  jour: string,
  base: string,
): Promise<'ajoute' | 'deja' | 'echec'> {
  const histoire = histoireDuJour(jour);
  const imageUrl = urlVisuelQuotidien(jour, base);
  if (!histoire || !imageUrl) return 'echec';

  const existant = await service.from('marketing_reserve')
    .select('id').eq('image_url', imageUrl).limit(1);
  if (existant.error) return 'echec';
  if (existant.data?.length) return 'deja';

  // Un second appel peut arriver pendant que le premier publie encore un
  // visuel manuel. Un visuel déjà publié aujourd'hui compte pour la journée.
  const debutJour = `${jour}T00:00:00Z`;
  const [dejaPublie, enCours] = await Promise.all([
    service.from('marketing_reserve').select('id').gte('publie_le', debutJour).limit(1),
    service.from('marketing_reserve').select('id')
      .eq('statut', 'en_cours').gte('updated_at', debutJour).limit(1),
  ]);
  if (dejaPublie.error || enCours.error) return 'echec';
  if (dejaPublie.data?.length || enCours.data?.length) return 'deja';

  const ajoute = await service.from('marketing_reserve').upsert({
    theme: `quotidien-${jour}-${histoire.theme}`,
    image_url: imageUrl,
    legende: histoire.legende,
    texte_alternatif: histoire.texteAlternatif,
    date_publication: jour,
  }, { onConflict: 'image_url', ignoreDuplicates: true }).select('id');

  if (ajoute.error) return 'echec';
  return ajoute.data?.length ? 'ajoute' : 'deja';
}
