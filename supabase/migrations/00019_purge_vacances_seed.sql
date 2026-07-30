-- ============================================================
-- COPARENTALITÉ ZEN — Migration 00019 : retrait des vacances non vérifiées
--
-- POURQUOI
-- La migration de départ (00003_seed) insérait neuf périodes de vacances
-- 2026-2027 saisies de mémoire, à une époque où le calendrier officiel n'était
-- pas encore branché. Ces dates n'ont jamais été vérifiées auprès du ministère.
--
-- Une date de vacances approximative dans un planning de garde n'est pas une
-- imprécision anodine : c'est un enfant qui attend devant une école. Ces lignes
-- doivent disparaître au profit du seul calendrier officiel importé.
--
-- PRUDENCE : suppression LOGIQUE, et strictement limitée aux lignes du jeu de
-- départ — celles sans foyer rattaché et marquées « manuel ». Toute période
-- saisie par des parents dans leur propre foyer est préservée.
--
-- Idempotente et transactionnelle.
-- ============================================================

begin;

-- Neutralise les périodes du jeu de départ, jamais celles d'un foyer
update school_holidays
   set deleted_at = now()
 where deleted_at is null
   and source = 'manuel'
   and household_id is null;

-- Le jeu de départ ne doit plus en réinsérer si la base est reconstruite.
-- (00003_seed reste inchangé pour l'historique ; ce garde-fou vaut pour
--  toute réexécution ultérieure.)
create or replace function public.purger_vacances_non_verifiees()
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update school_holidays
     set deleted_at = now()
   where deleted_at is null and source = 'manuel' and household_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purger_vacances_non_verifiees() from public, anon, authenticated;

commit;
