revoke all on function public.is_tournament_admin(uuid) from anon;
revoke all on function public.is_tournament_owner(uuid) from anon;

create index if not exists activity_log_changed_by_idx
  on public.activity_log (changed_by);
