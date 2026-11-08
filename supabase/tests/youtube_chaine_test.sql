-- ============================================================
-- TESTS — relevé de la chaîne YouTube (C1 à C3)
-- ============================================================
\set ON_ERROR_STOP on

-- ============ C1 : fermée aux comptes connectés ============
do $$
begin
  begin
    perform * from public.marketing_youtube_chaine;
    raise exception 'ÉCHEC C1 : relevé de chaîne lisible par le rôle applicatif';
  exception when insufficient_privilege then null;
  end;
  raise notice 'C1 OK — relevé fermé aux comptes connectés';
end $$;

-- ============ C2 : fermée aux visiteurs ============
do $$
begin
  if has_table_privilege('anon', 'public.marketing_youtube_chaine', 'select') then
    raise exception 'ÉCHEC C2 : relevé lisible par un visiteur';
  end if;
  raise notice 'C2 OK — relevé fermé aux visiteurs';
end $$;

-- ============ C3 : une ligne par jour, chiffres positifs ============
set role service_role;
do $$
begin
  insert into public.marketing_youtube_chaine (jour, abonnes, vues, videos) values ('2026-11-09', 12, 3000, 20);
  insert into public.marketing_youtube_chaine (jour, abonnes) values ('2026-11-09', 13)
    on conflict (jour) do update set abonnes = excluded.abonnes;
  if (select abonnes from public.marketing_youtube_chaine where jour = '2026-11-09') <> 13 then
    raise exception 'ÉCHEC C3 : la mise à jour du jour n''a pas remplacé la ligne';
  end if;
  begin
    insert into public.marketing_youtube_chaine (jour, abonnes) values ('2026-11-10', -1);
    raise exception 'ÉCHEC C3b : abonnés négatifs acceptés';
  exception when check_violation then null;
  end;
  raise notice 'C3 OK — une ligne par jour, valeurs bornées';
end $$;
reset role;
