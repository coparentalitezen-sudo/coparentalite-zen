-- Trois histoires prêtes pour la réserve. Les images JPEG sont servies par
-- l'application ; l'ajout est rejouable sans remettre en file un post publié.
begin;

insert into public.marketing_reserve
  (theme, image_url, legende, texte_alternatif)
select v.theme, v.image_url, v.legende, v.texte_alternatif
from (values
  (
    'weekend-garde',
    'https://www.coparentalitezen.fr/marketing/reserve/weekend-garde.jpg',
    $caption$« Ce week-end, c’est chez qui ? »

Quand le planning est visible par les deux parents, chacun peut préparer le passage de relais plus sereinement. Et l’enfant sait où retrouver ses affaires.

Retrouvez le planning partagé sur www.coparentalitezen.fr — lien dans ma bio.

#Coparentalite #ParentsSepares #PlanningDeGarde$caption$,
    'Trois scènes : deux parents cherchent à savoir chez qui sera leur fille ce week-end ; un planning partagé est consulté ; la remise de l’enfant se déroule plus sereinement.'
  ),
  (
    'depenses-activite',
    'https://www.coparentalitezen.fr/marketing/reserve/depenses-activite.jpg',
    $caption$« Qui a payé l’activité ? »

Un reçu égaré, un montant dont on ne se souvient plus… Une dépense enregistrée au même endroit aide chaque parent à retrouver l’information et à suivre sa validation.

Découvrez les dépenses partagées sur www.coparentalitezen.fr — lien dans ma bio.

#Coparentalite #DepensesPartagees #ParentsSepares$caption$,
    'Une mère retrouve un reçu d’activité, les deux parents consultent chacun leur téléphone, puis leur fille part à son activité avec son sac.'
  ),
  (
    'vacances-partagees',
    'https://www.coparentalitezen.fr/marketing/reserve/vacances-partagees.jpg',
    $caption$« Les vacances approchent… »

Qui accueille les enfants et à quelles dates ? Un calendrier commun aide à anticiper les départs et à préparer les affaires sans chercher dans les anciens messages.

Organisez le planning sur www.coparentalitezen.fr — lien dans ma bio.

#Coparentalite #VacancesScolaires #ParentsSepares$caption$,
    'Au départ, chaque parent hésite sur les dates de vacances et leur fille attend avec sa valise. Un calendrier partagé est consulté, puis l’enfant prépare ses affaires.'
  )
) as v(theme, image_url, legende, texte_alternatif)
where not exists (
  select 1 from public.marketing_reserve r where r.image_url = v.image_url
);

commit;
