-- La tâche quotidienne peut être relancée : une date n'ajoute jamais deux
-- fois le même visuel, même si deux exécutions se croisent.
begin;

create unique index if not exists marketing_reserve_image_url_unique
  on public.marketing_reserve (image_url);

commit;
