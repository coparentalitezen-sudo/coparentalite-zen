-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00003 : données de référence
-- ============================================================

-- Catégories de dépenses par défaut (household_id null = système)
insert into expense_categories (name, icon, sort_order) values
  ('École','school',10), ('Cantine','utensils',20), ('Santé','heart-pulse',30),
  ('Pharmacie','pill',40), ('Vêtements','shirt',50), ('Chaussures','footprints',60),
  ('Sport','dumbbell',70), ('Loisirs','gamepad-2',80), ('Garde','baby',90),
  ('Transport','bus',100), ('Téléphone','smartphone',110), ('Vacances','palmtree',120),
  ('Cadeau','gift',130), ('Assurance','shield',140), ('Frais administratifs','file-text',150),
  ('Pension / contribution','hand-coins',160), ('Autre','circle-ellipsis',900)
on conflict do nothing;

-- Plans
insert into plans (id, name, price_cents_monthly, limits) values
  ('free','Gratuit',0,
   '{"households":1,"parents":2,"children":3,"expenses_per_month":30,"history_months":6,"storage_mb":50,"exports_per_month":1,"attachments":false,"recurring":false,"exchange_requests":false}'),
  ('premium','Premium',499,
   '{"households":1,"parents":4,"children":10,"expenses_per_month":-1,"history_months":-1,"storage_mb":2048,"exports_per_month":-1,"attachments":true,"recurring":true,"exchange_requests":true}'),
  ('pro','Professionnel / Médiateur',1499,
   '{"households":-1,"parents":-1,"children":-1,"expenses_per_month":-1,"history_months":-1,"storage_mb":10240,"exports_per_month":-1,"attachments":true,"recurring":true,"exchange_requests":true,"read_only_households":true,"activity_log":true}')
on conflict (id) do nothing;

-- Vacances scolaires françaises 2026-2027 (référentiel national, household_id null)
-- Dates vérifiées le 22/07/2026 (sources concordantes reprenant le calendrier
-- officiel MENJ). Zone A : Besançon, Bordeaux, Clermont-Fd, Dijon, Grenoble,
-- Limoges, Lyon, Poitiers • Zone B : Aix-Marseille, Amiens, Lille, Nancy-Metz,
-- Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg •
-- Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles.
do $$ begin
if not exists (select 1 from school_holidays where school_year = '2026-2027' and household_id is null) then
insert into school_holidays (label, zone, school_year, starts_on, ends_on) values
  ('Vacances de la Toussaint', null, '2026-2027', '2026-10-17', '2026-11-02'),
  ('Vacances de Noël',         null, '2026-2027', '2026-12-19', '2027-01-04'),
  ('Vacances d''hiver',        'A',  '2026-2027', '2027-02-13', '2027-03-01'),
  ('Vacances d''hiver',        'B',  '2026-2027', '2027-02-20', '2027-03-08'),
  ('Vacances d''hiver',        'C',  '2026-2027', '2027-02-06', '2027-02-22'),
  ('Vacances de printemps',    'A',  '2026-2027', '2027-04-10', '2027-04-26'),
  ('Vacances de printemps',    'B',  '2026-2027', '2027-04-17', '2027-05-03'),
  ('Vacances de printemps',    'C',  '2026-2027', '2027-04-03', '2027-04-19'),
  ('Vacances d''été',          null, '2026-2027', '2027-07-03', '2027-08-31');
end if;
end $$;
