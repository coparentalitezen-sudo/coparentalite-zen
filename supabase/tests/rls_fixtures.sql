-- Fixtures de test RLS (exécuté en superuser — simule le service_role)
-- Foyer A : Alice (owner), Bob (parent), Mia (médiatrice lecture seule)
-- Foyer B : Carol (owner)
-- Mallory : aucun foyer

insert into profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-00000000000a','alice@test.fr','Alice'),
  ('00000000-0000-0000-0000-00000000000b','bob@test.fr','Bob'),
  ('00000000-0000-0000-0000-00000000000c','carol@test.fr','Carol'),
  ('00000000-0000-0000-0000-00000000000d','mia@test.fr','Mia'),
  ('00000000-0000-0000-0000-00000000000e','mallory@test.fr','Mallory');

insert into households (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Foyer A','00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Foyer B','00000000-0000-0000-0000-00000000000c');

insert into household_members (household_id, profile_id, role, color_key) values
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','owner','navy'),
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','parent','coral'),
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','mediator','sage'),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','owner','navy');

insert into children (id, household_id, first_name, allergies, created_by) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Léa','Arachides','00000000-0000-0000-0000-00000000000a'),
  ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Tom',null,'00000000-0000-0000-0000-00000000000c');

insert into expenses (id, household_id, title, amount_cents, spent_on, paid_by, status, created_by) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Cantine mars',8550,'2026-03-05','00000000-0000-0000-0000-00000000000a','validated','00000000-0000-0000-0000-00000000000a'),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Pharmacie',2340,'2026-03-08','00000000-0000-0000-0000-00000000000c','sent','00000000-0000-0000-0000-00000000000c');

insert into expense_attachments (id, expense_id, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','foyer-a/justif1.pdf','facture-cantine.pdf','application/pdf',52000,'00000000-0000-0000-0000-00000000000a');

insert into documents (household_id, title, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Convention parentale','foyer-a/convention.pdf','convention.pdf','application/pdf',120000,'00000000-0000-0000-0000-00000000000a');
