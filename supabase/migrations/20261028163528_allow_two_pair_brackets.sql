-- The setup RPC and next_bracket_size() support 2..64 pairs, including a single final.
-- Keep the existing power-of-two restriction while allowing its missing lower bound.
alter table public.tournaments
  drop constraint tournaments_bracket_size_check;
alter table public.tournaments
  add constraint tournaments_bracket_size_check
  check (bracket_size in (2, 4, 8, 16, 32, 64));
