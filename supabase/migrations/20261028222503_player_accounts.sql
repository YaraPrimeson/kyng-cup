-- Player identity is independent of login email, name and OAuth identities.
create schema player_private;
revoke all on schema player_private from public, anon, authenticated;
grant usage on schema player_private to authenticated;

-- Auth owns confirmation state. Never trust editable user_metadata for access.
create function player_private.is_verified_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null
      and not coalesce(is_anonymous, false) and coalesce(banned_until, '-infinity') < now());
$$;
revoke all on function player_private.is_verified_user() from public, anon, authenticated;
grant execute on function player_private.is_verified_user() to authenticated;

create table public.player_profiles (
  player_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80),
  avatar_path text check (avatar_path is null or avatar_path ~ ('^' || auth_user_id::text || '/[0-9a-f-]{36}\.jpg$')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
revoke all on public.player_profiles from public, anon, authenticated;
grant select on public.player_profiles to authenticated;
grant insert (auth_user_id, display_name) on public.player_profiles to authenticated;
grant update (display_name, avatar_path) on public.player_profiles to authenticated;
grant all on public.player_profiles to service_role;

create policy "Players read their verified profile" on public.player_profiles for select to authenticated
using (auth_user_id = (select auth.uid()) and (select player_private.is_verified_user()));
create policy "Players create their verified profile" on public.player_profiles for insert to authenticated
with check (auth_user_id = (select auth.uid()) and (select player_private.is_verified_user()));
create policy "Players edit their verified profile" on public.player_profiles for update to authenticated
using (auth_user_id = (select auth.uid()) and (select player_private.is_verified_user()))
with check (auth_user_id = (select auth.uid()) and (select player_private.is_verified_user()));

create function player_private.version_profile()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null
    and not exists (select 1 from storage.objects where bucket_id = 'player-avatars' and name = new.avatar_path) then
    raise exception 'Upload the avatar before saving the profile' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function player_private.version_profile() from public, anon, authenticated;
create trigger version_player_profile before update on public.player_profiles
for each row execute function player_private.version_profile();

-- Immutable filenames avoid cache races and never overwrite an active photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-avatars', 'player-avatars', false, 1048576, array['image/jpeg']);
create policy "Players read own avatars" on storage.objects for select to authenticated
using (bucket_id = 'player-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select player_private.is_verified_user()));
create policy "Players upload own avatars" on storage.objects for insert to authenticated
with check (bucket_id = 'player-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$')
  and (select player_private.is_verified_user()));
create policy "Players delete own avatars" on storage.objects for delete to authenticated
using (bucket_id = 'player-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select player_private.is_verified_user()));
