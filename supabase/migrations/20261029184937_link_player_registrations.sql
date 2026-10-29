-- Only new applications submitted in a verified session are linked to that account.
-- Do not backfill by email: the address in a guest application is not proof of ownership.
alter table public.tournament_registrations
  add column submitted_by uuid references auth.users(id) on delete set null;

create index tournament_registrations_submitted_by_created_idx
  on public.tournament_registrations (submitted_by, created_at desc)
  where submitted_by is not null;

create function player_private.assign_registration_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.submitted_by := case when (select player_private.is_verified_user()) then (select auth.uid()) else null end;
  return new;
end;
$$;
revoke all on function player_private.assign_registration_owner() from public, anon, authenticated;
create trigger assign_registration_owner before insert on public.tournament_registrations
for each row execute function player_private.assign_registration_owner();

-- Existing organiser policy continues to grant organiser access; applicants see only
-- submissions made during their own verified session (including partner details).
create policy "Players read own submitted registrations"
on public.tournament_registrations for select to authenticated
using (submitted_by = (select auth.uid()) and (select player_private.is_verified_user()));

-- INSERT is deliberately still restricted to the original column list.
-- The browser must never supply submitted_by; the trigger assigns it from auth.uid().
