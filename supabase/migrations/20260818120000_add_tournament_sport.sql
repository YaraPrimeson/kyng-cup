alter table public.tournaments
  add column if not exists sport text not null default 'tennis';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_sport_check'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_sport_check
      check (sport in ('tennis', 'padel'));
  end if;
end
$$;

create index if not exists tournaments_sport_status_starts_idx
  on public.tournaments (sport, status, starts_at);

create or replace function public.create_tournament_with_bracket(
  p_name text,
  p_slug text,
  p_location text,
  p_starts_at timestamptz,
  p_bracket_size integer,
  p_sport text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke all on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer, text) from public, anon;
grant execute on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer, text) to authenticated;
