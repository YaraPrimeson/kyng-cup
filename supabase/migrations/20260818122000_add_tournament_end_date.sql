alter table public.tournaments
  add column if not exists ends_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_date_range_check'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_date_range_check
      check (ends_at is null or starts_at is null or ends_at >= starts_at);
  end if;
end
$$;
