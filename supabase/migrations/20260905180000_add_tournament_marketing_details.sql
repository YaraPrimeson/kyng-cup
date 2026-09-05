alter table public.tournaments
  add column if not exists format_description text
    check (format_description is null or char_length(format_description) <= 160),
  add column if not exists prize_pool text
    check (prize_pool is null or char_length(prize_pool) <= 80);

update public.tournaments
set location = 'TopSpin, Vienna'
where slug in ('vienna-2026', 'vienna');

update public.tournaments
set format_description = 'Men''s Pro/Am',
    prize_pool = '€3,000'
where slug = 'vienna-2026';
