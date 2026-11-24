alter policy "Public reads published galleries"
on public.tournament_galleries
using (published_at is not null);

-- Publishing an album exposes the public card fields only. Tournament and
-- bracket access continue to follow the tournament's own visibility rules.
create view public.published_tournament_albums with (security_barrier = true) as
select t.id, t.slug, t.name, t.sport, t.location, t.starts_at, t.ends_at,
       t.status <> 'draft' as has_public_bracket, g.cover_photo_id
from public.tournament_galleries g
join public.tournaments t on t.id = g.tournament_id
where g.published_at is not null;

revoke all on public.published_tournament_albums from public, anon, authenticated;
grant select on public.published_tournament_albums to anon, authenticated;

create or replace function public.public_gallery_photo_counts(p_tournament_ids uuid[])
returns table (tournament_id uuid, photo_count integer)
language sql stable security invoker set search_path = '' as $$
  select photo.tournament_id, count(*)::integer
  from public.tournament_gallery_photos photo
  join public.tournament_galleries gallery on gallery.tournament_id = photo.tournament_id
  where photo.tournament_id = any(p_tournament_ids)
    and photo.state = 'visible'
    and gallery.published_at is not null
  group by photo.tournament_id;
$$;
