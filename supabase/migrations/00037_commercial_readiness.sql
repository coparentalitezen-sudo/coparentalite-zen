-- Coparentalité Zen — préparation commerciale : consentements versionnés
begin;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_terms text := nullif(new.raw_user_meta_data->>'terms_version', '');
  v_privacy text := nullif(new.raw_user_meta_data->>'privacy_version', '');
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  if coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false) and v_terms is not null then
    insert into public.consent_logs(profile_id, consent_kind, version, granted)
    select new.id, 'terms', v_terms, true
    where not exists (
      select 1 from public.consent_logs
      where profile_id = new.id and consent_kind = 'terms' and version = v_terms and granted
    );
  end if;

  if coalesce((new.raw_user_meta_data->>'privacy_accepted')::boolean, false) and v_privacy is not null then
    insert into public.consent_logs(profile_id, consent_kind, version, granted)
    select new.id, 'privacy', v_privacy, true
    where not exists (
      select 1 from public.consent_logs
      where profile_id = new.id and consent_kind = 'privacy' and version = v_privacy and granted
    );
  end if;

  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
