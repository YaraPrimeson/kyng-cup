-- Isolated PostgreSQL schema snapshot: KYNG CUP, 2026-11-18.
-- Catalog definitions only; no production rows, credentials or notification hooks.
-- Auth users below model verified/unverified identities, not SMTP or token issuance.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema player_private; create schema extensions; create schema storage;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,owner_id text,metadata jsonb);
grant usage on schema auth to anon,authenticated;
grant usage on schema player_private to authenticated;
set check_function_bodies=off;
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$
;
grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated; alter table storage.objects enable row level security;
create table "public"."global_admins" ("user_id" uuid not null,"role" text default 'admin'::text not null,"status" text default 'pending'::text not null,"requested_at" timestamp with time zone default now() not null,"approved_at" timestamp with time zone,"approved_by" uuid);
create table "player_private"."registration_claim_codes" ("registration_id" uuid not null,"player_role" text not null,"code_hash" bytea not null,"issued_by" uuid not null,"expires_at" timestamp with time zone not null,"issued_at" timestamp with time zone default now() not null);
create table "public"."tournament_registrations" ("id" uuid default gen_random_uuid() not null,"tournament_id" uuid not null,"status" text default 'new'::text not null,"pair_name" text,"player_one_first_name" text not null,"player_one_last_name" text not null,"player_one_email" text not null,"player_one_phone" text not null,"player_one_messenger" text,"player_one_level" text not null,"player_one_rating_system" text,"player_one_rating_value" text,"player_two_first_name" text not null,"player_two_last_name" text not null,"player_two_email" text,"player_two_phone" text,"player_two_messenger" text,"player_two_level" text not null,"player_two_rating_system" text,"player_two_rating_value" text,"comment" text,"locale" text default 'en'::text not null,"marketing_opt_in" boolean default false not null,"terms_accepted_at" timestamp with time zone default now() not null,"partner_consent_accepted_at" timestamp with time zone default now() not null,"admin_notes" text,"status_changed_at" timestamp with time zone,"status_changed_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"utm_source" text,"utm_medium" text,"utm_campaign" text,"utm_term" text,"utm_content" text,"landing_page" text,"referrer" text,"submitted_by" uuid,"partner_user_id" uuid);
create table "public"."tournaments" ("id" uuid default gen_random_uuid() not null,"slug" text not null,"name" text not null,"location" text,"starts_at" timestamp with time zone,"bracket_size" integer default 16 not null,"status" text default 'draft'::text not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"sport" text default 'tennis'::text not null,"ends_at" timestamp with time zone,"registration_status" text default 'open'::text not null,"format_description" text,"prize_pool" text,"format" text default 'knockout'::text not null,"participant_count" integer not null,"playoff_participant_count" integer not null);
create table "public"."matches" ("id" uuid default gen_random_uuid() not null,"tournament_id" uuid not null,"round" integer not null,"position" integer not null,"pair_one_id" uuid,"pair_two_id" uuid,"pair_one_sets" integer[] default '{}'::integer[] not null,"pair_two_sets" integer[] default '{}'::integer[] not null,"winner_id" uuid,"status" text default 'scheduled'::text not null,"court" text,"scheduled_at" timestamp with time zone,"completed_at" timestamp with time zone,"next_match_id" uuid,"next_slot" smallint,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"bracket_kind" text default 'playoffs'::text not null);
create table "public"."pairs" ("id" uuid default gen_random_uuid() not null,"tournament_id" uuid not null,"name" text not null,"player_one" text not null,"player_two" text not null,"seed" integer,"country_code" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."tournament_admins" ("tournament_id" uuid not null,"user_id" uuid not null,"created_at" timestamp with time zone default now() not null,"role" text default 'admin'::text not null);
create table "public"."tournament_groups" ("id" uuid default gen_random_uuid() not null,"tournament_id" uuid not null,"code" text not null,"qualify_count" integer not null,"created_at" timestamp with time zone default now() not null);
create table "public"."group_members" ("group_id" uuid not null,"pair_id" uuid not null,"position" integer not null);
create table "public"."group_matches" ("id" uuid default gen_random_uuid() not null,"tournament_id" uuid not null,"group_id" uuid not null,"position" integer not null,"pair_one_id" uuid not null,"pair_two_id" uuid not null,"pair_one_sets" integer[] default '{}'::integer[] not null,"pair_two_sets" integer[] default '{}'::integer[] not null,"winner_id" uuid,"status" text default 'scheduled'::text not null,"court" text,"scheduled_at" timestamp with time zone,"completed_at" timestamp with time zone,"updated_at" timestamp with time zone default now() not null);
create table "public"."match_result_history" ("id" bigint generated always as identity not null,"match_id" uuid not null,"tournament_id" uuid not null,"changed_by" uuid,"previous_state" jsonb not null,"new_state" jsonb not null,"created_at" timestamp with time zone default now() not null);
create table "public"."activity_log" ("id" bigint generated always as identity not null,"tournament_id" uuid not null,"entity_type" text not null,"entity_id" uuid,"action" text not null,"changed_by" uuid,"before_state" jsonb,"after_state" jsonb,"created_at" timestamp with time zone default now() not null);
create table "public"."player_profiles" ("player_id" uuid default gen_random_uuid() not null,"auth_user_id" uuid not null,"display_name" text not null,"avatar_path" text,"version" integer default 1 not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "player_private"."registration_pair_links" ("registration_id" uuid not null,"pair_id" uuid not null,"tournament_id" uuid not null);
CREATE OR REPLACE FUNCTION public.create_tournament_with_bracket(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer, p_sport text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tournament_id uuid;
begin
  if p_sport not in ('tennis', 'padel') then
    raise exception 'Sport must be tennis or padel';
  end if;

  v_tournament_id := public.create_tournament_with_bracket(
    p_name,
    p_slug,
    p_location,
    p_starts_at,
    p_bracket_size
  );

  update public.tournaments
  set sport = p_sport
  where id = v_tournament_id;

  if not found then
    raise exception 'Tournament could not be updated';
  end if;

  return v_tournament_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION player_private.assign_registration_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.submitted_by := case when (select player_private.is_verified_user()) then (select auth.uid()) else null end;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_tournament_admins(p_tournament_id uuid)
 RETURNS TABLE(user_id uuid, email text, role text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ta.user_id, u.email::text, ta.role, ta.created_at
  from public.tournament_admins ta
  join auth.users u on u.id = ta.user_id
  where ta.tournament_id = p_tournament_id
    and (select public.is_tournament_admin(p_tournament_id))
  order by case ta.role when 'owner' then 0 else 1 end, ta.created_at;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_tournament_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tournament_id uuid;
  v_entity_id uuid;
  v_entity_type text;
begin
  if tg_table_name = 'tournaments' then
    v_tournament_id := new.id;
    v_entity_id := new.id;
    v_entity_type := 'tournament';
  elsif tg_table_name = 'pairs' then
    v_tournament_id := new.tournament_id;
    v_entity_id := new.id;
    v_entity_type := 'pair';
  else
    v_tournament_id := new.tournament_id;
    v_entity_id := new.id;
    v_entity_type := 'match';
  end if;

  insert into public.activity_log (
    tournament_id, entity_type, entity_id, action, changed_by, before_state, after_state
  ) values (
    v_tournament_id, v_entity_type, v_entity_id, 'updated', (select auth.uid()), to_jsonb(old), to_jsonb(new)
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_pair_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_tournament_admin(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select (select public.is_global_admin()); $function$
;
CREATE OR REPLACE FUNCTION public.is_tournament_owner(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select (select public.is_global_admin()); $function$
;
CREATE OR REPLACE FUNCTION public.record_match_result(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match public.matches%rowtype;
  v_next public.matches%rowtype;
  v_previous jsonb;
  v_new jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if v_match.pair_one_id is null or v_match.pair_two_id is null then raise exception 'Both participants are required'; end if;
  if p_winner_id not in (v_match.pair_one_id, v_match.pair_two_id) then raise exception 'Winner must be one of the participants'; end if;
  perform public.assert_result_score(v_match.pair_one_id,v_match.pair_two_id,p_winner_id,p_pair_one_sets,p_pair_two_sets);

  if v_match.next_match_id is not null then
    select * into v_next from public.matches where id = v_match.next_match_id for update;
    if v_match.winner_id is distinct from p_winner_id
      and (v_next.winner_id is not null or v_next.status in ('live', 'completed')) then
      raise exception 'Reset the following match before changing this winner';
    end if;
  end if;

  v_previous := jsonb_build_object(
    'pair_one_sets', v_match.pair_one_sets,
    'pair_two_sets', v_match.pair_two_sets,
    'winner_id', v_match.winner_id,
    'status', v_match.status
  );

  update public.matches
  set pair_one_sets = p_pair_one_sets,
      pair_two_sets = p_pair_two_sets,
      winner_id = p_winner_id,
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_match_id;

  if v_match.next_match_id is not null then
    if v_match.next_slot = 1 then
      update public.matches set pair_one_id = p_winner_id, updated_at = now() where id = v_match.next_match_id;
    else
      update public.matches set pair_two_id = p_winner_id, updated_at = now() where id = v_match.next_match_id;
    end if;
  elsif v_match.bracket_kind = 'playoffs' then
    update public.tournaments set status = 'completed', updated_at = now() where id = v_match.tournament_id;
  end if;

  v_new := jsonb_build_object(
    'pair_one_sets', p_pair_one_sets,
    'pair_two_sets', p_pair_two_sets,
    'winner_id', p_winner_id,
    'status', 'completed'
  );
  insert into public.match_result_history (match_id, tournament_id, changed_by, previous_state, new_state)
  values (p_match_id, v_match.tournament_id, (select auth.uid()), v_previous, v_new);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_manual_draw(p_tournament_id uuid, p_pair_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  if cardinality(p_pair_ids) is distinct from (select playoff_participant_count from public.tournaments where id=p_tournament_id) then raise exception 'Select every playoff participant'; end if;
  perform public.rebuild_playoff_bracket(p_tournament_id,p_pair_ids);
end; $function$
;
CREATE OR REPLACE FUNCTION public.add_tournament_admin_by_email(p_tournament_id uuid, p_email text, p_role text DEFAULT 'admin'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only an owner can manage the team'; end if;
  if p_role not in ('owner', 'admin') then raise exception 'Invalid role'; end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'This user must create an account first'; end if;
  insert into public.tournament_admins (tournament_id, user_id, role)
  values (p_tournament_id, v_user_id, p_role)
  on conflict (tournament_id, user_id) do update set role = excluded.role;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (p_tournament_id, 'admin', v_user_id, 'admin_added', (select auth.uid()), jsonb_build_object('role', p_role));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.remove_tournament_admin(p_tournament_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only an owner can manage the team'; end if;
  select role into v_role from public.tournament_admins where tournament_id = p_tournament_id and user_id = p_user_id;
  if v_role is null then raise exception 'Administrator not found'; end if;
  if v_role = 'owner' then raise exception 'An owner cannot be removed here'; end if;
  delete from public.tournament_admins where tournament_id = p_tournament_id and user_id = p_user_id;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, before_state)
  values (p_tournament_id, 'admin', p_user_id, 'admin_removed', (select auth.uid()), jsonb_build_object('role', v_role));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.prepare_tournament_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tournament_status text;
  v_registration_status text;
begin
  if tg_op = 'INSERT' then
    select status, registration_status
      into v_tournament_status, v_registration_status
    from public.tournaments
    where id = new.tournament_id;

    if not found or v_tournament_status not in ('published', 'live') then
      raise exception 'Tournament registration is unavailable';
    end if;
    if v_registration_status = 'closed' then
      raise exception 'Tournament registration is closed';
    end if;

    new.status := case when v_registration_status = 'waitlist' then 'waitlist' else 'new' end;
    new.pair_name := nullif(btrim(new.pair_name), '');
    new.player_one_first_name := btrim(new.player_one_first_name);
    new.player_one_last_name := btrim(new.player_one_last_name);
    new.player_one_email := lower(btrim(new.player_one_email));
    new.player_one_phone := btrim(new.player_one_phone);
    new.player_one_messenger := nullif(btrim(new.player_one_messenger), '');
    new.player_one_rating_system := nullif(btrim(new.player_one_rating_system), '');
    new.player_one_rating_value := nullif(btrim(new.player_one_rating_value), '');
    new.player_two_first_name := btrim(new.player_two_first_name);
    new.player_two_last_name := btrim(new.player_two_last_name);
    new.player_two_email := lower(btrim(new.player_two_email));
    new.player_two_phone := btrim(new.player_two_phone);
    new.player_two_messenger := nullif(btrim(new.player_two_messenger), '');
    new.player_two_rating_system := nullif(btrim(new.player_two_rating_system), '');
    new.player_two_rating_value := nullif(btrim(new.player_two_rating_value), '');
    new.comment := nullif(btrim(new.comment), '');
    new.terms_accepted_at := now();
    new.partner_consent_accepted_at := now();
    new.created_at := now();
    new.updated_at := now();
    new.admin_notes := null;
    new.status_changed_at := null;
    new.status_changed_by := null;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_global_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.global_admins
    where user_id = (select auth.uid()) and status = 'approved' and role = 'superadmin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.get_global_admin_access()
 RETURNS TABLE(role text, status text, requested_at timestamp with time zone, approved_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ga.role, ga.status, ga.requested_at, ga.approved_at
  from public.global_admins ga
  where ga.user_id = (select auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.reset_tournament_data(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_pair record;
  v_is_group_stage boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can reset tournament data'; end if;
  select format = 'group_knockout' into v_is_group_stage from public.tournaments where id = p_tournament_id;

  update public.matches set pair_one_id = null, pair_two_id = null, pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null,
    status = 'scheduled', court = null, scheduled_at = null, completed_at = null, updated_at = now()
  where tournament_id = p_tournament_id;
  update public.group_matches set pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null, status = 'scheduled',
    court = null, scheduled_at = null, completed_at = null, updated_at = now()
  where tournament_id = p_tournament_id;

  for v_pair in select id, row_number() over (order by seed nulls last, id) as number from public.pairs where tournament_id = p_tournament_id loop
    update public.pairs set name = 'Pair ' || lpad(v_pair.number::text, 2, '0'), player_one = 'Player ' || (v_pair.number * 2 - 1)::text,
      player_two = 'Player ' || (v_pair.number * 2)::text, updated_at = now() where id = v_pair.id;
  end loop;

  if not v_is_group_stage then
    update public.matches m set pair_one_id = first_pair.id, pair_two_id = second_pair.id, updated_at = now()
    from public.pairs first_pair join public.pairs second_pair on second_pair.tournament_id = first_pair.tournament_id and second_pair.seed = first_pair.seed + 1
    where m.tournament_id = p_tournament_id and m.round = 1 and first_pair.tournament_id = p_tournament_id and first_pair.seed = m.position * 2 - 1;
  end if;
  delete from public.match_result_history where tournament_id = p_tournament_id;
  delete from public.tournament_registrations where tournament_id = p_tournament_id;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (p_tournament_id, 'tournament', p_tournament_id, 'reset', v_user_id, jsonb_build_object('reset_at', now(), 'registrations_deleted', true));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.global_admins
    where user_id = (select auth.uid()) and status = 'approved'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.request_global_admin_access()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.global_admins (user_id, role, status)
  values (v_user_id, 'admin', 'pending')
  on conflict (user_id) do nothing;
  select status into v_status from public.global_admins where user_id = v_user_id;
  return v_status;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_global_admin_requests()
 RETURNS TABLE(user_id uuid, email text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.is_global_superadmin()) then raise exception 'Super administrator access required'; end if;
  return query
  select ga.user_id, u.email::text, ga.requested_at
  from public.global_admins ga
  join auth.users u on u.id = ga.user_id
  where ga.status = 'pending'
  order by ga.requested_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.approve_global_admin(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.is_global_superadmin()) then raise exception 'Super administrator access required'; end if;
  update public.global_admins
  set status = 'approved', role = 'admin', approved_at = now(), approved_by = (select auth.uid())
  where user_id = p_user_id and status = 'pending';
  if not found then raise exception 'Pending administrator request not found'; end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_managed_tournaments()
 RETURNS TABLE(id uuid, slug text, name text, sport text, location text, starts_at timestamp with time zone, ends_at timestamp with time zone, bracket_size integer, status text, registration_status text, updated_at timestamp with time zone, role text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    t.id, t.slug, t.name, t.sport, t.location, t.starts_at, t.ends_at,
    t.bracket_size, t.status, t.registration_status, t.updated_at,
    case
      when (select public.is_global_superadmin()) then 'owner'
      when (select public.is_global_admin()) then 'admin'
      else ta.role
    end as role
  from public.tournaments t
  left join public.tournament_admins ta
    on ta.tournament_id = t.id and ta.user_id = (select auth.uid())
  where (select public.is_global_admin()) or ta.user_id is not null
  order by t.created_at desc;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_tournament(p_tournament_id uuid, p_confirmation_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
begin
  if not (select public.is_global_admin()) then raise exception 'Global administrator access required'; end if;
  select name into v_name from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if p_confirmation_name is distinct from v_name then raise exception 'Tournament name confirmation does not match'; end if;
  delete from public.tournaments where id = p_tournament_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rebuild_group_matches(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group record;
  v_one record;
  v_two record;
  v_position integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can rebuild groups'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then
    raise exception 'Reset group results before changing assignments';
  end if;
  delete from public.group_matches where tournament_id = p_tournament_id;
  for v_group in select id from public.tournament_groups where tournament_id = p_tournament_id order by code loop
    v_position := 0;
    for v_one in select pair_id, position from public.group_members where group_id = v_group.id order by position loop
      for v_two in select pair_id, position from public.group_members where group_id = v_group.id and position > v_one.position order by position loop
        v_position := v_position + 1;
        insert into public.group_matches (tournament_id, group_id, position, pair_one_id, pair_two_id)
        values (p_tournament_id, v_group.id, v_position, v_one.pair_id, v_two.pair_id);
      end loop;
    end loop;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.configure_group_stage(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pair_ids uuid[];
  v_pair_id uuid;
  v_group_id uuid;
  v_index integer;
  v_code text;
  v_position integer;
  v_round integer;
  v_match_position integer;
  v_match_count integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can configure the group stage'; end if;
  if exists (select 1 from public.matches where tournament_id = p_tournament_id and (winner_id is not null or status <> 'scheduled'))
     or exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then
    raise exception 'Reset all active and completed matches before changing the format';
  end if;

  delete from public.matches where tournament_id = p_tournament_id;
  delete from public.tournament_groups where tournament_id = p_tournament_id;

  select coalesce(array_agg(id order by seed nulls last, updated_at, id), '{}') into v_pair_ids
  from public.pairs where tournament_id = p_tournament_id;
  while cardinality(v_pair_ids) < 18 loop
    v_index := cardinality(v_pair_ids) + 1;
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (p_tournament_id, 'Pair ' || lpad(v_index::text, 2, '0'), 'Player ' || (v_index * 2 - 1)::text, 'Player ' || (v_index * 2)::text, v_index)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;
  if cardinality(v_pair_ids) > 18 then raise exception 'Group format requires exactly 18 pairs'; end if;

  update public.tournaments set format = 'group_knockout', participant_count = 18, bracket_size = 8, updated_at = now() where id = p_tournament_id;
  for v_index in 1..5 loop
    v_code := chr(64 + v_index);
    insert into public.tournament_groups (tournament_id, code, qualify_count)
    values (p_tournament_id, v_code, case when v_index <= 3 then 2 else 1 end)
    returning id into v_group_id;
    for v_position in 1..case when v_index <= 3 then 4 else 3 end loop
      insert into public.group_members (group_id, pair_id, position)
      values (v_group_id, v_pair_ids[case when v_index <= 3 then (v_index - 1) * 4 + v_position else 12 + (v_index - 4) * 3 + v_position end], v_position);
    end loop;
  end loop;
  perform public.rebuild_group_matches(p_tournament_id);

  for v_round in 1..3 loop
    v_match_count := 8 / (2 ^ v_round);
    for v_match_position in 1..v_match_count loop
      insert into public.matches (tournament_id, round, position, status)
      values (p_tournament_id, v_round, v_match_position, 'scheduled');
    end loop;
  end loop;
  update public.matches current_match
  set next_match_id = next_match.id, next_slot = case when current_match.position % 2 = 1 then 1 else 2 end
  from public.matches next_match
  where current_match.tournament_id = p_tournament_id and next_match.tournament_id = p_tournament_id
    and next_match.round = current_match.round + 1 and next_match.position = ((current_match.position + 1) / 2)
    and current_match.round < 3;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_group_assignments(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_index integer; v_group_id uuid; v_position integer; v_pair_count integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only the shared tournament owner can change groups'; end if;
  select participant_count into v_pair_count from public.tournaments where id = p_tournament_id and format = 'group_knockout';
  if v_pair_count is null or cardinality(p_pair_ids) <> v_pair_count or cardinality(p_group_codes) <> v_pair_count then raise exception 'Assign every pair'; end if;
  if (select count(distinct item) from unnest(p_pair_ids) item) <> v_pair_count then raise exception 'Each pair can appear only once'; end if;
  if exists (select 1 from unnest(p_group_codes) code where not exists (select 1 from public.tournament_groups g where g.tournament_id = p_tournament_id and g.code = code)) then raise exception 'Invalid group code'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then raise exception 'Reset group results before changing assignments'; end if;
  if exists (select 1 from public.tournament_groups g where g.tournament_id = p_tournament_id and (select count(*) from unnest(p_group_codes) code where code = g.code) < 2) then raise exception 'Every group needs at least two pairs'; end if;
  delete from public.group_members where group_id in (select id from public.tournament_groups where tournament_id = p_tournament_id);
  for v_index in 1..v_pair_count loop
    select id into v_group_id from public.tournament_groups where tournament_id = p_tournament_id and code = p_group_codes[v_index];
    select count(*) + 1 into v_position from public.group_members where group_id = v_group_id;
    insert into public.group_members (group_id, pair_id, position) values (v_group_id, p_pair_ids[v_index], v_position);
  end loop;
  perform public.rebuild_group_matches(p_tournament_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reset_group_match_result(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_match public.group_matches%rowtype;
begin
  select * into v_match from public.group_matches where id = p_match_id for update;
  if not found then raise exception 'Group match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if exists (select 1 from public.matches where tournament_id = v_match.tournament_id and (winner_id is not null or status <> 'scheduled')) then raise exception 'Reset the knockout bracket before changing group results'; end if;
  update public.group_matches set pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null, status = 'scheduled', completed_at = null, updated_at = now() where id = p_match_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.confirm_group_qualifiers(p_tournament_id uuid, p_pair_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_required integer; v_basement uuid[];
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  select playoff_participant_count into v_required from public.tournaments where id=p_tournament_id and format='group_knockout' for update;
  if v_required is null or cardinality(p_pair_ids) is distinct from v_required or (select count(distinct id) from unnest(p_pair_ids) id)<>v_required then raise exception 'Select the configured number of distinct qualifiers'; end if;
  if not exists(select 1 from public.group_matches where tournament_id=p_tournament_id)
    or exists(select 1 from public.group_matches where tournament_id=p_tournament_id and status<>'completed') then raise exception 'Complete every group match first'; end if;
  if (select count(*) from public.group_members gm join public.tournament_groups g on g.id=gm.group_id where g.tournament_id=p_tournament_id and gm.pair_id=any(p_pair_ids))<>v_required then raise exception 'A selected pair is not in this group stage'; end if;
  select array_agg(p.id order by p.seed,p.id) into v_basement from public.pairs p where p.tournament_id=p_tournament_id and not(p.id=any(p_pair_ids));
  perform public.build_knockout_stage(p_tournament_id,p_pair_ids,'playoffs');
  if cardinality(v_basement)>=2 then perform public.build_knockout_stage(p_tournament_id,v_basement,'basement');
  else
    if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='basement' and (status<>'scheduled' or cardinality(pair_one_sets)>0)) then raise exception 'Сначала сбросьте результаты Короля подвала'; end if;
    delete from public.matches where tournament_id=p_tournament_id and bracket_kind='basement';
  end if;
  update public.tournaments set status='live',updated_at=now() where id=p_tournament_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.record_group_match_result(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_match public.group_matches%rowtype;
begin
  select * into v_match from public.group_matches where id = p_match_id for update;
  if not found then raise exception 'Group match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if p_winner_id not in (v_match.pair_one_id, v_match.pair_two_id) then raise exception 'Winner must be one of the participants'; end if;
  perform public.assert_result_score(v_match.pair_one_id,v_match.pair_two_id,p_winner_id,p_pair_one_sets,p_pair_two_sets);
  update public.group_matches set pair_one_sets = p_pair_one_sets, pair_two_sets = p_pair_two_sets, winner_id = p_winner_id,
    status = 'completed', completed_at = now(), updated_at = now() where id = p_match_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.seed_announced_group_pairs(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only a tournament owner can load announced pairs';
  end if;

  with announced(group_code, position, player_one, player_two) as (
    values
      ('A', 1, 'ARTEM', 'TIM'),
      ('A', 2, 'ROMAN', 'ARTUR'),
      ('A', 3, 'ALEX', 'ILLIA'),
      ('A', 4, 'VALERII', 'FILIP'),
      ('B', 1, 'EVGENIIM', 'AKSYM'),
      ('B', 2, 'KOSTYA', 'KIRILL'),
      ('B', 3, 'ANGELINA', 'DENIS'),
      ('B', 4, 'IHOR', 'MICHAEL'),
      ('C', 1, 'IHOR', 'OLEG'),
      ('C', 2, 'IHOR', 'PAVEL'),
      ('C', 3, 'BOHDAN', 'NAZAR'),
      ('C', 4, 'YURY', 'OLEG'),
      ('D', 1, 'SERGEY', 'ANTON'),
      ('D', 2, 'ALEN DZJIAN', 'PATRICK DOBESCH'),
      ('D', 3, 'SCHAWA', 'ILLIA'),
      ('E', 1, 'ARTUR', 'DANIEL'),
      ('E', 2, 'JULIAN', 'IGOR'),
      ('E', 3, 'DENYS', 'LIZA')
  )
  update public.pairs p
  set name = announced.player_one || ' / ' || announced.player_two,
      player_one = announced.player_one,
      player_two = announced.player_two,
      updated_at = now()
  from announced, public.tournament_groups g, public.group_members gm
  where g.tournament_id = p_tournament_id
    and g.code = announced.group_code
    and gm.group_id = g.id
    and gm.position = announced.position
    and p.id = gm.pair_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 18 then
    raise exception 'Configure all five groups before loading the announced pairs';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.next_bracket_size(p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_size integer := 2;
begin
  if p_count < 2 or p_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  while v_size < p_count loop v_size := v_size * 2; end loop;
  return v_size;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_flexible_tournament(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_sport text, p_participant_count integer, p_format text, p_group_count integer, p_playoff_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament_id uuid;
  v_pair_ids uuid[] := '{}';
  v_pair_id uuid;
  v_group_ids uuid[] := '{}';
  v_group_id uuid;
  v_index integer;
  v_group_index integer;
  v_position integer;
  v_qualify_base integer;
  v_qualify_remainder integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not (select public.is_global_admin()) then raise exception 'Only the shared tournament owner can create tournaments'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tournament name is required'; end if;
  if coalesce(trim(p_slug), '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a lowercase URL slug'; end if;
  if p_sport not in ('tennis', 'padel') then raise exception 'Invalid sport'; end if;
  if p_format not in ('knockout', 'group_knockout') then raise exception 'Invalid tournament format'; end if;
  if p_participant_count < 2 or p_participant_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  if p_playoff_count < 2 or p_playoff_count > p_participant_count then raise exception 'Invalid playoff pair count'; end if;
  if p_format = 'group_knockout' and (p_group_count < 1 or p_group_count > 26 or p_participant_count < p_group_count * 2) then raise exception 'Each group needs at least two pairs'; end if;

  insert into public.tournaments (name, slug, location, starts_at, bracket_size, participant_count, playoff_participant_count, format, sport, status)
  values (trim(p_name), trim(p_slug), nullif(trim(p_location), ''), p_starts_at, public.next_bracket_size(p_playoff_count), p_participant_count, p_playoff_count, p_format, p_sport, 'draft')
  returning id into v_tournament_id;
  insert into public.tournament_admins (tournament_id, user_id, role) values (v_tournament_id, v_user_id, 'owner');

  for v_index in 1..p_participant_count loop
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (v_tournament_id, 'Pair ' || lpad(v_index::text, 2, '0'), 'Player ' || (v_index * 2 - 1)::text, 'Player ' || (v_index * 2)::text, v_index)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;

  if p_format = 'knockout' then
    perform public.rebuild_playoff_bracket(v_tournament_id, v_pair_ids);
  else
    v_qualify_base := p_playoff_count / p_group_count;
    v_qualify_remainder := p_playoff_count % p_group_count;
    for v_group_index in 1..p_group_count loop
      insert into public.tournament_groups (tournament_id, code, qualify_count)
      values (v_tournament_id, chr(64 + v_group_index), v_qualify_base + case when v_group_index <= v_qualify_remainder then 1 else 0 end)
      returning id into v_group_id;
      v_group_ids := array_append(v_group_ids, v_group_id);
    end loop;
    for v_index in 1..p_participant_count loop
      v_group_index := ((v_index - 1) % p_group_count) + 1;
      select count(*) + 1 into v_position from public.group_members where group_id = v_group_ids[v_group_index];
      insert into public.group_members (group_id, pair_id, position) values (v_group_ids[v_group_index], v_pair_ids[v_index], v_position);
    end loop;
    perform public.rebuild_group_matches(v_tournament_id);
    perform public.rebuild_playoff_bracket(v_tournament_id, v_pair_ids[1:p_playoff_count]);
    update public.matches set pair_one_id = null, pair_two_id = null, winner_id = null, status = 'scheduled', completed_at = null where tournament_id = v_tournament_id;
  end if;

  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (v_tournament_id, 'tournament', v_tournament_id, 'created', v_user_id, jsonb_build_object('format', p_format, 'participant_count', p_participant_count, 'group_count', p_group_count, 'playoff_count', p_playoff_count));
  return v_tournament_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rebuild_playoff_bracket(p_tournament_id uuid, p_pair_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin perform public.build_knockout_stage(p_tournament_id,p_pair_ids,'playoffs'); end; $function$
;
CREATE OR REPLACE FUNCTION public.create_tournament_with_bracket(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament_id uuid;
  v_pair_ids uuid[] := '{}';
  v_pair_id uuid;
  v_rounds integer;
  v_round integer;
  v_position integer;
  v_match_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not (select public.is_global_admin()) then
    raise exception 'Only an existing tournament owner can create another tournament';
  end if;
  if p_bracket_size not in (8, 16, 32) then raise exception 'Bracket size must be 8, 16 or 32'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tournament name is required'; end if;
  if coalesce(trim(p_slug), '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a lowercase URL slug'; end if;

  insert into public.tournaments (name, slug, location, starts_at, bracket_size, status)
  values (trim(p_name), trim(p_slug), nullif(trim(p_location), ''), p_starts_at, p_bracket_size, 'draft')
  returning id into v_tournament_id;
  insert into public.tournament_admins (tournament_id, user_id, role)
  values (v_tournament_id, v_user_id, 'owner');

  for v_position in 1..p_bracket_size loop
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (v_tournament_id, 'Pair ' || lpad(v_position::text, 2, '0'),
      'Player ' || ((v_position - 1) * 2 + 1)::text, 'Player ' || (v_position * 2)::text, v_position)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;

  v_rounds := case p_bracket_size when 8 then 3 when 16 then 4 when 32 then 5 end;
  for v_round in 1..v_rounds loop
    v_match_count := p_bracket_size / (2 ^ v_round);
    for v_position in 1..v_match_count loop
      insert into public.matches (tournament_id, round, position, pair_one_id, pair_two_id, status)
      values (v_tournament_id, v_round, v_position,
        case when v_round = 1 then v_pair_ids[v_position * 2 - 1] else null end,
        case when v_round = 1 then v_pair_ids[v_position * 2] else null end, 'scheduled');
    end loop;
  end loop;

  update public.matches current_match
  set next_match_id = next_match.id,
      next_slot = case when current_match.position % 2 = 1 then 1 else 2 end
  from public.matches next_match
  where current_match.tournament_id = v_tournament_id
    and next_match.tournament_id = v_tournament_id
    and next_match.round = current_match.round + 1
    and next_match.position = ((current_match.position + 1) / 2)
    and current_match.round < v_rounds;

  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (v_tournament_id, 'tournament', v_tournament_id, 'created', v_user_id,
    jsonb_build_object('name', trim(p_name), 'bracket_size', p_bracket_size));
  return v_tournament_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_tournament_setup(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_sport text, p_status text, p_format text, p_pairs jsonb, p_groups jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid; v_count integer; v_group_count integer; v_playoffs integer;
  v_pair record; v_input jsonb; v_group jsonb; v_index integer := 0;
  v_ids uuid[] := '{}'; v_codes text[] := '{}'; v_size integer;
begin
  if not coalesce((select public.is_global_admin()),false) then raise exception 'Organiser access required'; end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid setup'; end if;
  v_count := jsonb_array_length(p_pairs);
  v_group_count := jsonb_array_length(p_groups);
  if v_count < 2 or v_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at < p_starts_at then raise exception 'Check tournament dates'; end if;
  if p_status is null or p_status not in ('draft','published') then raise exception 'Invalid visibility'; end if;
  if p_format is null or p_format not in ('group_knockout','knockout') then raise exception 'Invalid format'; end if;
  if p_sport is null or p_sport not in ('tennis','padel') then raise exception 'Invalid sport'; end if;
  if exists (select 1 from jsonb_array_elements(p_pairs) item where
      (coalesce(trim(item->>'player_one'),'')='') <> (coalesce(trim(item->>'player_two'),'')='')
      or length(coalesce(item->>'player_one',''))>200 or length(coalesce(item->>'player_two',''))>200 or length(coalesce(item->>'name',''))>200)
  then raise exception 'Enter both player names or leave both empty (maximum 200 characters)'; end if;
  if p_format='group_knockout' then
    if v_group_count < 1 or v_group_count > 26 or v_group_count*2 > v_count then raise exception 'Each group needs at least two pairs'; end if;
    v_playoffs := 0;
    for v_index in 0..v_group_count-1 loop
      v_group := p_groups->v_index;
      if (v_group->>'code') is distinct from chr(65+v_index) then raise exception 'Groups must be ordered A, B, C'; end if;
      select count(*) into v_size from jsonb_array_elements(p_pairs) item where item->>'group'=v_group->>'code';
      if v_size < 2 or (v_group->>'qualify_count') is null or (v_group->>'qualify_count')::integer not between 0 and v_size then raise exception 'Check group size and qualifiers'; end if;
      v_playoffs := v_playoffs + (v_group->>'qualify_count')::integer;
    end loop;
    if exists(select 1 from jsonb_array_elements(p_pairs) item where not exists(select 1 from jsonb_array_elements(p_groups) g where g->>'code'=item->>'group')) then raise exception 'Every pair needs a valid group'; end if;
    if v_playoffs < 2 or v_playoffs > v_count then raise exception 'Choose at least two playoff pairs'; end if;
  else
    if v_group_count <> 0 then raise exception 'Knockout tournaments do not use groups'; end if;
    v_playoffs := v_count;
  end if;
  v_id := public.create_flexible_tournament(p_name,p_slug,p_location,p_starts_at,p_sport,v_count,p_format,v_group_count,v_playoffs);
  v_index := 0;
  for v_pair in select id from public.pairs where tournament_id=v_id order by seed loop
    v_input := p_pairs->v_index;
    update public.pairs set
      name=coalesce(nullif(trim(v_input->>'name'),''),case when nullif(trim(v_input->>'player_one'),'') is not null then trim(v_input->>'player_one') || ' / ' || trim(v_input->>'player_two') else 'Pair ' || lpad((v_index+1)::text,2,'0') end),
      player_one=coalesce(nullif(trim(v_input->>'player_one'),''),'Player ' || (v_index*2+1)::text),
      player_two=coalesce(nullif(trim(v_input->>'player_two'),''),'Player ' || (v_index*2+2)::text), updated_at=now()
    where id=v_pair.id;
    v_ids := array_append(v_ids,v_pair.id);
    v_codes := array_append(v_codes,v_input->>'group');
    v_index := v_index+1;
  end loop;
  if p_format='group_knockout' then
    perform public.set_group_assignments(v_id,v_ids,v_codes);
    for v_group in select value from jsonb_array_elements(p_groups) loop
      update public.tournament_groups set qualify_count=(v_group->>'qualify_count')::integer
      where tournament_id=v_id and code=v_group->>'code';
    end loop;
  end if;
  update public.tournaments set ends_at=p_ends_at,status=p_status,updated_at=now() where id=v_id;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.assert_result_score(p_one uuid, p_two uuid, p_winner uuid, p_scores_one integer[], p_scores_two integer[])
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_one integer; v_two integer;
begin
  if p_one is null or p_two is null or p_one=p_two then raise exception 'Обе пары должны быть определены'; end if;
  if p_winner is null or p_winner not in(p_one,p_two) then raise exception 'Выберите победителя из участников матча'; end if;
  if coalesce(cardinality(p_scores_one),0)=0 or cardinality(p_scores_one) is distinct from cardinality(p_scores_two)
    or array_ndims(p_scores_one)<>1 or array_ndims(p_scores_two)<>1
    or array_lower(p_scores_one,1)<>1 or array_lower(p_scores_two,1)<>1 then raise exception 'Укажите корректный счёт обеих пар'; end if;
  if exists(select 1 from unnest(p_scores_one||p_scores_two) score where score is null or score<0 or score>99) then raise exception 'Счёт должен состоять из целых чисел от 0 до 99'; end if;
  if exists(select 1 from generate_subscripts(p_scores_one,1) i where p_scores_one[i]=p_scores_two[i]) then raise exception 'В итоговом счёте не может быть ничейного сета'; end if;
  select count(*) filter(where p_scores_one[i]>p_scores_two[i]),count(*) filter(where p_scores_two[i]>p_scores_one[i]) into v_one,v_two from generate_subscripts(p_scores_one,1) i;
  if v_one=v_two then raise exception 'По счёту ничья по сетам: укажите решающий сет'; end if;
  if (v_one>v_two and p_winner<>p_one) or (v_two>v_one and p_winner<>p_two) then raise exception 'Выбранный победитель не соответствует счёту. Счёт записывается в порядке пар сверху вниз'; end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_recorded_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status='completed' and new.pair_one_id is not null and new.pair_two_id is not null then
    perform public.assert_result_score(new.pair_one_id,new.pair_two_id,new.winner_id,new.pair_one_sets,new.pair_two_sets);
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.reset_match_result(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match public.matches%rowtype;
  v_next public.matches%rowtype;
  v_previous jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if v_match.winner_id is null then raise exception 'This match has no saved result'; end if;

  if v_match.next_match_id is not null then
    select * into v_next from public.matches where id = v_match.next_match_id for update;
    if v_next.winner_id is not null or v_next.status in ('live', 'completed') then
      raise exception 'Reset the following match first';
    end if;
  end if;

  v_previous := jsonb_build_object(
    'pair_one_sets', v_match.pair_one_sets,
    'pair_two_sets', v_match.pair_two_sets,
    'winner_id', v_match.winner_id,
    'status', v_match.status
  );

  if v_match.next_match_id is not null then
    if v_match.next_slot = 1 then
      update public.matches set pair_one_id = null, updated_at = now() where id = v_match.next_match_id;
    else
      update public.matches set pair_two_id = null, updated_at = now() where id = v_match.next_match_id;
    end if;
  elsif v_match.bracket_kind = 'playoffs' then
    update public.tournaments set status = 'live', updated_at = now() where id = v_match.tournament_id;
  end if;

  update public.matches
  set pair_one_sets = '{}',
      pair_two_sets = '{}',
      winner_id = null,
      status = 'scheduled',
      completed_at = null,
      updated_at = now()
  where id = p_match_id;

  insert into public.match_result_history (match_id, tournament_id, changed_by, previous_state, new_state)
  values (
    p_match_id, v_match.tournament_id, (select auth.uid()), v_previous,
    jsonb_build_object('pair_one_sets', '[]'::jsonb, 'pair_two_sets', '[]'::jsonb, 'winner_id', null, 'status', 'scheduled')
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.build_knockout_stage(p_tournament_id uuid, p_pair_ids uuid[], p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer := cardinality(p_pair_ids); v_size integer:=2; v_extra integer; v_rounds integer;
  v_round integer; v_position integer; v_slot integer; v_seed integer; v_i integer; v_order integer[]:=array[1,2]; v_new_order integer[];
  v_seeds uuid[]; v_next uuid; v_index integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  perform 1 from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if p_kind not in('playoffs','basement') or p_kind is null then raise exception 'Invalid stage'; end if;
  if v_count is null or v_count<2 or v_count>64 or array_ndims(p_pair_ids)<>1 or array_lower(p_pair_ids,1)<>1 then raise exception 'Select between 2 and 64 pairs'; end if;
  if (select count(distinct id) from unnest(p_pair_ids) id)<>v_count
    or (select count(*) from public.pairs where tournament_id=p_tournament_id and id=any(p_pair_ids))<>v_count then raise exception 'Select distinct pairs from this tournament'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind
    and (status='live' or cardinality(pair_one_sets)>0 or cardinality(pair_two_sets)>0 or (status='completed' and pair_one_id is not null and pair_two_id is not null))) then raise exception 'Сначала сбросьте результаты этой сетки перед изменением жеребьёвки'; end if;
  while v_size*2<=v_count loop v_size:=v_size*2; end loop;
  v_extra:=v_count-v_size; v_rounds:=log(2,v_size)::integer;
  while cardinality(v_order)<v_size loop
    v_new_order:='{}';
    foreach v_seed in array v_order loop v_new_order:=array_append(v_new_order,v_seed); v_new_order:=array_append(v_new_order,cardinality(v_order)*2+1-v_seed); end loop;
    v_order:=v_new_order;
  end loop;
  delete from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind;
  for v_round in 1..v_rounds loop
    for v_position in 1..v_size/(2^v_round) loop
      v_seeds:=array[null::uuid,null::uuid];
      if v_round=1 then
        for v_slot in 1..2 loop
          v_seed:=v_order[(v_position-1)*2+v_slot];
          if v_seed<=v_size-v_extra then v_seeds[v_slot]:=p_pair_ids[v_seed]; end if;
        end loop;
      end if;
      insert into public.matches(tournament_id,bracket_kind,round,position,pair_one_id,pair_two_id)
      values(p_tournament_id,p_kind,v_round,v_position,v_seeds[1],v_seeds[2]);
    end loop;
  end loop;
  update public.matches m set next_match_id=n.id,next_slot=case when m.position%2=1 then 1 else 2 end
    from public.matches n where m.tournament_id=p_tournament_id and n.tournament_id=p_tournament_id
    and m.bracket_kind=p_kind and n.bracket_kind=p_kind and n.round=m.round+1 and n.position=(m.position+1)/2;
  for v_i in 1..v_extra loop
    v_seed:=v_size-v_extra+v_i;
    v_index:=array_position(v_order,v_seed);
    select id into v_next from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind and round=1 and position=(v_index+1)/2;
    insert into public.matches(tournament_id,bracket_kind,round,position,pair_one_id,pair_two_id,next_match_id,next_slot)
    values(p_tournament_id,p_kind,0,v_i,p_pair_ids[v_seed],p_pair_ids[v_count-v_i+1],v_next,case when v_index%2=1 then 1 else 2 end);
  end loop;
  if p_kind='playoffs' then update public.tournaments set bracket_size=v_size,playoff_participant_count=v_count,updated_at=now() where id=p_tournament_id; end if;
end; $function$
;
CREATE OR REPLACE FUNCTION public.create_basement_bracket(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ids uuid[];
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  perform 1 from public.tournaments where id=p_tournament_id and format='group_knockout' for update;
  if not found then raise exception 'Group tournament required'; end if;
  if exists(select 1 from public.group_matches where tournament_id=p_tournament_id and status<>'completed') then raise exception 'Complete every group match first'; end if;
  if not exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='playoffs' and (pair_one_id is not null or pair_two_id is not null)) then raise exception 'Сначала подтвердите участников плей-офф'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='basement') then raise exception 'Сетка Короля подвала уже существует'; end if;
  select array_agg(p.id order by p.seed,p.id) into v_ids from public.pairs p where p.tournament_id=p_tournament_id
    and not exists(select 1 from public.matches m where m.tournament_id=p_tournament_id and m.bracket_kind='playoffs' and (m.pair_one_id=p.id or m.pair_two_id=p.id));
  if coalesce(cardinality(v_ids),0)<2 then raise exception 'Для Короля подвала нужны минимум две пары вне плей-офф'; end if;
  perform public.build_knockout_stage(p_tournament_id,v_ids,'basement');
end; $function$
;
CREATE OR REPLACE FUNCTION player_private.version_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION player_private.is_verified_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null
      and not coalesce(is_anonymous, false) and coalesce(banned_until, '-infinity') < now());
$function$
;
CREATE OR REPLACE FUNCTION public.redeem_registration_claim_code(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  claim_row player_private.registration_claim_codes%ROWTYPE;
  v_registration_id uuid;
  v_player_role text;
  verified_email text;
  token_hash bytea;
BEGIN
  IF NOT (SELECT player_private.is_verified_user()) OR p_code IS NULL OR p_code !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  token_hash := extensions.digest(decode(lower(p_code),'hex'),'sha256');
  SELECT c.registration_id,c.player_role INTO v_registration_id,v_player_role
    FROM player_private.registration_claim_codes c
    WHERE c.code_hash=token_hash AND c.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Code unavailable' USING errcode = '42501'; END IF;
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id=v_registration_id FOR UPDATE;
  SELECT * INTO claim_row FROM player_private.registration_claim_codes c
    WHERE c.registration_id=v_registration_id AND c.player_role=v_player_role
      AND c.code_hash=token_hash AND c.expires_at > now() FOR UPDATE;
  IF NOT FOUND OR registration_row.id IS NULL THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  SELECT lower(btrim(u.email)) INTO verified_email FROM auth.users u WHERE u.id=(SELECT auth.uid());
  IF (v_player_role='primary' AND (registration_row.submitted_by IS NOT NULL OR lower(btrim(registration_row.player_one_email)) IS DISTINCT FROM verified_email))
    OR (v_player_role='partner' AND (registration_row.partner_user_id IS NOT NULL OR lower(btrim(registration_row.player_two_email)) IS DISTINCT FROM verified_email)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  IF v_player_role='primary' THEN
    UPDATE public.tournament_registrations SET submitted_by=(SELECT auth.uid()) WHERE id=v_registration_id;
  ELSE
    UPDATE public.tournament_registrations SET partner_user_id=(SELECT auth.uid()) WHERE id=v_registration_id;
  END IF;
  DELETE FROM player_private.registration_claim_codes WHERE registration_id=claim_row.registration_id AND player_role=claim_row.player_role;
  RETURN v_registration_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.list_tournament_registrations(p_tournament_id uuid)
 RETURNS SETOF tournament_registrations
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_tournament_id IS NULL OR NOT (SELECT public.is_tournament_admin(p_tournament_id)) THEN
    RAISE EXCEPTION 'Applications unavailable' USING errcode = '42501';
  END IF;
  RETURN QUERY SELECT r.* FROM public.tournament_registrations r
    WHERE r.tournament_id = p_tournament_id ORDER BY r.created_at DESC;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.issue_registration_claim_code(p_registration_id uuid, p_player_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  claim_code text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_player_role IS NULL OR p_player_role NOT IN ('primary','partner') THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR NOT (SELECT public.is_tournament_admin(registration_row.tournament_id)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  IF (p_player_role = 'primary' AND registration_row.submitted_by IS NOT NULL)
    OR (p_player_role = 'partner' AND (registration_row.partner_user_id IS NOT NULL OR nullif(btrim(registration_row.player_two_email),'') IS NULL)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  claim_code := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO player_private.registration_claim_codes(registration_id,player_role,code_hash,issued_by,expires_at)
  VALUES(p_registration_id,p_player_role,extensions.digest(decode(claim_code,'hex'),'sha256'),(SELECT auth.uid()),now() + interval '7 days')
  ON CONFLICT (registration_id,player_role) DO UPDATE
    SET code_hash=excluded.code_hash, issued_by=excluded.issued_by, issued_at=now(), expires_at=excluded.expires_at;
  RETURN claim_code;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.link_registration_pair(p_registration_id uuid, p_pair_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  existing_pair uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  -- Lock the registration to serialize link/unlink and status changes.
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_tournament_admin(registration_row.tournament_id),false) THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  -- Allow removing a stale link after a registration has been cancelled.
  IF p_pair_id IS NULL THEN
    DELETE FROM player_private.registration_pair_links WHERE registration_id=p_registration_id;
    RETURN;
  END IF;
  IF registration_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Confirmed registration required' USING errcode='23514';
  END IF;
  PERFORM 1 FROM public.pairs WHERE id=p_pair_id AND tournament_id=registration_row.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pair must belong to the registration tournament' USING errcode='23514';
  END IF;
  SELECT l.pair_id INTO existing_pair FROM player_private.registration_pair_links l
    WHERE l.registration_id=p_registration_id;
  IF existing_pair IS NOT NULL THEN
    IF existing_pair=p_pair_id THEN RETURN; END IF;
    RAISE EXCEPTION 'Unlink the registration before assigning another pair' USING errcode='23505';
  END IF;
  -- UNIQUE(pair_id) arbitrates concurrent attempts for the same pair.
  INSERT INTO player_private.registration_pair_links(registration_id,pair_id,tournament_id)
    VALUES(p_registration_id,p_pair_id,registration_row.tournament_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_registration_pair_links(p_tournament_id uuid)
 RETURNS TABLE(registration_id uuid, pair_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_tournament_id IS NULL
    OR NOT coalesce(public.is_tournament_admin(p_tournament_id),false) THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  RETURN QUERY SELECT l.registration_id,l.pair_id FROM player_private.registration_pair_links l
    WHERE l.tournament_id=p_tournament_id ORDER BY l.registration_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_match_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  viewer_id uuid := (SELECT auth.uid());
  result jsonb;
BEGIN
  IF viewer_id IS NULL OR NOT (SELECT player_private.is_verified_user()) THEN
    RAISE EXCEPTION 'Verified player account required' USING errcode='42501';
  END IF;
  WITH own_pairs AS (
    SELECT l.pair_id,r.tournament_id,
      CASE WHEN r.submitted_by=viewer_id THEN nullif(r.partner_user_id,viewer_id)
        ELSE nullif(r.submitted_by,viewer_id) END AS partner_user_id,
      CASE WHEN r.submitted_by=viewer_id THEN btrim(concat_ws(' ',r.player_two_first_name,r.player_two_last_name))
        ELSE btrim(concat_ws(' ',r.player_one_first_name,r.player_one_last_name)) END AS partner_name,
      t.name AS tournament_name,t.slug AS tournament_slug,t.sport,t.status AS tournament_status,t.starts_at
    FROM player_private.registration_pair_links l
    JOIN public.tournament_registrations r ON r.id=l.registration_id AND r.tournament_id=l.tournament_id
    JOIN public.tournaments t ON t.id=r.tournament_id
    WHERE r.status='confirmed' AND t.status<>'draft'
      AND (r.submitted_by=viewer_id OR r.partner_user_id=viewer_id)
  ), match_rows AS (
    SELECT 'group'::text AS kind,g.id,g.tournament_id,'group'::text AS stage,
      null::integer AS round,null::integer AS final_round,false AS is_final,
      g.status,g.winner_id,g.pair_one_id,g.pair_two_id,g.pair_one_sets,g.pair_two_sets,g.completed_at,g.scheduled_at
    FROM public.group_matches g
    UNION ALL
    SELECT 'knockout',m.id,m.tournament_id,m.bracket_kind,m.round,
      max(m.round) OVER (PARTITION BY m.tournament_id,m.bracket_kind),
      m.round>0 AND m.round=max(m.round) OVER (PARTITION BY m.tournament_id,m.bracket_kind)
        AND m.next_match_id IS NULL,
      m.status,m.winner_id,m.pair_one_id,m.pair_two_id,m.pair_one_sets,m.pair_two_sets,m.completed_at,m.scheduled_at
    FROM public.matches m
  ), projected AS (
    -- Multiple owned pairs may have independent matches, but owning both sides
    -- makes a match ambiguous: exclude it rather than choosing a side by UUID.
    SELECT m.kind,m.id,o.starts_at,m.completed_at,m.scheduled_at,
      jsonb_build_object(
        'id',m.kind||':'||m.id::text,
        'tournament_id',o.tournament_id,'tournament_name',o.tournament_name,
        'tournament_slug',o.tournament_slug,'sport',o.sport,
        'tournament_status',o.tournament_status,'tournament_date',o.starts_at,
        'pair_id',o.pair_id,'partner_user_id',o.partner_user_id,'partner_name',o.partner_name,
        'opponent_name',opponent.name,
        'stage',m.stage,'round',m.round,'final_round',m.final_round,'is_final',m.is_final,
        'status',m.status,'winner_id',m.winner_id,
        'pair_one_id',m.pair_one_id,'pair_two_id',m.pair_two_id,
        'pair_one_sets',m.pair_one_sets,'pair_two_sets',m.pair_two_sets,
        'completed_at',m.completed_at,'scheduled_at',m.scheduled_at
      ) AS payload
    FROM own_pairs o JOIN match_rows m ON m.tournament_id=o.tournament_id
      AND (m.pair_one_id=o.pair_id OR m.pair_two_id=o.pair_id)
    LEFT JOIN public.pairs opponent ON opponent.tournament_id=m.tournament_id
      AND opponent.id=CASE WHEN m.pair_one_id=o.pair_id THEN m.pair_two_id ELSE m.pair_one_id END
    WHERE m.status IN ('scheduled','live','completed')
      AND NOT EXISTS (
        SELECT 1 FROM own_pairs other
        WHERE other.tournament_id=m.tournament_id
          AND other.pair_id=CASE WHEN m.pair_one_id=o.pair_id THEN m.pair_two_id ELSE m.pair_one_id END
      )
  )
  SELECT coalesce(jsonb_agg(payload ORDER BY starts_at DESC NULLS LAST,
    coalesce(completed_at,scheduled_at) DESC NULLS LAST,kind,id),'[]'::jsonb)
  INTO result FROM projected;
  RETURN result;
END;
$function$
;
alter table "public"."global_admins" add constraint "global_admins_pkey" PRIMARY KEY (user_id);
alter table "public"."global_admins" add constraint "global_admins_role_check" CHECK ((role = ANY (ARRAY['superadmin'::text, 'admin'::text])));
alter table "public"."global_admins" add constraint "global_admins_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'revoked'::text])));
alter table "player_private"."registration_claim_codes" add constraint "registration_claim_codes_code_hash_key" UNIQUE (code_hash);
alter table "player_private"."registration_claim_codes" add constraint "registration_claim_codes_pkey" PRIMARY KEY (registration_id, player_role);
alter table "player_private"."registration_claim_codes" add constraint "registration_claim_codes_player_role_check" CHECK ((player_role = ANY (ARRAY['primary'::text, 'partner'::text])));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_admin_notes_check" CHECK (((admin_notes IS NULL) OR (char_length(admin_notes) <= 2000)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_comment_check" CHECK (((comment IS NULL) OR (char_length(comment) <= 1000)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_id_tournament_key" UNIQUE (id, tournament_id);
alter table "public"."tournament_registrations" add constraint "tournament_registrations_landing_page_length" CHECK (((landing_page IS NULL) OR (char_length(landing_page) <= 2048)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_locale_check" CHECK ((locale = ANY (ARRAY['en'::text, 'uk'::text, 'de'::text, 'ru'::text])));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_pair_name_check" CHECK (((pair_name IS NULL) OR ((char_length(pair_name) >= 1) AND (char_length(pair_name) <= 120))));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_pkey" PRIMARY KEY (id);
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_email_check" CHECK ((player_one_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_first_name_check" CHECK (((char_length(btrim(player_one_first_name)) >= 1) AND (char_length(btrim(player_one_first_name)) <= 80)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_last_name_check" CHECK (((char_length(btrim(player_one_last_name)) >= 1) AND (char_length(btrim(player_one_last_name)) <= 80)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_level_check" CHECK ((player_one_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'competitive'::text])));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_messenger_check" CHECK (((player_one_messenger IS NULL) OR (char_length(player_one_messenger) <= 100)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_phone_check" CHECK (((char_length(btrim(player_one_phone)) >= 5) AND (char_length(btrim(player_one_phone)) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_rating_system_check" CHECK (((player_one_rating_system IS NULL) OR (char_length(player_one_rating_system) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_one_rating_value_check" CHECK (((player_one_rating_value IS NULL) OR (char_length(player_one_rating_value) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_email_check" CHECK ((player_two_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_first_name_check" CHECK (((char_length(btrim(player_two_first_name)) >= 1) AND (char_length(btrim(player_two_first_name)) <= 80)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_last_name_check" CHECK (((char_length(btrim(player_two_last_name)) >= 1) AND (char_length(btrim(player_two_last_name)) <= 80)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_level_check" CHECK ((player_two_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'competitive'::text])));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_messenger_check" CHECK (((player_two_messenger IS NULL) OR (char_length(player_two_messenger) <= 100)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_phone_check" CHECK (((char_length(btrim(player_two_phone)) >= 5) AND (char_length(btrim(player_two_phone)) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_rating_system_check" CHECK (((player_two_rating_system IS NULL) OR (char_length(player_two_rating_system) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_player_two_rating_value_check" CHECK (((player_two_rating_value IS NULL) OR (char_length(player_two_rating_value) <= 40)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_referrer_length" CHECK (((referrer IS NULL) OR (char_length(referrer) <= 2048)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'confirmed'::text, 'waitlist'::text, 'rejected'::text])));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_utm_campaign_length" CHECK (((utm_campaign IS NULL) OR (char_length(utm_campaign) <= 255)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_utm_content_length" CHECK (((utm_content IS NULL) OR (char_length(utm_content) <= 255)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_utm_medium_length" CHECK (((utm_medium IS NULL) OR (char_length(utm_medium) <= 255)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_utm_source_length" CHECK (((utm_source IS NULL) OR (char_length(utm_source) <= 255)));
alter table "public"."tournament_registrations" add constraint "tournament_registrations_utm_term_length" CHECK (((utm_term IS NULL) OR (char_length(utm_term) <= 255)));
alter table "public"."tournaments" add constraint "tournaments_bracket_size_check" CHECK ((bracket_size = ANY (ARRAY[2, 4, 8, 16, 32, 64])));
alter table "public"."tournaments" add constraint "tournaments_date_range_check" CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at)));
alter table "public"."tournaments" add constraint "tournaments_format_check" CHECK ((format = ANY (ARRAY['knockout'::text, 'group_knockout'::text])));
alter table "public"."tournaments" add constraint "tournaments_format_description_check" CHECK (((format_description IS NULL) OR (char_length(format_description) <= 160)));
alter table "public"."tournaments" add constraint "tournaments_participant_count_check" CHECK (((participant_count >= 2) AND (participant_count <= 64)));
alter table "public"."tournaments" add constraint "tournaments_pkey" PRIMARY KEY (id);
alter table "public"."tournaments" add constraint "tournaments_playoff_participant_count_check" CHECK ((((playoff_participant_count >= 2) AND (playoff_participant_count <= 64)) AND (playoff_participant_count <= participant_count)));
alter table "public"."tournaments" add constraint "tournaments_prize_pool_check" CHECK (((prize_pool IS NULL) OR (char_length(prize_pool) <= 80)));
alter table "public"."tournaments" add constraint "tournaments_registration_status_check" CHECK ((registration_status = ANY (ARRAY['open'::text, 'waitlist'::text, 'closed'::text])));
alter table "public"."tournaments" add constraint "tournaments_slug_check" CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
alter table "public"."tournaments" add constraint "tournaments_slug_key" UNIQUE (slug);
alter table "public"."tournaments" add constraint "tournaments_sport_check" CHECK ((sport = ANY (ARRAY['tennis'::text, 'padel'::text])));
alter table "public"."tournaments" add constraint "tournaments_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'live'::text, 'completed'::text])));
alter table "public"."matches" add constraint "matches_bracket_kind_check" CHECK ((bracket_kind = ANY (ARRAY['playoffs'::text, 'basement'::text])));
alter table "public"."matches" add constraint "matches_check" CHECK ((((next_match_id IS NULL) AND (next_slot IS NULL)) OR ((next_match_id IS NOT NULL) AND (next_slot IS NOT NULL))));
alter table "public"."matches" add constraint "matches_check1" CHECK (((winner_id IS NULL) OR (winner_id = pair_one_id) OR (winner_id = pair_two_id)));
alter table "public"."matches" add constraint "matches_next_slot_check" CHECK ((next_slot = ANY (ARRAY[1, 2])));
alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY (id);
alter table "public"."matches" add constraint "matches_position_check" CHECK (("position" > 0));
alter table "public"."matches" add constraint "matches_round_check" CHECK (((round >= 0) AND (round <= 6)));
alter table "public"."matches" add constraint "matches_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text])));
alter table "public"."matches" add constraint "matches_tournament_stage_round_position_key" UNIQUE (tournament_id, bracket_kind, round, "position");
alter table "public"."pairs" add constraint "pairs_id_tournament_key" UNIQUE (id, tournament_id);
alter table "public"."pairs" add constraint "pairs_pkey" PRIMARY KEY (id);
alter table "public"."pairs" add constraint "pairs_tournament_id_seed_key" UNIQUE (tournament_id, seed);
alter table "public"."tournament_admins" add constraint "tournament_admins_pkey" PRIMARY KEY (tournament_id, user_id);
alter table "public"."tournament_admins" add constraint "tournament_admins_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text])));
alter table "public"."tournament_groups" add constraint "tournament_groups_code_check" CHECK ((code ~ '^[A-Z]$'::text));
alter table "public"."tournament_groups" add constraint "tournament_groups_pkey" PRIMARY KEY (id);
alter table "public"."tournament_groups" add constraint "tournament_groups_qualify_count_check" CHECK (((qualify_count >= 0) AND (qualify_count <= 64)));
alter table "public"."tournament_groups" add constraint "tournament_groups_tournament_id_code_key" UNIQUE (tournament_id, code);
alter table "public"."group_members" add constraint "group_members_group_id_position_key" UNIQUE (group_id, "position");
alter table "public"."group_members" add constraint "group_members_pair_id_key" UNIQUE (pair_id);
alter table "public"."group_members" add constraint "group_members_pkey" PRIMARY KEY (group_id, pair_id);
alter table "public"."group_members" add constraint "group_members_position_check" CHECK (("position" > 0));
alter table "public"."group_matches" add constraint "group_matches_check" CHECK ((pair_one_id <> pair_two_id));
alter table "public"."group_matches" add constraint "group_matches_check1" CHECK (((winner_id IS NULL) OR ((winner_id = pair_one_id) OR (winner_id = pair_two_id))));
alter table "public"."group_matches" add constraint "group_matches_group_id_position_key" UNIQUE (group_id, "position");
alter table "public"."group_matches" add constraint "group_matches_pkey" PRIMARY KEY (id);
alter table "public"."group_matches" add constraint "group_matches_position_check" CHECK (("position" > 0));
alter table "public"."group_matches" add constraint "group_matches_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text])));
alter table "public"."match_result_history" add constraint "match_result_history_pkey" PRIMARY KEY (id);
alter table "public"."activity_log" add constraint "activity_log_entity_type_check" CHECK ((entity_type = ANY (ARRAY['tournament'::text, 'pair'::text, 'match'::text, 'admin'::text])));
alter table "public"."activity_log" add constraint "activity_log_pkey" PRIMARY KEY (id);
alter table "public"."player_profiles" add constraint "player_profiles_auth_user_id_key" UNIQUE (auth_user_id);
alter table "public"."player_profiles" add constraint "player_profiles_check" CHECK (((avatar_path IS NULL) OR (avatar_path ~ (('^'::text || (auth_user_id)::text) || '/[0-9a-f-]{36}\.jpg$'::text))));
alter table "public"."player_profiles" add constraint "player_profiles_display_name_check" CHECK (((display_name = btrim(display_name)) AND ((char_length(display_name) >= 1) AND (char_length(display_name) <= 80))));
alter table "public"."player_profiles" add constraint "player_profiles_pkey" PRIMARY KEY (player_id);
alter table "public"."player_profiles" add constraint "player_profiles_version_check" CHECK ((version > 0));
alter table "player_private"."registration_pair_links" add constraint "registration_pair_links_pair_id_key" UNIQUE (pair_id);
alter table "player_private"."registration_pair_links" add constraint "registration_pair_links_pkey" PRIMARY KEY (registration_id);
alter table "public"."global_admins" add constraint "global_admins_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."global_admins" add constraint "global_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "player_private"."registration_claim_codes" add constraint "registration_claim_codes_issued_by_fkey" FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "player_private"."registration_claim_codes" add constraint "registration_claim_codes_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES tournament_registrations(id) ON DELETE CASCADE;
alter table "public"."tournament_registrations" add constraint "tournament_registrations_partner_user_id_fkey" FOREIGN KEY (partner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."tournament_registrations" add constraint "tournament_registrations_status_changed_by_fkey" FOREIGN KEY (status_changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."tournament_registrations" add constraint "tournament_registrations_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."tournament_registrations" add constraint "tournament_registrations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."matches" add constraint "matches_next_match_id_fkey" FOREIGN KEY (next_match_id) REFERENCES matches(id) ON DELETE SET NULL;
alter table "public"."matches" add constraint "matches_pair_one_id_fkey" FOREIGN KEY (pair_one_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."matches" add constraint "matches_pair_two_id_fkey" FOREIGN KEY (pair_two_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."matches" add constraint "matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."matches" add constraint "matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."pairs" add constraint "pairs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."tournament_admins" add constraint "tournament_admins_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."tournament_admins" add constraint "tournament_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."tournament_groups" add constraint "tournament_groups_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."group_members" add constraint "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE CASCADE;
alter table "public"."group_members" add constraint "group_members_pair_id_fkey" FOREIGN KEY (pair_id) REFERENCES pairs(id) ON DELETE CASCADE;
alter table "public"."group_matches" add constraint "group_matches_group_id_fkey" FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE CASCADE;
alter table "public"."group_matches" add constraint "group_matches_pair_one_id_fkey" FOREIGN KEY (pair_one_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."group_matches" add constraint "group_matches_pair_two_id_fkey" FOREIGN KEY (pair_two_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."group_matches" add constraint "group_matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."group_matches" add constraint "group_matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES pairs(id) ON DELETE RESTRICT;
alter table "public"."match_result_history" add constraint "match_result_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."match_result_history" add constraint "match_result_history_match_id_fkey" FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table "public"."match_result_history" add constraint "match_result_history_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."activity_log" add constraint "activity_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "public"."activity_log" add constraint "activity_log_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
alter table "public"."player_profiles" add constraint "player_profiles_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "player_private"."registration_pair_links" add constraint "registration_pair_links_pair_id_tournament_id_fkey" FOREIGN KEY (pair_id, tournament_id) REFERENCES pairs(id, tournament_id) ON DELETE CASCADE;
alter table "player_private"."registration_pair_links" add constraint "registration_pair_links_registration_id_tournament_id_fkey" FOREIGN KEY (registration_id, tournament_id) REFERENCES tournament_registrations(id, tournament_id) ON DELETE CASCADE;
CREATE INDEX tournament_registrations_partner_user_idx ON public.tournament_registrations USING btree (partner_user_id, created_at DESC) WHERE (partner_user_id IS NOT NULL);
CREATE INDEX tournament_registrations_tournament_status_created_idx ON public.tournament_registrations USING btree (tournament_id, status, created_at DESC);
CREATE INDEX tournament_registrations_status_changed_by_idx ON public.tournament_registrations USING btree (status_changed_by) WHERE (status_changed_by IS NOT NULL);
CREATE INDEX tournament_registrations_submitted_by_created_idx ON public.tournament_registrations USING btree (submitted_by, created_at DESC) WHERE (submitted_by IS NOT NULL);
CREATE UNIQUE INDEX tournament_registrations_pair_contact_unique ON public.tournament_registrations USING btree (tournament_id, lower(btrim(player_one_email)), COALESCE(lower(btrim(player_two_email)), ''::text));
CREATE INDEX tournaments_sport_status_starts_idx ON public.tournaments USING btree (sport, status, starts_at);
CREATE INDEX matches_tournament_round_position_idx ON public.matches USING btree (tournament_id, round, "position");
CREATE INDEX matches_next_match_id_idx ON public.matches USING btree (next_match_id);
CREATE INDEX matches_pair_one_id_idx ON public.matches USING btree (pair_one_id);
CREATE INDEX matches_pair_two_id_idx ON public.matches USING btree (pair_two_id);
CREATE INDEX matches_winner_id_idx ON public.matches USING btree (winner_id);
CREATE INDEX pairs_tournament_id_idx ON public.pairs USING btree (tournament_id);
CREATE UNIQUE INDEX pairs_tournament_seed_unique ON public.pairs USING btree (tournament_id, seed) WHERE (seed IS NOT NULL);
CREATE INDEX tournament_admins_user_id_idx ON public.tournament_admins USING btree (user_id);
CREATE INDEX tournament_groups_tournament_idx ON public.tournament_groups USING btree (tournament_id, code);
CREATE INDEX group_members_group_idx ON public.group_members USING btree (group_id, "position");
CREATE INDEX group_matches_tournament_idx ON public.group_matches USING btree (tournament_id, group_id, "position");
CREATE INDEX group_matches_pair_one_idx ON public.group_matches USING btree (pair_one_id);
CREATE INDEX group_matches_pair_two_idx ON public.group_matches USING btree (pair_two_id);
CREATE INDEX group_matches_winner_idx ON public.group_matches USING btree (winner_id) WHERE (winner_id IS NOT NULL);
CREATE INDEX match_result_history_match_id_created_at_idx ON public.match_result_history USING btree (match_id, created_at DESC);
CREATE INDEX match_result_history_tournament_id_idx ON public.match_result_history USING btree (tournament_id);
CREATE INDEX match_result_history_changed_by_idx ON public.match_result_history USING btree (changed_by);
CREATE INDEX activity_log_tournament_created_idx ON public.activity_log USING btree (tournament_id, created_at DESC);
CREATE INDEX activity_log_changed_by_idx ON public.activity_log USING btree (changed_by);
CREATE INDEX registration_pair_links_tournament_idx ON player_private.registration_pair_links USING btree (tournament_id);
alter table "public"."global_admins" enable row level security;
alter table "public"."tournament_registrations" enable row level security;
alter table "public"."tournaments" enable row level security;
alter table "public"."matches" enable row level security;
alter table "public"."pairs" enable row level security;
alter table "public"."tournament_admins" enable row level security;
alter table "public"."tournament_groups" enable row level security;
alter table "public"."group_members" enable row level security;
alter table "public"."group_matches" enable row level security;
alter table "public"."match_result_history" enable row level security;
alter table "public"."activity_log" enable row level security;
alter table "public"."player_profiles" enable row level security;
alter table "player_private"."registration_pair_links" enable row level security;
create policy "Partners read own linked registrations" on "public"."tournament_registrations" as PERMISSIVE for SELECT to "authenticated" using (((partner_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Public tournaments are readable" on "public"."tournaments" as PERMISSIVE for SELECT to "anon" using ((status <> 'draft'::text));
create policy "Authenticated users see public or managed tournaments" on "public"."tournaments" as PERMISSIVE for SELECT to "authenticated" using (((status <> 'draft'::text) OR ( SELECT is_tournament_admin(tournaments.id) AS is_tournament_admin)));
create policy "Tournament admins update tournaments" on "public"."tournaments" as PERMISSIVE for UPDATE to "authenticated" using (( SELECT is_tournament_admin(tournaments.id) AS is_tournament_admin)) with check (( SELECT is_tournament_admin(tournaments.id) AS is_tournament_admin));
create policy "Users read own tournament memberships" on "public"."tournament_admins" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_tournament_owner(tournament_admins.tournament_id) AS is_tournament_owner)));
create policy "Public pairs are readable" on "public"."pairs" as PERMISSIVE for SELECT to "anon" using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = pairs.tournament_id) AND (t.status <> 'draft'::text)))));
create policy "Authenticated users see public or managed pairs" on "public"."pairs" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT is_tournament_admin(pairs.tournament_id) AS is_tournament_admin) OR (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = pairs.tournament_id) AND (t.status <> 'draft'::text))))));
create policy "Tournament admins update pairs" on "public"."pairs" as PERMISSIVE for UPDATE to "authenticated" using (( SELECT is_tournament_admin(pairs.tournament_id) AS is_tournament_admin)) with check (( SELECT is_tournament_admin(pairs.tournament_id) AS is_tournament_admin));
create policy "Public matches are readable" on "public"."matches" as PERMISSIVE for SELECT to "anon" using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = matches.tournament_id) AND (t.status <> 'draft'::text)))));
create policy "Authenticated users see public or managed matches" on "public"."matches" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT is_tournament_admin(matches.tournament_id) AS is_tournament_admin) OR (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = matches.tournament_id) AND (t.status <> 'draft'::text))))));
create policy "Tournament admins update matches" on "public"."matches" as PERMISSIVE for UPDATE to "authenticated" using (( SELECT is_tournament_admin(matches.tournament_id) AS is_tournament_admin)) with check (( SELECT is_tournament_admin(matches.tournament_id) AS is_tournament_admin));
create policy "Tournament admins read result history" on "public"."match_result_history" as PERMISSIVE for SELECT to "authenticated" using (( SELECT is_tournament_admin(match_result_history.tournament_id) AS is_tournament_admin));
create policy "Tournament admins read activity" on "public"."activity_log" as PERMISSIVE for SELECT to "authenticated" using (( SELECT is_tournament_admin(activity_log.tournament_id) AS is_tournament_admin));
create policy "Public submits registrations for available tournaments" on "public"."tournament_registrations" as PERMISSIVE for INSERT to "anon","authenticated" with check ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_registrations.tournament_id) AND (t.status = ANY (ARRAY['published'::text, 'live'::text])) AND (((t.registration_status = 'open'::text) AND (tournament_registrations.status = 'new'::text)) OR ((t.registration_status = 'waitlist'::text) AND (tournament_registrations.status = 'waitlist'::text)))))));
create policy "Tournament admins read registrations" on "public"."tournament_registrations" as PERMISSIVE for SELECT to "authenticated" using (( SELECT is_tournament_admin(tournament_registrations.tournament_id) AS is_tournament_admin));
create policy "Tournament admins update registrations" on "public"."tournament_registrations" as PERMISSIVE for UPDATE to "authenticated" using (( SELECT is_tournament_admin(tournament_registrations.tournament_id) AS is_tournament_admin)) with check (( SELECT is_tournament_admin(tournament_registrations.tournament_id) AS is_tournament_admin));
create policy "Public tournament groups are readable" on "public"."tournament_groups" as PERMISSIVE for SELECT to "anon" using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_groups.tournament_id) AND (t.status <> 'draft'::text)))));
create policy "Authenticated users see public or managed tournament groups" on "public"."tournament_groups" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT is_tournament_admin(tournament_groups.tournament_id) AS is_tournament_admin) OR (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_groups.tournament_id) AND (t.status <> 'draft'::text))))));
create policy "Public group members are readable" on "public"."group_members" as PERMISSIVE for SELECT to "anon" using ((EXISTS ( SELECT 1
   FROM (tournament_groups g
     JOIN tournaments t ON ((t.id = g.tournament_id)))
  WHERE ((g.id = group_members.group_id) AND (t.status <> 'draft'::text)))));
create policy "Authenticated users see public or managed group members" on "public"."group_members" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (tournament_groups g
     JOIN tournaments t ON ((t.id = g.tournament_id)))
  WHERE ((g.id = group_members.group_id) AND (( SELECT is_tournament_admin(g.tournament_id) AS is_tournament_admin) OR (t.status <> 'draft'::text))))));
create policy "Public group matches are readable" on "public"."group_matches" as PERMISSIVE for SELECT to "anon" using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = group_matches.tournament_id) AND (t.status <> 'draft'::text)))));
create policy "Authenticated users see public or managed group matches" on "public"."group_matches" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT is_tournament_admin(group_matches.tournament_id) AS is_tournament_admin) OR (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = group_matches.tournament_id) AND (t.status <> 'draft'::text))))));
create policy "Tournament admins update group matches" on "public"."group_matches" as PERMISSIVE for UPDATE to "authenticated" using (( SELECT is_tournament_admin(group_matches.tournament_id) AS is_tournament_admin)) with check (( SELECT is_tournament_admin(group_matches.tournament_id) AS is_tournament_admin));
create policy "Players read their verified profile" on "public"."player_profiles" as PERMISSIVE for SELECT to "authenticated" using (((auth_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players create their verified profile" on "public"."player_profiles" as PERMISSIVE for INSERT to "authenticated" with check (((auth_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players edit their verified profile" on "public"."player_profiles" as PERMISSIVE for UPDATE to "authenticated" using (((auth_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user))) with check (((auth_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players read own submitted registrations" on "public"."tournament_registrations" as PERMISSIVE for SELECT to "authenticated" using (((submitted_by = ( SELECT auth.uid() AS uid)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players delete own avatars" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'player-avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players read own avatars" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'player-avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
create policy "Players upload own avatars" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'player-avatars'::text) AND (name ~ (('^'::text || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f-]{36}\.jpg$'::text)) AND ( SELECT player_private.is_verified_user() AS is_verified_user)));
grant SELECT on "public"."tournaments" to "anon";
grant SELECT on "public"."tournaments" to "authenticated";
grant UPDATE on "public"."tournaments" to "authenticated";
grant SELECT on "public"."matches" to "anon";
grant INSERT on "public"."matches" to "authenticated";
grant SELECT on "public"."matches" to "authenticated";
grant UPDATE on "public"."matches" to "authenticated";
grant DELETE on "public"."matches" to "authenticated";
grant SELECT on "public"."pairs" to "anon";
grant INSERT on "public"."pairs" to "authenticated";
grant SELECT on "public"."pairs" to "authenticated";
grant UPDATE on "public"."pairs" to "authenticated";
grant DELETE on "public"."pairs" to "authenticated";
grant SELECT on "public"."tournament_admins" to "authenticated";
grant SELECT on "public"."tournament_groups" to "anon";
grant TRUNCATE on "public"."tournament_groups" to "anon";
grant REFERENCES on "public"."tournament_groups" to "anon";
grant TRIGGER on "public"."tournament_groups" to "anon";
grant SELECT on "public"."tournament_groups" to "authenticated";
grant TRUNCATE on "public"."tournament_groups" to "authenticated";
grant REFERENCES on "public"."tournament_groups" to "authenticated";
grant TRIGGER on "public"."tournament_groups" to "authenticated";
grant SELECT on "public"."group_members" to "anon";
grant TRUNCATE on "public"."group_members" to "anon";
grant REFERENCES on "public"."group_members" to "anon";
grant TRIGGER on "public"."group_members" to "anon";
grant SELECT on "public"."group_members" to "authenticated";
grant TRUNCATE on "public"."group_members" to "authenticated";
grant REFERENCES on "public"."group_members" to "authenticated";
grant TRIGGER on "public"."group_members" to "authenticated";
grant SELECT on "public"."group_matches" to "anon";
grant UPDATE on "public"."group_matches" to "anon";
grant TRUNCATE on "public"."group_matches" to "anon";
grant REFERENCES on "public"."group_matches" to "anon";
grant TRIGGER on "public"."group_matches" to "anon";
grant SELECT on "public"."group_matches" to "authenticated";
grant UPDATE on "public"."group_matches" to "authenticated";
grant TRUNCATE on "public"."group_matches" to "authenticated";
grant REFERENCES on "public"."group_matches" to "authenticated";
grant TRIGGER on "public"."group_matches" to "authenticated";
grant INSERT on "public"."match_result_history" to "authenticated";
grant SELECT on "public"."match_result_history" to "authenticated";
grant SELECT on "public"."activity_log" to "anon";
grant TRUNCATE on "public"."activity_log" to "anon";
grant REFERENCES on "public"."activity_log" to "anon";
grant TRIGGER on "public"."activity_log" to "anon";
grant SELECT on "public"."activity_log" to "authenticated";
grant TRUNCATE on "public"."activity_log" to "authenticated";
grant REFERENCES on "public"."activity_log" to "authenticated";
grant TRIGGER on "public"."activity_log" to "authenticated";
grant SELECT on "public"."player_profiles" to "authenticated";
grant REFERENCES ("action") on "public"."activity_log" to "anon";
grant SELECT ("action") on "public"."activity_log" to "anon";
grant REFERENCES ("after_state") on "public"."activity_log" to "anon";
grant SELECT ("after_state") on "public"."activity_log" to "anon";
grant REFERENCES ("before_state") on "public"."activity_log" to "anon";
grant SELECT ("before_state") on "public"."activity_log" to "anon";
grant SELECT ("bracket_kind") on "public"."matches" to "anon";
grant SELECT ("bracket_size") on "public"."tournaments" to "anon";
grant REFERENCES ("changed_by") on "public"."activity_log" to "anon";
grant SELECT ("changed_by") on "public"."activity_log" to "anon";
grant REFERENCES ("code") on "public"."tournament_groups" to "anon";
grant SELECT ("code") on "public"."tournament_groups" to "anon";
grant INSERT ("comment") on "public"."tournament_registrations" to "anon";
grant REFERENCES ("completed_at") on "public"."group_matches" to "anon";
grant SELECT ("completed_at") on "public"."group_matches" to "anon";
grant UPDATE ("completed_at") on "public"."group_matches" to "anon";
grant SELECT ("completed_at") on "public"."matches" to "anon";
grant SELECT ("country_code") on "public"."pairs" to "anon";
grant REFERENCES ("court") on "public"."group_matches" to "anon";
grant SELECT ("court") on "public"."group_matches" to "anon";
grant UPDATE ("court") on "public"."group_matches" to "anon";
grant SELECT ("court") on "public"."matches" to "anon";
grant REFERENCES ("created_at") on "public"."activity_log" to "anon";
grant SELECT ("created_at") on "public"."activity_log" to "anon";
grant SELECT ("created_at") on "public"."matches" to "anon";
grant SELECT ("created_at") on "public"."pairs" to "anon";
grant REFERENCES ("created_at") on "public"."tournament_groups" to "anon";
grant SELECT ("created_at") on "public"."tournament_groups" to "anon";
grant SELECT ("created_at") on "public"."tournaments" to "anon";
grant SELECT ("ends_at") on "public"."tournaments" to "anon";
grant REFERENCES ("entity_id") on "public"."activity_log" to "anon";
grant SELECT ("entity_id") on "public"."activity_log" to "anon";
grant REFERENCES ("entity_type") on "public"."activity_log" to "anon";
grant SELECT ("entity_type") on "public"."activity_log" to "anon";
grant SELECT ("format") on "public"."tournaments" to "anon";
grant SELECT ("format_description") on "public"."tournaments" to "anon";
grant REFERENCES ("group_id") on "public"."group_matches" to "anon";
grant SELECT ("group_id") on "public"."group_matches" to "anon";
grant UPDATE ("group_id") on "public"."group_matches" to "anon";
grant REFERENCES ("group_id") on "public"."group_members" to "anon";
grant SELECT ("group_id") on "public"."group_members" to "anon";
grant REFERENCES ("id") on "public"."activity_log" to "anon";
grant SELECT ("id") on "public"."activity_log" to "anon";
grant REFERENCES ("id") on "public"."group_matches" to "anon";
grant SELECT ("id") on "public"."group_matches" to "anon";
grant UPDATE ("id") on "public"."group_matches" to "anon";
grant SELECT ("id") on "public"."matches" to "anon";
grant SELECT ("id") on "public"."pairs" to "anon";
grant REFERENCES ("id") on "public"."tournament_groups" to "anon";
grant SELECT ("id") on "public"."tournament_groups" to "anon";
grant SELECT ("id") on "public"."tournaments" to "anon";
grant INSERT ("landing_page") on "public"."tournament_registrations" to "anon";
grant INSERT ("locale") on "public"."tournament_registrations" to "anon";
grant SELECT ("location") on "public"."tournaments" to "anon";
grant INSERT ("marketing_opt_in") on "public"."tournament_registrations" to "anon";
grant SELECT ("name") on "public"."pairs" to "anon";
grant SELECT ("name") on "public"."tournaments" to "anon";
grant SELECT ("next_match_id") on "public"."matches" to "anon";
grant SELECT ("next_slot") on "public"."matches" to "anon";
grant REFERENCES ("pair_id") on "public"."group_members" to "anon";
grant SELECT ("pair_id") on "public"."group_members" to "anon";
grant INSERT ("pair_name") on "public"."tournament_registrations" to "anon";
grant REFERENCES ("pair_one_id") on "public"."group_matches" to "anon";
grant SELECT ("pair_one_id") on "public"."group_matches" to "anon";
grant UPDATE ("pair_one_id") on "public"."group_matches" to "anon";
grant SELECT ("pair_one_id") on "public"."matches" to "anon";
grant REFERENCES ("pair_one_sets") on "public"."group_matches" to "anon";
grant SELECT ("pair_one_sets") on "public"."group_matches" to "anon";
grant UPDATE ("pair_one_sets") on "public"."group_matches" to "anon";
grant SELECT ("pair_one_sets") on "public"."matches" to "anon";
grant REFERENCES ("pair_two_id") on "public"."group_matches" to "anon";
grant SELECT ("pair_two_id") on "public"."group_matches" to "anon";
grant UPDATE ("pair_two_id") on "public"."group_matches" to "anon";
grant SELECT ("pair_two_id") on "public"."matches" to "anon";
grant REFERENCES ("pair_two_sets") on "public"."group_matches" to "anon";
grant SELECT ("pair_two_sets") on "public"."group_matches" to "anon";
grant UPDATE ("pair_two_sets") on "public"."group_matches" to "anon";
grant SELECT ("pair_two_sets") on "public"."matches" to "anon";
grant SELECT ("participant_count") on "public"."tournaments" to "anon";
grant SELECT ("player_one") on "public"."pairs" to "anon";
grant INSERT ("player_one_email") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_first_name") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_last_name") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_level") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_messenger") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_phone") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_rating_system") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_one_rating_value") on "public"."tournament_registrations" to "anon";
grant SELECT ("player_two") on "public"."pairs" to "anon";
grant INSERT ("player_two_email") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_first_name") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_last_name") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_level") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_messenger") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_phone") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_rating_system") on "public"."tournament_registrations" to "anon";
grant INSERT ("player_two_rating_value") on "public"."tournament_registrations" to "anon";
grant SELECT ("playoff_participant_count") on "public"."tournaments" to "anon";
grant REFERENCES ("position") on "public"."group_matches" to "anon";
grant SELECT ("position") on "public"."group_matches" to "anon";
grant UPDATE ("position") on "public"."group_matches" to "anon";
grant REFERENCES ("position") on "public"."group_members" to "anon";
grant SELECT ("position") on "public"."group_members" to "anon";
grant SELECT ("position") on "public"."matches" to "anon";
grant SELECT ("prize_pool") on "public"."tournaments" to "anon";
grant REFERENCES ("qualify_count") on "public"."tournament_groups" to "anon";
grant SELECT ("qualify_count") on "public"."tournament_groups" to "anon";
grant INSERT ("referrer") on "public"."tournament_registrations" to "anon";
grant SELECT ("registration_status") on "public"."tournaments" to "anon";
grant SELECT ("round") on "public"."matches" to "anon";
grant REFERENCES ("scheduled_at") on "public"."group_matches" to "anon";
grant SELECT ("scheduled_at") on "public"."group_matches" to "anon";
grant UPDATE ("scheduled_at") on "public"."group_matches" to "anon";
grant SELECT ("scheduled_at") on "public"."matches" to "anon";
grant SELECT ("seed") on "public"."pairs" to "anon";
grant SELECT ("slug") on "public"."tournaments" to "anon";
grant SELECT ("sport") on "public"."tournaments" to "anon";
grant SELECT ("starts_at") on "public"."tournaments" to "anon";
grant REFERENCES ("status") on "public"."group_matches" to "anon";
grant SELECT ("status") on "public"."group_matches" to "anon";
grant UPDATE ("status") on "public"."group_matches" to "anon";
grant SELECT ("status") on "public"."matches" to "anon";
grant SELECT ("status") on "public"."tournaments" to "anon";
grant REFERENCES ("tournament_id") on "public"."activity_log" to "anon";
grant SELECT ("tournament_id") on "public"."activity_log" to "anon";
grant REFERENCES ("tournament_id") on "public"."group_matches" to "anon";
grant SELECT ("tournament_id") on "public"."group_matches" to "anon";
grant UPDATE ("tournament_id") on "public"."group_matches" to "anon";
grant SELECT ("tournament_id") on "public"."matches" to "anon";
grant SELECT ("tournament_id") on "public"."pairs" to "anon";
grant REFERENCES ("tournament_id") on "public"."tournament_groups" to "anon";
grant SELECT ("tournament_id") on "public"."tournament_groups" to "anon";
grant INSERT ("tournament_id") on "public"."tournament_registrations" to "anon";
grant REFERENCES ("updated_at") on "public"."group_matches" to "anon";
grant SELECT ("updated_at") on "public"."group_matches" to "anon";
grant UPDATE ("updated_at") on "public"."group_matches" to "anon";
grant SELECT ("updated_at") on "public"."matches" to "anon";
grant SELECT ("updated_at") on "public"."pairs" to "anon";
grant SELECT ("updated_at") on "public"."tournaments" to "anon";
grant INSERT ("utm_campaign") on "public"."tournament_registrations" to "anon";
grant INSERT ("utm_content") on "public"."tournament_registrations" to "anon";
grant INSERT ("utm_medium") on "public"."tournament_registrations" to "anon";
grant INSERT ("utm_source") on "public"."tournament_registrations" to "anon";
grant INSERT ("utm_term") on "public"."tournament_registrations" to "anon";
grant REFERENCES ("winner_id") on "public"."group_matches" to "anon";
grant SELECT ("winner_id") on "public"."group_matches" to "anon";
grant UPDATE ("winner_id") on "public"."group_matches" to "anon";
grant SELECT ("winner_id") on "public"."matches" to "anon";
grant REFERENCES ("action") on "public"."activity_log" to "authenticated";
grant SELECT ("action") on "public"."activity_log" to "authenticated";
grant UPDATE ("admin_notes") on "public"."tournament_registrations" to "authenticated";
grant REFERENCES ("after_state") on "public"."activity_log" to "authenticated";
grant SELECT ("after_state") on "public"."activity_log" to "authenticated";
grant INSERT ("auth_user_id") on "public"."player_profiles" to "authenticated";
grant SELECT ("auth_user_id") on "public"."player_profiles" to "authenticated";
grant SELECT ("avatar_path") on "public"."player_profiles" to "authenticated";
grant UPDATE ("avatar_path") on "public"."player_profiles" to "authenticated";
grant REFERENCES ("before_state") on "public"."activity_log" to "authenticated";
grant SELECT ("before_state") on "public"."activity_log" to "authenticated";
grant INSERT ("bracket_kind") on "public"."matches" to "authenticated";
grant SELECT ("bracket_kind") on "public"."matches" to "authenticated";
grant UPDATE ("bracket_kind") on "public"."matches" to "authenticated";
grant SELECT ("bracket_size") on "public"."tournaments" to "authenticated";
grant UPDATE ("bracket_size") on "public"."tournaments" to "authenticated";
grant REFERENCES ("changed_by") on "public"."activity_log" to "authenticated";
grant SELECT ("changed_by") on "public"."activity_log" to "authenticated";
grant INSERT ("changed_by") on "public"."match_result_history" to "authenticated";
grant SELECT ("changed_by") on "public"."match_result_history" to "authenticated";
grant REFERENCES ("code") on "public"."tournament_groups" to "authenticated";
grant SELECT ("code") on "public"."tournament_groups" to "authenticated";
grant INSERT ("comment") on "public"."tournament_registrations" to "authenticated";
grant REFERENCES ("completed_at") on "public"."group_matches" to "authenticated";
grant SELECT ("completed_at") on "public"."group_matches" to "authenticated";
grant UPDATE ("completed_at") on "public"."group_matches" to "authenticated";
grant INSERT ("completed_at") on "public"."matches" to "authenticated";
grant SELECT ("completed_at") on "public"."matches" to "authenticated";
grant UPDATE ("completed_at") on "public"."matches" to "authenticated";
grant INSERT ("country_code") on "public"."pairs" to "authenticated";
grant SELECT ("country_code") on "public"."pairs" to "authenticated";
grant UPDATE ("country_code") on "public"."pairs" to "authenticated";
grant REFERENCES ("court") on "public"."group_matches" to "authenticated";
grant SELECT ("court") on "public"."group_matches" to "authenticated";
grant UPDATE ("court") on "public"."group_matches" to "authenticated";
grant INSERT ("court") on "public"."matches" to "authenticated";
grant SELECT ("court") on "public"."matches" to "authenticated";
grant UPDATE ("court") on "public"."matches" to "authenticated";
grant REFERENCES ("created_at") on "public"."activity_log" to "authenticated";
grant SELECT ("created_at") on "public"."activity_log" to "authenticated";
grant INSERT ("created_at") on "public"."match_result_history" to "authenticated";
grant SELECT ("created_at") on "public"."match_result_history" to "authenticated";
grant INSERT ("created_at") on "public"."matches" to "authenticated";
grant SELECT ("created_at") on "public"."matches" to "authenticated";
grant UPDATE ("created_at") on "public"."matches" to "authenticated";
grant INSERT ("created_at") on "public"."pairs" to "authenticated";
grant SELECT ("created_at") on "public"."pairs" to "authenticated";
grant UPDATE ("created_at") on "public"."pairs" to "authenticated";
grant SELECT ("created_at") on "public"."player_profiles" to "authenticated";
grant SELECT ("created_at") on "public"."tournament_admins" to "authenticated";
grant REFERENCES ("created_at") on "public"."tournament_groups" to "authenticated";
grant SELECT ("created_at") on "public"."tournament_groups" to "authenticated";
grant SELECT ("created_at") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("created_at") on "public"."tournaments" to "authenticated";
grant UPDATE ("created_at") on "public"."tournaments" to "authenticated";
grant INSERT ("display_name") on "public"."player_profiles" to "authenticated";
grant SELECT ("display_name") on "public"."player_profiles" to "authenticated";
grant UPDATE ("display_name") on "public"."player_profiles" to "authenticated";
grant SELECT ("ends_at") on "public"."tournaments" to "authenticated";
grant UPDATE ("ends_at") on "public"."tournaments" to "authenticated";
grant REFERENCES ("entity_id") on "public"."activity_log" to "authenticated";
grant SELECT ("entity_id") on "public"."activity_log" to "authenticated";
grant REFERENCES ("entity_type") on "public"."activity_log" to "authenticated";
grant SELECT ("entity_type") on "public"."activity_log" to "authenticated";
grant SELECT ("format") on "public"."tournaments" to "authenticated";
grant UPDATE ("format") on "public"."tournaments" to "authenticated";
grant SELECT ("format_description") on "public"."tournaments" to "authenticated";
grant UPDATE ("format_description") on "public"."tournaments" to "authenticated";
grant REFERENCES ("group_id") on "public"."group_matches" to "authenticated";
grant SELECT ("group_id") on "public"."group_matches" to "authenticated";
grant UPDATE ("group_id") on "public"."group_matches" to "authenticated";
grant REFERENCES ("group_id") on "public"."group_members" to "authenticated";
grant SELECT ("group_id") on "public"."group_members" to "authenticated";
grant REFERENCES ("id") on "public"."activity_log" to "authenticated";
grant SELECT ("id") on "public"."activity_log" to "authenticated";
grant REFERENCES ("id") on "public"."group_matches" to "authenticated";
grant SELECT ("id") on "public"."group_matches" to "authenticated";
grant UPDATE ("id") on "public"."group_matches" to "authenticated";
grant INSERT ("id") on "public"."match_result_history" to "authenticated";
grant SELECT ("id") on "public"."match_result_history" to "authenticated";
grant INSERT ("id") on "public"."matches" to "authenticated";
grant SELECT ("id") on "public"."matches" to "authenticated";
grant UPDATE ("id") on "public"."matches" to "authenticated";
grant INSERT ("id") on "public"."pairs" to "authenticated";
grant SELECT ("id") on "public"."pairs" to "authenticated";
grant UPDATE ("id") on "public"."pairs" to "authenticated";
grant REFERENCES ("id") on "public"."tournament_groups" to "authenticated";
grant SELECT ("id") on "public"."tournament_groups" to "authenticated";
grant SELECT ("id") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("id") on "public"."tournaments" to "authenticated";
grant UPDATE ("id") on "public"."tournaments" to "authenticated";
grant INSERT ("landing_page") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("locale") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("location") on "public"."tournaments" to "authenticated";
grant UPDATE ("location") on "public"."tournaments" to "authenticated";
grant INSERT ("marketing_opt_in") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("match_id") on "public"."match_result_history" to "authenticated";
grant SELECT ("match_id") on "public"."match_result_history" to "authenticated";
grant INSERT ("name") on "public"."pairs" to "authenticated";
grant SELECT ("name") on "public"."pairs" to "authenticated";
grant UPDATE ("name") on "public"."pairs" to "authenticated";
grant SELECT ("name") on "public"."tournaments" to "authenticated";
grant UPDATE ("name") on "public"."tournaments" to "authenticated";
grant INSERT ("new_state") on "public"."match_result_history" to "authenticated";
grant SELECT ("new_state") on "public"."match_result_history" to "authenticated";
grant INSERT ("next_match_id") on "public"."matches" to "authenticated";
grant SELECT ("next_match_id") on "public"."matches" to "authenticated";
grant UPDATE ("next_match_id") on "public"."matches" to "authenticated";
grant INSERT ("next_slot") on "public"."matches" to "authenticated";
grant SELECT ("next_slot") on "public"."matches" to "authenticated";
grant UPDATE ("next_slot") on "public"."matches" to "authenticated";
grant REFERENCES ("pair_id") on "public"."group_members" to "authenticated";
grant SELECT ("pair_id") on "public"."group_members" to "authenticated";
grant INSERT ("pair_name") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("pair_name") on "public"."tournament_registrations" to "authenticated";
grant REFERENCES ("pair_one_id") on "public"."group_matches" to "authenticated";
grant SELECT ("pair_one_id") on "public"."group_matches" to "authenticated";
grant UPDATE ("pair_one_id") on "public"."group_matches" to "authenticated";
grant INSERT ("pair_one_id") on "public"."matches" to "authenticated";
grant SELECT ("pair_one_id") on "public"."matches" to "authenticated";
grant UPDATE ("pair_one_id") on "public"."matches" to "authenticated";
grant REFERENCES ("pair_one_sets") on "public"."group_matches" to "authenticated";
grant SELECT ("pair_one_sets") on "public"."group_matches" to "authenticated";
grant UPDATE ("pair_one_sets") on "public"."group_matches" to "authenticated";
grant INSERT ("pair_one_sets") on "public"."matches" to "authenticated";
grant SELECT ("pair_one_sets") on "public"."matches" to "authenticated";
grant UPDATE ("pair_one_sets") on "public"."matches" to "authenticated";
grant REFERENCES ("pair_two_id") on "public"."group_matches" to "authenticated";
grant SELECT ("pair_two_id") on "public"."group_matches" to "authenticated";
grant UPDATE ("pair_two_id") on "public"."group_matches" to "authenticated";
grant INSERT ("pair_two_id") on "public"."matches" to "authenticated";
grant SELECT ("pair_two_id") on "public"."matches" to "authenticated";
grant UPDATE ("pair_two_id") on "public"."matches" to "authenticated";
grant REFERENCES ("pair_two_sets") on "public"."group_matches" to "authenticated";
grant SELECT ("pair_two_sets") on "public"."group_matches" to "authenticated";
grant UPDATE ("pair_two_sets") on "public"."group_matches" to "authenticated";
grant INSERT ("pair_two_sets") on "public"."matches" to "authenticated";
grant SELECT ("pair_two_sets") on "public"."matches" to "authenticated";
grant UPDATE ("pair_two_sets") on "public"."matches" to "authenticated";
grant SELECT ("participant_count") on "public"."tournaments" to "authenticated";
grant UPDATE ("participant_count") on "public"."tournaments" to "authenticated";
grant SELECT ("partner_user_id") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("player_id") on "public"."player_profiles" to "authenticated";
grant INSERT ("player_one") on "public"."pairs" to "authenticated";
grant SELECT ("player_one") on "public"."pairs" to "authenticated";
grant UPDATE ("player_one") on "public"."pairs" to "authenticated";
grant INSERT ("player_one_email") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_first_name") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_last_name") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_level") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_messenger") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_phone") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_rating_system") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_one_rating_value") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two") on "public"."pairs" to "authenticated";
grant SELECT ("player_two") on "public"."pairs" to "authenticated";
grant UPDATE ("player_two") on "public"."pairs" to "authenticated";
grant INSERT ("player_two_email") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_first_name") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_last_name") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_level") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_messenger") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_phone") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_rating_system") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("player_two_rating_value") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("playoff_participant_count") on "public"."tournaments" to "authenticated";
grant UPDATE ("playoff_participant_count") on "public"."tournaments" to "authenticated";
grant REFERENCES ("position") on "public"."group_matches" to "authenticated";
grant SELECT ("position") on "public"."group_matches" to "authenticated";
grant UPDATE ("position") on "public"."group_matches" to "authenticated";
grant REFERENCES ("position") on "public"."group_members" to "authenticated";
grant SELECT ("position") on "public"."group_members" to "authenticated";
grant INSERT ("position") on "public"."matches" to "authenticated";
grant SELECT ("position") on "public"."matches" to "authenticated";
grant UPDATE ("position") on "public"."matches" to "authenticated";
grant INSERT ("previous_state") on "public"."match_result_history" to "authenticated";
grant SELECT ("previous_state") on "public"."match_result_history" to "authenticated";
grant SELECT ("prize_pool") on "public"."tournaments" to "authenticated";
grant UPDATE ("prize_pool") on "public"."tournaments" to "authenticated";
grant REFERENCES ("qualify_count") on "public"."tournament_groups" to "authenticated";
grant SELECT ("qualify_count") on "public"."tournament_groups" to "authenticated";
grant INSERT ("referrer") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("registration_status") on "public"."tournaments" to "authenticated";
grant UPDATE ("registration_status") on "public"."tournaments" to "authenticated";
grant SELECT ("role") on "public"."tournament_admins" to "authenticated";
grant INSERT ("round") on "public"."matches" to "authenticated";
grant SELECT ("round") on "public"."matches" to "authenticated";
grant UPDATE ("round") on "public"."matches" to "authenticated";
grant REFERENCES ("scheduled_at") on "public"."group_matches" to "authenticated";
grant SELECT ("scheduled_at") on "public"."group_matches" to "authenticated";
grant UPDATE ("scheduled_at") on "public"."group_matches" to "authenticated";
grant INSERT ("scheduled_at") on "public"."matches" to "authenticated";
grant SELECT ("scheduled_at") on "public"."matches" to "authenticated";
grant UPDATE ("scheduled_at") on "public"."matches" to "authenticated";
grant INSERT ("seed") on "public"."pairs" to "authenticated";
grant SELECT ("seed") on "public"."pairs" to "authenticated";
grant UPDATE ("seed") on "public"."pairs" to "authenticated";
grant SELECT ("slug") on "public"."tournaments" to "authenticated";
grant UPDATE ("slug") on "public"."tournaments" to "authenticated";
grant SELECT ("sport") on "public"."tournaments" to "authenticated";
grant UPDATE ("sport") on "public"."tournaments" to "authenticated";
grant SELECT ("starts_at") on "public"."tournaments" to "authenticated";
grant UPDATE ("starts_at") on "public"."tournaments" to "authenticated";
grant REFERENCES ("status") on "public"."group_matches" to "authenticated";
grant SELECT ("status") on "public"."group_matches" to "authenticated";
grant UPDATE ("status") on "public"."group_matches" to "authenticated";
grant INSERT ("status") on "public"."matches" to "authenticated";
grant SELECT ("status") on "public"."matches" to "authenticated";
grant UPDATE ("status") on "public"."matches" to "authenticated";
grant SELECT ("status") on "public"."tournament_registrations" to "authenticated";
grant UPDATE ("status") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("status") on "public"."tournaments" to "authenticated";
grant UPDATE ("status") on "public"."tournaments" to "authenticated";
grant SELECT ("submitted_by") on "public"."tournament_registrations" to "authenticated";
grant REFERENCES ("tournament_id") on "public"."activity_log" to "authenticated";
grant SELECT ("tournament_id") on "public"."activity_log" to "authenticated";
grant REFERENCES ("tournament_id") on "public"."group_matches" to "authenticated";
grant SELECT ("tournament_id") on "public"."group_matches" to "authenticated";
grant UPDATE ("tournament_id") on "public"."group_matches" to "authenticated";
grant INSERT ("tournament_id") on "public"."match_result_history" to "authenticated";
grant SELECT ("tournament_id") on "public"."match_result_history" to "authenticated";
grant INSERT ("tournament_id") on "public"."matches" to "authenticated";
grant SELECT ("tournament_id") on "public"."matches" to "authenticated";
grant UPDATE ("tournament_id") on "public"."matches" to "authenticated";
grant INSERT ("tournament_id") on "public"."pairs" to "authenticated";
grant SELECT ("tournament_id") on "public"."pairs" to "authenticated";
grant UPDATE ("tournament_id") on "public"."pairs" to "authenticated";
grant SELECT ("tournament_id") on "public"."tournament_admins" to "authenticated";
grant REFERENCES ("tournament_id") on "public"."tournament_groups" to "authenticated";
grant SELECT ("tournament_id") on "public"."tournament_groups" to "authenticated";
grant INSERT ("tournament_id") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("tournament_id") on "public"."tournament_registrations" to "authenticated";
grant REFERENCES ("updated_at") on "public"."group_matches" to "authenticated";
grant SELECT ("updated_at") on "public"."group_matches" to "authenticated";
grant UPDATE ("updated_at") on "public"."group_matches" to "authenticated";
grant INSERT ("updated_at") on "public"."matches" to "authenticated";
grant SELECT ("updated_at") on "public"."matches" to "authenticated";
grant UPDATE ("updated_at") on "public"."matches" to "authenticated";
grant INSERT ("updated_at") on "public"."pairs" to "authenticated";
grant SELECT ("updated_at") on "public"."pairs" to "authenticated";
grant UPDATE ("updated_at") on "public"."pairs" to "authenticated";
grant SELECT ("updated_at") on "public"."player_profiles" to "authenticated";
grant SELECT ("updated_at") on "public"."tournaments" to "authenticated";
grant UPDATE ("updated_at") on "public"."tournaments" to "authenticated";
grant SELECT ("user_id") on "public"."tournament_admins" to "authenticated";
grant INSERT ("utm_campaign") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("utm_content") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("utm_medium") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("utm_source") on "public"."tournament_registrations" to "authenticated";
grant INSERT ("utm_term") on "public"."tournament_registrations" to "authenticated";
grant SELECT ("version") on "public"."player_profiles" to "authenticated";
grant REFERENCES ("winner_id") on "public"."group_matches" to "authenticated";
grant SELECT ("winner_id") on "public"."group_matches" to "authenticated";
grant UPDATE ("winner_id") on "public"."group_matches" to "authenticated";
grant INSERT ("winner_id") on "public"."matches" to "authenticated";
grant SELECT ("winner_id") on "public"."matches" to "authenticated";
grant UPDATE ("winner_id") on "public"."matches" to "authenticated";
revoke all on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer, p_sport text) from public,anon,authenticated;
grant execute on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer, p_sport text) to authenticated;
grant execute on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer, p_sport text) to service_role;
revoke all on function "player_private"."assign_registration_owner"() from public,anon,authenticated;
revoke all on function "public"."set_updated_at"() from public,anon,authenticated;
grant execute on function "public"."set_updated_at"() to anon;
grant execute on function "public"."set_updated_at"() to authenticated;
grant execute on function "public"."set_updated_at"() to service_role;
grant execute on function "public"."set_updated_at"() to public;
revoke all on function "public"."list_tournament_admins"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."list_tournament_admins"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."list_tournament_admins"(p_tournament_id uuid) to service_role;
revoke all on function "public"."audit_tournament_change"() from public,anon,authenticated;
grant execute on function "public"."audit_tournament_change"() to service_role;
revoke all on function "public"."touch_pair_updated_at"() from public,anon,authenticated;
grant execute on function "public"."touch_pair_updated_at"() to anon;
grant execute on function "public"."touch_pair_updated_at"() to authenticated;
grant execute on function "public"."touch_pair_updated_at"() to service_role;
grant execute on function "public"."touch_pair_updated_at"() to public;
revoke all on function "public"."is_tournament_admin"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."is_tournament_admin"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."is_tournament_admin"(p_tournament_id uuid) to service_role;
revoke all on function "public"."is_tournament_owner"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."is_tournament_owner"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."is_tournament_owner"(p_tournament_id uuid) to service_role;
revoke all on function "public"."record_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) from public,anon,authenticated;
grant execute on function "public"."record_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) to authenticated;
grant execute on function "public"."record_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) to service_role;
revoke all on function "public"."set_manual_draw"(p_tournament_id uuid, p_pair_ids uuid[]) from public,anon,authenticated;
grant execute on function "public"."set_manual_draw"(p_tournament_id uuid, p_pair_ids uuid[]) to authenticated;
grant execute on function "public"."set_manual_draw"(p_tournament_id uuid, p_pair_ids uuid[]) to service_role;
revoke all on function "public"."add_tournament_admin_by_email"(p_tournament_id uuid, p_email text, p_role text) from public,anon,authenticated;
grant execute on function "public"."add_tournament_admin_by_email"(p_tournament_id uuid, p_email text, p_role text) to authenticated;
grant execute on function "public"."add_tournament_admin_by_email"(p_tournament_id uuid, p_email text, p_role text) to service_role;
revoke all on function "public"."remove_tournament_admin"(p_tournament_id uuid, p_user_id uuid) from public,anon,authenticated;
grant execute on function "public"."remove_tournament_admin"(p_tournament_id uuid, p_user_id uuid) to authenticated;
grant execute on function "public"."remove_tournament_admin"(p_tournament_id uuid, p_user_id uuid) to service_role;
revoke all on function "public"."prepare_tournament_registration"() from public,anon,authenticated;
grant execute on function "public"."prepare_tournament_registration"() to service_role;
revoke all on function "public"."is_global_superadmin"() from public,anon,authenticated;
grant execute on function "public"."is_global_superadmin"() to authenticated;
grant execute on function "public"."is_global_superadmin"() to service_role;
revoke all on function "public"."get_global_admin_access"() from public,anon,authenticated;
grant execute on function "public"."get_global_admin_access"() to authenticated;
grant execute on function "public"."get_global_admin_access"() to service_role;
revoke all on function "public"."reset_tournament_data"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."reset_tournament_data"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."reset_tournament_data"(p_tournament_id uuid) to service_role;
revoke all on function "public"."is_global_admin"() from public,anon,authenticated;
grant execute on function "public"."is_global_admin"() to authenticated;
grant execute on function "public"."is_global_admin"() to service_role;
revoke all on function "public"."request_global_admin_access"() from public,anon,authenticated;
grant execute on function "public"."request_global_admin_access"() to authenticated;
grant execute on function "public"."request_global_admin_access"() to service_role;
revoke all on function "public"."list_global_admin_requests"() from public,anon,authenticated;
grant execute on function "public"."list_global_admin_requests"() to authenticated;
grant execute on function "public"."list_global_admin_requests"() to service_role;
revoke all on function "public"."approve_global_admin"(p_user_id uuid) from public,anon,authenticated;
grant execute on function "public"."approve_global_admin"(p_user_id uuid) to authenticated;
grant execute on function "public"."approve_global_admin"(p_user_id uuid) to service_role;
revoke all on function "public"."list_managed_tournaments"() from public,anon,authenticated;
grant execute on function "public"."list_managed_tournaments"() to authenticated;
grant execute on function "public"."list_managed_tournaments"() to service_role;
revoke all on function "public"."delete_tournament"(p_tournament_id uuid, p_confirmation_name text) from public,anon,authenticated;
grant execute on function "public"."delete_tournament"(p_tournament_id uuid, p_confirmation_name text) to authenticated;
grant execute on function "public"."delete_tournament"(p_tournament_id uuid, p_confirmation_name text) to service_role;
revoke all on function "public"."rebuild_group_matches"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."rebuild_group_matches"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."rebuild_group_matches"(p_tournament_id uuid) to service_role;
revoke all on function "public"."configure_group_stage"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."configure_group_stage"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."configure_group_stage"(p_tournament_id uuid) to service_role;
revoke all on function "public"."set_group_assignments"(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[]) from public,anon,authenticated;
grant execute on function "public"."set_group_assignments"(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[]) to authenticated;
grant execute on function "public"."set_group_assignments"(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[]) to service_role;
revoke all on function "public"."reset_group_match_result"(p_match_id uuid) from public,anon,authenticated;
grant execute on function "public"."reset_group_match_result"(p_match_id uuid) to authenticated;
grant execute on function "public"."reset_group_match_result"(p_match_id uuid) to service_role;
revoke all on function "public"."confirm_group_qualifiers"(p_tournament_id uuid, p_pair_ids uuid[]) from public,anon,authenticated;
grant execute on function "public"."confirm_group_qualifiers"(p_tournament_id uuid, p_pair_ids uuid[]) to authenticated;
grant execute on function "public"."confirm_group_qualifiers"(p_tournament_id uuid, p_pair_ids uuid[]) to service_role;
revoke all on function "public"."record_group_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) from public,anon,authenticated;
grant execute on function "public"."record_group_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) to authenticated;
grant execute on function "public"."record_group_match_result"(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid) to service_role;
revoke all on function "public"."seed_announced_group_pairs"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."seed_announced_group_pairs"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."seed_announced_group_pairs"(p_tournament_id uuid) to service_role;
revoke all on function "public"."next_bracket_size"(p_count integer) from public,anon,authenticated;
grant execute on function "public"."next_bracket_size"(p_count integer) to service_role;
revoke all on function "public"."create_flexible_tournament"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_sport text, p_participant_count integer, p_format text, p_group_count integer, p_playoff_count integer) from public,anon,authenticated;
grant execute on function "public"."create_flexible_tournament"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_sport text, p_participant_count integer, p_format text, p_group_count integer, p_playoff_count integer) to authenticated;
grant execute on function "public"."create_flexible_tournament"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_sport text, p_participant_count integer, p_format text, p_group_count integer, p_playoff_count integer) to service_role;
revoke all on function "public"."rebuild_playoff_bracket"(p_tournament_id uuid, p_pair_ids uuid[]) from public,anon,authenticated;
grant execute on function "public"."rebuild_playoff_bracket"(p_tournament_id uuid, p_pair_ids uuid[]) to authenticated;
grant execute on function "public"."rebuild_playoff_bracket"(p_tournament_id uuid, p_pair_ids uuid[]) to service_role;
revoke all on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer) from public,anon,authenticated;
grant execute on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer) to authenticated;
grant execute on function "public"."create_tournament_with_bracket"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_bracket_size integer) to service_role;
revoke all on function "public"."create_tournament_setup"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_sport text, p_status text, p_format text, p_pairs jsonb, p_groups jsonb) from public,anon,authenticated;
grant execute on function "public"."create_tournament_setup"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_sport text, p_status text, p_format text, p_pairs jsonb, p_groups jsonb) to authenticated;
grant execute on function "public"."create_tournament_setup"(p_name text, p_slug text, p_location text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_sport text, p_status text, p_format text, p_pairs jsonb, p_groups jsonb) to service_role;
revoke all on function "public"."assert_result_score"(p_one uuid, p_two uuid, p_winner uuid, p_scores_one integer[], p_scores_two integer[]) from public,anon,authenticated;
grant execute on function "public"."assert_result_score"(p_one uuid, p_two uuid, p_winner uuid, p_scores_one integer[], p_scores_two integer[]) to authenticated;
grant execute on function "public"."assert_result_score"(p_one uuid, p_two uuid, p_winner uuid, p_scores_one integer[], p_scores_two integer[]) to service_role;
revoke all on function "public"."enforce_recorded_score"() from public,anon,authenticated;
grant execute on function "public"."enforce_recorded_score"() to anon;
grant execute on function "public"."enforce_recorded_score"() to authenticated;
grant execute on function "public"."enforce_recorded_score"() to service_role;
grant execute on function "public"."enforce_recorded_score"() to public;
revoke all on function "public"."reset_match_result"(p_match_id uuid) from public,anon,authenticated;
grant execute on function "public"."reset_match_result"(p_match_id uuid) to authenticated;
grant execute on function "public"."reset_match_result"(p_match_id uuid) to service_role;
revoke all on function "public"."build_knockout_stage"(p_tournament_id uuid, p_pair_ids uuid[], p_kind text) from public,anon,authenticated;
grant execute on function "public"."build_knockout_stage"(p_tournament_id uuid, p_pair_ids uuid[], p_kind text) to service_role;
revoke all on function "public"."create_basement_bracket"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."create_basement_bracket"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."create_basement_bracket"(p_tournament_id uuid) to service_role;
revoke all on function "player_private"."version_profile"() from public,anon,authenticated;
revoke all on function "player_private"."is_verified_user"() from public,anon,authenticated;
grant execute on function "player_private"."is_verified_user"() to authenticated;
revoke all on function "public"."redeem_registration_claim_code"(p_code text) from public,anon,authenticated;
grant execute on function "public"."redeem_registration_claim_code"(p_code text) to authenticated;
grant execute on function "public"."redeem_registration_claim_code"(p_code text) to service_role;
revoke all on function "public"."list_tournament_registrations"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."list_tournament_registrations"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."list_tournament_registrations"(p_tournament_id uuid) to service_role;
revoke all on function "public"."issue_registration_claim_code"(p_registration_id uuid, p_player_role text) from public,anon,authenticated;
grant execute on function "public"."issue_registration_claim_code"(p_registration_id uuid, p_player_role text) to authenticated;
grant execute on function "public"."issue_registration_claim_code"(p_registration_id uuid, p_player_role text) to service_role;
revoke all on function "public"."link_registration_pair"(p_registration_id uuid, p_pair_id uuid) from public,anon,authenticated;
grant execute on function "public"."link_registration_pair"(p_registration_id uuid, p_pair_id uuid) to authenticated;
grant execute on function "public"."link_registration_pair"(p_registration_id uuid, p_pair_id uuid) to service_role;
revoke all on function "public"."get_registration_pair_links"(p_tournament_id uuid) from public,anon,authenticated;
grant execute on function "public"."get_registration_pair_links"(p_tournament_id uuid) to authenticated;
grant execute on function "public"."get_registration_pair_links"(p_tournament_id uuid) to service_role;
revoke all on function "public"."get_my_match_history"() from public,anon,authenticated;
grant execute on function "public"."get_my_match_history"() to authenticated;
grant execute on function "public"."get_my_match_history"() to service_role;
CREATE TRIGGER tournaments_set_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_tournament_update AFTER UPDATE ON public.tournaments FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION audit_tournament_change();
CREATE TRIGGER audit_pair_update AFTER UPDATE ON public.pairs FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION audit_tournament_change();
CREATE TRIGGER audit_match_update AFTER UPDATE ON public.matches FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION audit_tournament_change();
CREATE TRIGGER touch_pairs_updated_at BEFORE UPDATE ON public.pairs FOR EACH ROW EXECUTE FUNCTION touch_pair_updated_at();
CREATE TRIGGER prepare_tournament_registration BEFORE INSERT OR UPDATE ON public.tournament_registrations FOR EACH ROW EXECUTE FUNCTION prepare_tournament_registration();
CREATE TRIGGER validate_completed_match BEFORE INSERT OR UPDATE OF status, winner_id, pair_one_sets, pair_two_sets ON public.matches FOR EACH ROW EXECUTE FUNCTION enforce_recorded_score();
CREATE TRIGGER validate_completed_group_match BEFORE INSERT OR UPDATE OF status, winner_id, pair_one_sets, pair_two_sets ON public.group_matches FOR EACH ROW EXECUTE FUNCTION enforce_recorded_score();
CREATE TRIGGER version_player_profile BEFORE UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION player_private.version_profile();
CREATE TRIGGER assign_registration_owner BEFORE INSERT ON public.tournament_registrations FOR EACH ROW EXECUTE FUNCTION player_private.assign_registration_owner();
grant usage,select on all sequences in schema public to authenticated;
