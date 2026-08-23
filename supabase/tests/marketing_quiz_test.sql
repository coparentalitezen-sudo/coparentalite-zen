\set ON_ERROR_STOP on

-- QZ1 — les rôles clients ne lisent aucune mesure du questionnaire.
set role authenticated;
do $$
begin
  begin
    perform * from public.marketing_parcours_quiz;
    raise exception 'ÉCHEC — QZ1 lecture applicative autorisée';
  exception when insufficient_privilege then
    raise notice 'OK — QZ1 mesures fermées au rôle applicatif';
  end;
end $$;
reset role;

-- QZ2 — seul service_role peut incrémenter le compteur.
set role service_role;
select public.compter_etape_quiz('commence', 'site', 'quiz', 'quiz-resultat');
select public.compter_etape_quiz('commence', 'site', 'quiz', 'quiz-resultat');
reset role;
do $$
declare n integer;
begin
  select occurrences into n from public.marketing_parcours_quiz
  where source = 'site' and campagne = 'quiz'
    and contenu = 'quiz-resultat' and etape = 'commence';
  if n = 2 then
    raise notice 'OK — QZ2 incrément agrégé et idempotent';
  else
    raise exception 'ÉCHEC — QZ2 compteur attendu 2, obtenu %', n;
  end if;
end $$;

-- QZ3 — une étape arbitraire est rejetée par la base.
set role service_role;
do $$
begin
  begin
    perform public.compter_etape_quiz('email_enfant', 'site', 'quiz', 'x');
    raise exception 'ÉCHEC — QZ3 étape arbitraire acceptée';
  exception when others then
    if sqlerrm like 'ÉCHEC — QZ3%' then raise; end if;
    raise notice 'OK — QZ3 étapes strictement contrôlées';
  end;
end $$;
reset role;
