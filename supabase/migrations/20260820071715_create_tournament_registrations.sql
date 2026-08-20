alter table public.tournaments
  add column if not exists registration_status text not null default 'open';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournaments_registration_status_check'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_registration_status_check
      check (registration_status in ('open', 'waitlist', 'closed'));
  end if;
end $$;

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'confirmed', 'waitlist', 'rejected')),
  pair_name text check (pair_name is null or char_length(pair_name) between 1 and 120),

  player_one_first_name text not null
    check (char_length(btrim(player_one_first_name)) between 1 and 80),
  player_one_last_name text not null
    check (char_length(btrim(player_one_last_name)) between 1 and 80),
  player_one_email text not null
    check (player_one_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  player_one_phone text not null
    check (char_length(btrim(player_one_phone)) between 5 and 40),
  player_one_messenger text
    check (player_one_messenger is null or char_length(player_one_messenger) <= 100),
  player_one_level text not null
    check (player_one_level in ('beginner', 'intermediate', 'advanced', 'competitive')),
  player_one_rating_system text
    check (player_one_rating_system is null or char_length(player_one_rating_system) <= 40),
  player_one_rating_value text
    check (player_one_rating_value is null or char_length(player_one_rating_value) <= 40),

  player_two_first_name text not null
    check (char_length(btrim(player_two_first_name)) between 1 and 80),
  player_two_last_name text not null
    check (char_length(btrim(player_two_last_name)) between 1 and 80),
  player_two_email text not null
    check (player_two_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  player_two_phone text not null
    check (char_length(btrim(player_two_phone)) between 5 and 40),
  player_two_messenger text
    check (player_two_messenger is null or char_length(player_two_messenger) <= 100),
  player_two_level text not null
    check (player_two_level in ('beginner', 'intermediate', 'advanced', 'competitive')),
  player_two_rating_system text
    check (player_two_rating_system is null or char_length(player_two_rating_system) <= 40),
  player_two_rating_value text
    check (player_two_rating_value is null or char_length(player_two_rating_value) <= 40),

  comment text check (comment is null or char_length(comment) <= 1000),
  locale text not null default 'en' check (locale in ('en', 'uk', 'de', 'ru')),
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz not null default now(),
  partner_consent_accepted_at timestamptz not null default now(),

  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournament_registrations_distinct_emails_check
    check (lower(btrim(player_one_email)) <> lower(btrim(player_two_email)))
);

create unique index tournament_registrations_pair_emails_unique
  on public.tournament_registrations (
    tournament_id,
    least(lower(btrim(player_one_email)), lower(btrim(player_two_email))),
    greatest(lower(btrim(player_one_email)), lower(btrim(player_two_email)))
  );

create index tournament_registrations_tournament_status_created_idx
  on public.tournament_registrations (tournament_id, status, created_at desc);

create index tournament_registrations_status_changed_by_idx
  on public.tournament_registrations (status_changed_by)
  where status_changed_by is not null;

create or replace function public.prepare_tournament_registration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke all on function public.prepare_tournament_registration() from public, anon, authenticated;

drop trigger if exists prepare_tournament_registration on public.tournament_registrations;
create trigger prepare_tournament_registration
before insert or update on public.tournament_registrations
for each row execute function public.prepare_tournament_registration();

alter table public.tournament_registrations enable row level security;

create policy "Public submits registrations for available tournaments"
on public.tournament_registrations for insert to anon, authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = public.tournament_registrations.tournament_id
      and t.status in ('published', 'live')
      and (
        (t.registration_status = 'open' and public.tournament_registrations.status = 'new')
        or (t.registration_status = 'waitlist' and public.tournament_registrations.status = 'waitlist')
      )
  )
);

create policy "Tournament admins read registrations"
on public.tournament_registrations for select to authenticated
using ((select public.is_tournament_admin(tournament_id)));

create policy "Tournament admins update registrations"
on public.tournament_registrations for update to authenticated
using ((select public.is_tournament_admin(tournament_id)))
with check ((select public.is_tournament_admin(tournament_id)));

revoke all on public.tournament_registrations from public, anon, authenticated;

grant insert (
  tournament_id, pair_name,
  player_one_first_name, player_one_last_name, player_one_email,
  player_one_phone, player_one_messenger, player_one_level,
  player_one_rating_system, player_one_rating_value,
  player_two_first_name, player_two_last_name, player_two_email,
  player_two_phone, player_two_messenger, player_two_level,
  player_two_rating_system, player_two_rating_value,
  comment, locale, marketing_opt_in
) on public.tournament_registrations to anon, authenticated;

grant select on public.tournament_registrations to authenticated;
grant update (status, admin_notes) on public.tournament_registrations to authenticated;
grant select, insert, update, delete on public.tournament_registrations to service_role;
