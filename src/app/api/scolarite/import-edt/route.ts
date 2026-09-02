import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { supabaseServer } from '@/lib/supabase/server';
import { parserReponseExtraction, ErreurExtraction, anneeScolaireDe } from '@/lib/scolarite/edt';

/**
 * Lecture d'un emploi du temps scolaire par photo.
 *
 * N'ÉCRIT JAMAIS EN BASE : cette route lit l'image, interroge Gemini en
 * vision, renvoie le résultat au client. La relecture/validation humaine et
 * l'enregistrement définitif se font ensuite via l'action
 * `enregistrerImportEdt` (RPC `enregistrer_edt_import`), jamais ici — voir
 * ÉTAPE 4 de la demande : « Ne jamais écrire en base sans validation
 * humaine ».
 *
 * POURQUOI GEMINI PLUTÔT QU'ANTHROPIC : la facturation Anthropic exige une
 * carte bancaire, indisponible pour ce déploiement. L'API Gemini (Google AI
 * Studio) offre un palier gratuit sans carte, avec une qualité de lecture
 * suffisante pour ce cas d'usage (texte structuré, pas de raisonnement
 * complexe). Le contrat de sortie (JSON strict défini par PROMPT_SYSTEME) et
 * le parsing défensif (`parserReponseExtraction`) restent inchangés — seul
 * l'appel HTTP change de fournisseur, donc de remplacer Gemini par un autre
 * fournisseur plus tard ne touchera que ce fichier.
 *
 * RGPD : la photo contient le nom de l'enfant et son établissement.
 * Traitement entièrement en mémoire, jamais d'upload bucket, jamais de
 * trace en base — la variable `brut` (buffer image) n'existe que le temps
 * de cette requête et n'est jamais écrite nulle part.
 *
 * POURQUOI PAS SHARP : voir src/app/api/marketing/visuel-public/route.tsx —
 * même piège (extension native qui échoue en serverless), même solution
 * (pngjs + jpeg-js, JS pur).
 */
export const maxDuration = 60;

// Alias maintenu à jour par Google vers le modèle Flash multimodal courant —
// évite de figer un numéro de version qui finira par être retiré.
const MODELE = 'gemini-flash-latest';

const PROMPT_SYSTEME = `Tu lis un emploi du temps scolaire français (collège ou lycée) photographié.
Réponds UNIQUEMENT avec un objet JSON strict, sans balise markdown, sans texte avant ou après :
{"semaine_ab_detectee": bool, "creneaux": [{"jour": 1-5 (1=lundi, 5=vendredi), "heure_debut": "HH:MM", "heure_fin": "HH:MM", "matiere": string ou null, "salle": string ou null, "professeur": string ou null, "semaine_ab": "A"|"B"|null}]}
Un créneau sans information de semaine A/B (rythme identique chaque semaine) porte semaine_ab: null.
Si l'image est illisible ou n'est pas un emploi du temps, réponds {"semaine_ab_detectee": false, "creneaux": []}.`;

function versJpegBase64(imageBase64: string, mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return imageBase64;
  if (mimeType !== 'image/png') {
    throw new ErreurExtraction('Format d’image non pris en charge — utilisez une photo JPEG ou PNG.');
  }
  const brut = Buffer.from(imageBase64, 'base64');
  const image = PNG.sync.read(brut);
  const converti = jpeg.encode({ data: image.data, width: image.width, height: image.height }, 88);
  return Buffer.from(converti.data).toString('base64');
}

export async function POST(requete: Request) {
  const cleGemini = process.env.GEMINI_API_KEY;
  if (!cleGemini) {
    return NextResponse.json(
      { message: 'La lecture automatique n’est pas encore activée sur cette installation.' },
      { status: 503 },
    );
  }

  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous pour importer un emploi du temps.' }, { status: 401 });
  }

  let corps: { childId?: string; imageBase64?: string; mimeType?: string; anneeScolaire?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  const { childId, imageBase64, mimeType } = corps;
  if (!childId || !imageBase64 || !mimeType) {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  // household_id n'est jamais accepté du client : dérivé ici via une requête
  // filtrée par la RLS. Un enfant invisible pour cet utilisateur (foyer
  // étranger) donne une ligne absente, pas une erreur qui confirmerait son
  // existence.
  const { data: enfant } = await supabase
    .from('children').select('id, household_id').eq('id', childId).maybeSingle();
  if (!enfant) {
    return NextResponse.json({ message: 'Enfant introuvable.' }, { status: 404 });
  }

  const anneeScolaire = corps.anneeScolaire || anneeScolaireDe(new Date());

  // Barrière avant l'appel à Gemini : un foyer non premium ou déjà au quota
  // ne doit jamais déclencher l'appel, même gratuit — le quota reste la
  // seule garantie que l'usage du palier gratuit reste sous contrôle.
  const { data: etat, error: erreurEtat } = await supabase.rpc('edt_scolaire_etat', {
    p_household: enfant.household_id, p_child: childId, p_annee: anneeScolaire,
  });
  const ligne = Array.isArray(etat) ? etat[0] : etat;
  if (erreurEtat || !ligne) {
    return NextResponse.json({ message: 'Impossible de vérifier votre offre.' }, { status: 502 });
  }
  if (!ligne.actif) {
    return NextResponse.json(
      { message: 'L’emploi du temps scolaire n’est pas inclus dans votre offre actuelle.' },
      { status: 403 },
    );
  }
  if (ligne.imports_utilises >= ligne.imports_max) {
    return NextResponse.json(
      { message: `Quota d’imports atteint pour cet enfant cette année scolaire (${ligne.imports_max} par an).` },
      { status: 429 },
    );
  }

  try {
    const jpegBase64 = versJpegBase64(imageBase64, mimeType);

    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // En-tête plutôt que ?key=... en query string : évite que la clé
          // se retrouve dans un journal d'accès (proxy, CDN) qui logue les URL.
          'x-goog-api-key': cleGemini,
        },
        body: JSON.stringify({
          // L'API REST Gemini attend du camelCase (systemInstruction,
          // inlineData, mimeType) — le snake_case des exemples protobuf
          // n'est pas accepté ici et fait échouer silencieusement la requête.
          systemInstruction: { parts: [{ text: PROMPT_SYSTEME }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
              { text: 'Lis cet emploi du temps et renvoie le JSON demandé.' },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );

    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => '');
      console.error('[import-edt] Gemini', reponse.status, detail);
      return NextResponse.json(
        { message: 'La lecture du ticket n’a pas abouti. Réessayez dans un instant.' },
        { status: 502 },
      );
    }

    const corpsGemini = (await reponse.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const texte = corpsGemini.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    if (!texte) {
      return NextResponse.json({ message: 'Réponse de lecture vide.' }, { status: 502 });
    }

    const extraction = parserReponseExtraction(texte);
    return NextResponse.json({
      anneeScolaire,
      semaineAbDetectee: extraction.semaine_ab_detectee,
      creneaux: extraction.creneaux,
    });
  } catch (e) {
    if (e instanceof ErreurExtraction) {
      return NextResponse.json({ message: e.message }, { status: 422 });
    }
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    console.error('[import-edt]', message);
    return NextResponse.json(
      { message: 'La lecture du ticket n’a pas abouti. Réessayez dans un instant.' },
      { status: 502 },
    );
  }
}
