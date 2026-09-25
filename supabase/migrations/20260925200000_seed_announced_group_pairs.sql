create or replace function public.seed_announced_group_pairs(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.seed_announced_group_pairs(uuid) from public, anon;
grant execute on function public.seed_announced_group_pairs(uuid) to authenticated;

-- If the group stage was already configured before this migration, seed the
-- announced Vienna 2026 lineup immediately. Otherwise the admin action calls
-- the same function after configuring the groups.
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
from announced, public.tournament_groups g, public.group_members gm, public.tournaments t
where t.slug = 'vienna-2026'
  and t.id = g.tournament_id
  and g.code = announced.group_code
  and gm.group_id = g.id
  and gm.position = announced.position
  and p.id = gm.pair_id;
