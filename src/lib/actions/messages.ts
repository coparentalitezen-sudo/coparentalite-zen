'use client';

/**
 * Messages entre les deux parents.
 *
 * Pourquoi une messagerie dans une application d'organisation : les échanges
 * sur les enfants se perdent aujourd'hui entre SMS, courriels et messageries
 * personnelles, mêlés à tout le reste. Rassemblés ici, ils restent attachés
 * au sujet qu'ils traitent, et consultables des mois plus tard.
 *
 * Les messages ne s'effacent pas. Une modification conserve le texte
 * d'origine dans `original_body` : dans un contexte où les échanges peuvent
 * un jour être produits devant un juge, un message réécrit sans trace serait
 * plus dangereux qu'utile aux deux parents.
 *
 * Les non-lus se calculent à partir de `last_read_at` du membre, comparé à la
 * date des messages. Pas de drapeau par message : deux parents, une seule
 * date chacun, et rien à maintenir en cohérence.
 */
import { supabaseBrowser, ok, err, lisible, type ActionResult } from './core';

export interface Conversation {
  id: string;
  sujet: string;
  creeeLe: string;
  creeePar: string;
  /** Date du dernier message, pour trier et afficher l'activité. */
  dernierMessageLe: string | null;
  dernierMessageExtrait: string | null;
  nonLus: number;
}

export interface Message {
  id: string;
  conversationId: string;
  auteurId: string;
  texte: string;
  envoyeLe: string;
  modifieLe: string | null;
}

/** Longueur maximale d'un message, alignée sur ce qu'un écran peut afficher. */
export const LONGUEUR_MAX_MESSAGE = 4000;

/** Les trois jeux de lignes nécessaires au résumé d'une liste. */
export interface LignesConversation { id: string; sujet: string; creeeLe: string; creeePar: string }
export interface LigneMessage { conversationId: string; auteurId: string; texte: string; envoyeLe: string }

/**
 * Assemble la liste affichable : dernier message et non-lus par conversation.
 *
 * Fonction pure, séparée de la requête, parce que c'est ici que se logent les
 * erreurs qui comptent — compter ses propres messages comme non lus, ou
 * traiter une conversation jamais ouverte comme entièrement lue.
 *
 * Les messages sont attendus du plus récent au plus ancien, ordre dans lequel
 * la requête les renvoie.
 */
export function resumerConversations(
  conversations: LignesConversation[],
  messages: LigneMessage[],
  luJusqua: Map<string, string | null>,
  moi: string,
): Conversation[] {
  const dernier = new Map<string, { texte: string; date: string }>();
  const nonLus = new Map<string, number>();

  for (const m of messages) {
    if (!dernier.has(m.conversationId)) {
      dernier.set(m.conversationId, { texte: m.texte, date: m.envoyeLe });
    }
    // Ses propres messages ne sont jamais « non lus » : les compter
    // afficherait une pastille dès qu'on écrit soi-même.
    if (m.auteurId === moi) continue;
    const lu = luJusqua.get(m.conversationId) ?? null;
    // Jamais ouverte : tout ce que l'autre a écrit reste à lire.
    if (!lu || new Date(m.envoyeLe) > new Date(lu)) {
      nonLus.set(m.conversationId, (nonLus.get(m.conversationId) ?? 0) + 1);
    }
  }

  return conversations.map((c) => {
    const d = dernier.get(c.id) ?? null;
    return {
      id: c.id,
      sujet: c.sujet,
      creeeLe: c.creeeLe,
      creeePar: c.creeePar,
      dernierMessageLe: d?.date ?? null,
      dernierMessageExtrait: d ? d.texte.slice(0, 120) : null,
      nonLus: nonLus.get(c.id) ?? 0,
    };
  });
}

/**
 * Conversations du foyer, la plus active en tête.
 *
 * Le décompte des non-lus est calculé ici plutôt qu'en base : deux parents et
 * quelques conversations, la liste tient en mémoire, et une fonction SQL
 * dédiée serait une pièce de plus à maintenir pour le même résultat.
 */
export async function listerConversations(
  householdId: string,
): Promise<ActionResult<Conversation[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');

  const { data: conversations, error } = await supabase.from('conversations')
    .select('id, subject, created_at, created_by')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false });
  if (error) return err(lisible('Les conversations n’ont pas pu être listées.', error));

  const ids = (conversations ?? []).map((c) => c.id as string);
  if (ids.length === 0) return ok([]);

  const [{ data: messages }, { data: membres }] = await Promise.all([
    supabase.from('messages')
      .select('conversation_id, body, created_at, author_id')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false }),
    supabase.from('conversation_members')
      .select('conversation_id, last_read_at')
      .in('conversation_id', ids)
      .eq('profile_id', user.id),
  ]);

  const luJusqua = new Map<string, string | null>();
  for (const m of membres ?? []) {
    luJusqua.set(m.conversation_id as string, (m.last_read_at as string | null) ?? null);
  }

  return ok(resumerConversations(
    (conversations ?? []).map((c) => ({
      id: c.id as string,
      sujet: c.subject as string,
      creeeLe: c.created_at as string,
      creeePar: c.created_by as string,
    })),
    (messages ?? []).map((m) => ({
      conversationId: m.conversation_id as string,
      auteurId: m.author_id as string,
      texte: m.body as string,
      envoyeLe: m.created_at as string,
    })),
    luJusqua,
    user.id,
  ));
}

/**
 * Ouvre une conversation et y inscrit les deux parents.
 *
 * Les membres sont ajoutés dès la création : sans ligne dans
 * conversation_members, le second parent n'aurait aucune date de lecture, et
 * chaque message lui apparaîtrait indéfiniment comme non lu.
 */
export async function creerConversation(
  householdId: string, sujet: string, profilsMembres: string[],
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  const titre = sujet.trim();
  if (titre.length < 2) return err('Donnez un sujet à la conversation.');
  if (titre.length > 120) return err('Le sujet ne peut pas dépasser 120 caractères.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');

  const { data, error } = await supabase.from('conversations')
    .insert({ household_id: householdId, subject: titre, created_by: user.id })
    .select('id').single();
  if (error || !data) {
    return err(lisible('La conversation n’a pas pu être créée.', error));
  }

  const id = data.id as string;
  const profils = Array.from(new Set([user.id, ...profilsMembres]));
  const { error: erreurMembres } = await supabase.from('conversation_members')
    .insert(profils.map((profileId) => ({
      conversation_id: id,
      profile_id: profileId,
      // L'auteur a lu ce qu'il vient d'ouvrir ; l'autre non.
      last_read_at: profileId === user.id ? new Date().toISOString() : null,
    })));
  if (erreurMembres) {
    return err(lisible('Les participants n’ont pas pu être inscrits.', erreurMembres));
  }

  return ok(id);
}

/** Messages d'une conversation, du plus ancien au plus récent. */
export async function listerMessages(
  conversationId: string,
): Promise<ActionResult<Message[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('messages')
    .select('id, conversation_id, author_id, body, created_at, edited_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) return err(lisible('Les messages n’ont pas pu être chargés.', error));
  return ok((data ?? []).map((m) => ({
    id: m.id as string,
    conversationId: m.conversation_id as string,
    auteurId: m.author_id as string,
    texte: m.body as string,
    envoyeLe: m.created_at as string,
    modifieLe: (m.edited_at as string | null) ?? null,
  })));
}

/** Envoie un message et fait remonter la conversation dans la liste. */
export async function envoyerMessage(
  conversationId: string, texte: string,
): Promise<ActionResult<Message>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  const corps = texte.trim();
  if (corps.length === 0) return err('Écrivez un message avant de l’envoyer.');
  if (corps.length > LONGUEUR_MAX_MESSAGE) {
    return err(`Un message ne peut pas dépasser ${LONGUEUR_MAX_MESSAGE} caractères.`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');

  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: conversationId, author_id: user.id, body: corps })
    .select('id, conversation_id, author_id, body, created_at, edited_at').single();
  if (error || !data) return err(lisible('Le message n’a pas pu être envoyé.', error));

  // Le tri de la liste repose sur updated_at : sans cette mise à jour, une
  // conversation active resterait au fond.
  await supabase.from('conversations')
    .update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

  return ok({
    id: data.id as string,
    conversationId: data.conversation_id as string,
    auteurId: data.author_id as string,
    texte: data.body as string,
    envoyeLe: data.created_at as string,
    modifieLe: (data.edited_at as string | null) ?? null,
  });
}

/**
 * Marque la conversation comme lue à l'instant.
 *
 * Appelé à l'ouverture du fil. L'échec est silencieux : ne pas réussir à
 * enregistrer une lecture ne doit pas empêcher de lire.
 */
export async function marquerConversationLue(
  conversationId: string,
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');
  const { error } = await supabase.from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('profile_id', user.id);
  if (error) return err(lisible('La lecture n’a pas pu être enregistrée.', error));
  return ok(undefined);
}
