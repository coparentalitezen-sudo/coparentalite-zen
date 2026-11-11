-- ============================================================
-- Micro-niche « noel » : sujet de saison de la campagne de Noël
--
-- Le générateur ouvre les semaines du 23/11 au 21/12 sur le sujet de Noël
-- (src/lib/marketing/campagne-noel.ts). Les contenus et opportunités
-- enregistrés citent leur niche (clé étrangère vers marketing_niches) : sans
-- cette ligne, l'enregistrement de ces semaines échouerait.
-- ============================================================
insert into public.marketing_niches (id, libelle)
values ('noel', 'Vacances de Noël et fêtes de fin d’année')
on conflict (id) do nothing;
