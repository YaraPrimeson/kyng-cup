-- Isolated test-only schema snapshot, not a production migration.
-- Auth/session helpers and baseline tables support the real SQL regression suite.
-- No participant data, credentials or network hooks are included.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema player_private;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,player_private to authenticated;
create table public.activity_log (id bigint generated always as identity, tournament_id uuid not null, entity_type text not null, entity_id uuid, action text not null, changed_by uuid, before_state jsonb, after_state jsonb, created_at timestamp with time zone not null default now());
create table public.global_admins (user_id uuid not null, role text not null default 'admin'::text, status text not null default 'pending'::text, requested_at timestamp with time zone not null default now(), approved_at timestamp with time zone, approved_by uuid);
create table public.group_matches (id uuid not null default gen_random_uuid(), tournament_id uuid not null, group_id uuid not null, "position" integer not null, pair_one_id uuid not null, pair_two_id uuid not null, pair_one_sets integer[] not null default '{}'::integer[], pair_two_sets integer[] not null default '{}'::integer[], winner_id uuid, status text not null default 'scheduled'::text, court text, scheduled_at timestamp with time zone, completed_at timestamp with time zone, updated_at timestamp with time zone not null default now());
create table public.match_result_history (id bigint not null, match_id uuid not null, tournament_id uuid not null, changed_by uuid, previous_state jsonb not null, new_state jsonb not null, created_at timestamp with time zone not null default now());
create table public.matches (id uuid not null default gen_random_uuid(), tournament_id uuid not null, round integer not null, "position" integer not null, pair_one_id uuid, pair_two_id uuid, pair_one_sets integer[] not null default '{}'::integer[], pair_two_sets integer[] not null default '{}'::integer[], winner_id uuid, status text not null default 'scheduled'::text, court text, scheduled_at timestamp with time zone, completed_at timestamp with time zone, next_match_id uuid, next_slot smallint, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), bracket_kind text not null default 'playoffs'::text);
create table public.pairs (id uuid not null default gen_random_uuid(), tournament_id uuid not null, name text not null, player_one text not null, player_two text not null, seed integer, country_code text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.tournament_groups (id uuid not null default gen_random_uuid(), tournament_id uuid not null, code text not null, qualify_count integer not null, created_at timestamp with time zone not null default now());
create table public.tournament_registrations (id uuid not null default gen_random_uuid(), tournament_id uuid not null, status text not null default 'new'::text, pair_name text, player_one_first_name text not null, player_one_last_name text not null, player_one_email text not null, player_one_phone text not null, player_one_messenger text, player_one_level text not null, player_one_rating_system text, player_one_rating_value text, player_two_first_name text not null, player_two_last_name text not null, player_two_email text, player_two_phone text, player_two_messenger text, player_two_level text not null, player_two_rating_system text, player_two_rating_value text, comment text, locale text not null default 'en'::text, marketing_opt_in boolean not null default false, terms_accepted_at timestamp with time zone not null default now(), partner_consent_accepted_at timestamp with time zone not null default now(), admin_notes text, status_changed_at timestamp with time zone, status_changed_by uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text, landing_page text, referrer text, submitted_by uuid, partner_user_id uuid);
create table public.tournaments (id uuid not null default gen_random_uuid(), slug text not null, name text not null, location text, starts_at timestamp with time zone, bracket_size integer not null default 16, status text not null default 'draft'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), sport text not null default 'tennis'::text, ends_at timestamp with time zone, registration_status text not null default 'open'::text, format_description text, prize_pool text, format text not null default 'knockout'::text, participant_count integer not null, playoff_participant_count integer not null);
alter table public.tournaments add CHECK ((bracket_size = ANY (ARRAY[2, 4, 8, 16, 32, 64])));
alter table public.tournaments add CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at)));
alter table public.tournaments add CHECK ((format = ANY (ARRAY['knockout'::text, 'group_knockout'::text])));
alter table public.tournaments add CHECK (((format_description IS NULL) OR (char_length(format_description) <= 160)));
alter table public.tournaments add CHECK (((participant_count >= 2) AND (participant_count <= 64)));
alter table public.tournaments add PRIMARY KEY (id);
alter table public.tournaments add CHECK ((((playoff_participant_count >= 2) AND (playoff_participant_count <= 64)) AND (playoff_participant_count <= participant_count)));
alter table public.tournaments add CHECK (((prize_pool IS NULL) OR (char_length(prize_pool) <= 80)));
alter table public.tournaments add CHECK ((registration_status = ANY (ARRAY['open'::text, 'waitlist'::text, 'closed'::text])));
alter table public.tournaments add CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
alter table public.tournaments add UNIQUE (slug);
alter table public.tournaments add CHECK ((sport = ANY (ARRAY['tennis'::text, 'padel'::text])));
alter table public.tournaments add CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'live'::text, 'completed'::text])));
alter table public.pairs add PRIMARY KEY (id);
alter table public.pairs add UNIQUE (tournament_id, seed);
alter table public.matches add CHECK ((bracket_kind = ANY (ARRAY['playoffs'::text, 'basement'::text])));
alter table public.matches add CHECK ((((next_match_id IS NULL) AND (next_slot IS NULL)) OR ((next_match_id IS NOT NULL) AND (next_slot IS NOT NULL))));
alter table public.matches add CHECK (((winner_id IS NULL) OR (winner_id = pair_one_id) OR (winner_id = pair_two_id)));
alter table public.matches add CHECK ((next_slot = ANY (ARRAY[1, 2])));
alter table public.matches add PRIMARY KEY (id);
alter table public.matches add CHECK (("position" > 0));
alter table public.matches add CHECK (((round >= 0) AND (round <= 6)));
alter table public.matches add CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text])));
alter table public.matches add UNIQUE (tournament_id, bracket_kind, round, "position");
alter table public.tournament_registrations add CHECK (((admin_notes IS NULL) OR (char_length(admin_notes) <= 2000)));
alter table public.tournament_registrations add CHECK (((comment IS NULL) OR (char_length(comment) <= 1000)));
alter table public.tournament_registrations add CHECK (((landing_page IS NULL) OR (char_length(landing_page) <= 2048)));
alter table public.tournament_registrations add CHECK ((locale = ANY (ARRAY['en'::text, 'uk'::text, 'de'::text, 'ru'::text])));
alter table public.tournament_registrations add CHECK (((pair_name IS NULL) OR ((char_length(pair_name) >= 1) AND (char_length(pair_name) <= 120))));
alter table public.tournament_registrations add PRIMARY KEY (id);
alter table public.tournament_registrations add CHECK ((player_one_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_one_first_name)) >= 1) AND (char_length(btrim(player_one_first_name)) <= 80)));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_one_last_name)) >= 1) AND (char_length(btrim(player_one_last_name)) <= 80)));
alter table public.tournament_registrations add CHECK ((player_one_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'competitive'::text])));
alter table public.tournament_registrations add CHECK (((player_one_messenger IS NULL) OR (char_length(player_one_messenger) <= 100)));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_one_phone)) >= 5) AND (char_length(btrim(player_one_phone)) <= 40)));
alter table public.tournament_registrations add CHECK (((player_one_rating_system IS NULL) OR (char_length(player_one_rating_system) <= 40)));
alter table public.tournament_registrations add CHECK (((player_one_rating_value IS NULL) OR (char_length(player_one_rating_value) <= 40)));
alter table public.tournament_registrations add CHECK ((player_two_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_two_first_name)) >= 1) AND (char_length(btrim(player_two_first_name)) <= 80)));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_two_last_name)) >= 1) AND (char_length(btrim(player_two_last_name)) <= 80)));
alter table public.tournament_registrations add CHECK ((player_two_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'competitive'::text])));
alter table public.tournament_registrations add CHECK (((player_two_messenger IS NULL) OR (char_length(player_two_messenger) <= 100)));
alter table public.tournament_registrations add CHECK (((char_length(btrim(player_two_phone)) >= 5) AND (char_length(btrim(player_two_phone)) <= 40)));
alter table public.tournament_registrations add CHECK (((player_two_rating_system IS NULL) OR (char_length(player_two_rating_system) <= 40)));
alter table public.tournament_registrations add CHECK (((player_two_rating_value IS NULL) OR (char_length(player_two_rating_value) <= 40)));
alter table public.tournament_registrations add CHECK (((referrer IS NULL) OR (char_length(referrer) <= 2048)));
alter table public.tournament_registrations add CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'confirmed'::text, 'waitlist'::text, 'rejected'::text])));
alter table public.tournament_registrations add CHECK (((utm_campaign IS NULL) OR (char_length(utm_campaign) <= 255)));
alter table public.tournament_registrations add CHECK (((utm_content IS NULL) OR (char_length(utm_content) <= 255)));
alter table public.tournament_registrations add CHECK (((utm_medium IS NULL) OR (char_length(utm_medium) <= 255)));
alter table public.tournament_registrations add CHECK (((utm_source IS NULL) OR (char_length(utm_source) <= 255)));
alter table public.tournament_registrations add CHECK (((utm_term IS NULL) OR (char_length(utm_term) <= 255)));
alter table public.global_admins add PRIMARY KEY (user_id);
alter table public.global_admins add CHECK ((role = ANY (ARRAY['superadmin'::text, 'admin'::text])));
alter table public.global_admins add CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'revoked'::text])));
alter table public.tournament_groups add CHECK ((code ~ '^[A-Z]$'::text));
alter table public.tournament_groups add PRIMARY KEY (id);
alter table public.tournament_groups add CHECK (((qualify_count >= 0) AND (qualify_count <= 64)));
alter table public.tournament_groups add UNIQUE (tournament_id, code);
alter table public.group_matches add CHECK ((pair_one_id <> pair_two_id));
alter table public.group_matches add CHECK (((winner_id IS NULL) OR ((winner_id = pair_one_id) OR (winner_id = pair_two_id))));
alter table public.group_matches add UNIQUE (group_id, "position");
alter table public.group_matches add PRIMARY KEY (id);
alter table public.group_matches add CHECK (("position" > 0));
alter table public.group_matches add CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text])));
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
$function$;

CREATE OR REPLACE FUNCTION public.is_tournament_admin(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select (select public.is_global_admin()); $function$;

CREATE OR REPLACE FUNCTION public.is_tournament_owner(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select (select public.is_global_admin()); $function$;

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
$function$;

create function player_private.is_verified_user() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.users where id=(select auth.uid()) and email_confirmed_at is not null and not coalesce(is_anonymous,false) and coalesce(banned_until,'-infinity')<now()) $$;
