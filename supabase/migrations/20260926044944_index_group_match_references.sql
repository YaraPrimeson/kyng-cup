create index if not exists group_matches_pair_one_idx
  on public.group_matches (pair_one_id);

create index if not exists group_matches_pair_two_idx
  on public.group_matches (pair_two_id);

create index if not exists group_matches_winner_idx
  on public.group_matches (winner_id)
  where winner_id is not null;
