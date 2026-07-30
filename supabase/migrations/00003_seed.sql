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
-- VIDE À DESSEIN.
-- Les vacances scolaires proviennent exclusivement du calendrier officiel du
-- ministère, importé par /api/vacances/synchroniser. Aucune date n'est écrite
-- ici : ces neuf périodes avaient été saisies de mémoire et n'ont jamais été
-- vérifiées. Une date approximative dans un planning de garde, ce n'est pas
-- une imprécision anodine — c'est un enfant qui attend devant une école.
