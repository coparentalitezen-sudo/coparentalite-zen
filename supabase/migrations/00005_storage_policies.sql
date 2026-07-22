-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00005 : policies Supabase Storage
-- Convention de chemin OBLIGATOIRE : {household_id}/{uuid-fichier}.{ext}
-- Buckets privés : 'justificatifs' et 'documents' (créés dans le
-- tableau de bord — Action 3 du guide de déploiement).
-- NOTE : ce script s'exécute sur Supabase (schéma storage présent).
-- ============================================================

-- Foyer déduit du premier segment du chemin du fichier
create or replace function public.household_from_path(object_name text)
returns uuid language sql immutable as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid
$$;

-- Lecture : membres du foyer uniquement (URL signées générées côté app)
drop policy if exists "justificatifs_read" on storage.objects;
create policy "justificatifs_read" on storage.objects for select
  using (bucket_id = 'justificatifs'
         and public.is_member(public.household_from_path(name)));

-- Dépôt : rôles écrivains uniquement, taille contrôlée côté app + bucket
drop policy if exists "justificatifs_insert" on storage.objects;
create policy "justificatifs_insert" on storage.objects for insert
  with check (bucket_id = 'justificatifs'
              and public.can_write(public.household_from_path(name)));

-- Remplacement/suppression : rôles écrivains
drop policy if exists "justificatifs_update" on storage.objects;
create policy "justificatifs_update" on storage.objects for update
  using (bucket_id = 'justificatifs'
         and public.can_write(public.household_from_path(name)));
drop policy if exists "justificatifs_delete" on storage.objects;
create policy "justificatifs_delete" on storage.objects for delete
  using (bucket_id = 'justificatifs'
         and public.can_write(public.household_from_path(name)));

-- Mêmes règles pour le bucket documents
drop policy if exists "documents_read" on storage.objects;
create policy "documents_read" on storage.objects for select
  using (bucket_id = 'documents' and public.is_member(public.household_from_path(name)));
drop policy if exists "documents_insert" on storage.objects;
create policy "documents_insert" on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));
drop policy if exists "documents_update" on storage.objects;
create policy "documents_update" on storage.objects for update
  using (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));
drop policy if exists "documents_delete" on storage.objects;
create policy "documents_delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.can_write(public.household_from_path(name)));

-- Réglages recommandés des buckets (tableau de bord ou API) :
--   file_size_limit : 10 Mo (justificatifs) / 20 Mo (documents)
--   allowed_mime_types : application/pdf, image/jpeg, image/png, image/heic
