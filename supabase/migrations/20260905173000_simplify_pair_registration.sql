alter table public.tournament_registrations
  alter column player_two_email drop not null,
  alter column player_two_phone drop not null;

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_distinct_emails_check;

drop index if exists public.tournament_registrations_pair_emails_unique;

create unique index tournament_registrations_pair_contact_unique
  on public.tournament_registrations (
    tournament_id,
    lower(btrim(player_one_email)),
    coalesce(lower(btrim(player_two_email)), '')
  );
