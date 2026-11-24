create schema gallery_internal;
revoke all on schema gallery_internal from public;
grant usage on schema gallery_internal to anon, authenticated;

-- The public projection can include an explicitly published album for a
-- draft tournament without allowing reads through the tournaments endpoint.
create function gallery_internal.published_album_cards()
returns table (
  id uuid, slug text, name text, sport text, location text, starts_at timestamptz,
  ends_at timestamptz, has_public_bracket boolean, cover_photo_id uuid
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.name, t.sport, t.location, t.starts_at, t.ends_at,
         t.status <> 'draft', g.cover_photo_id
  from public.tournament_galleries g
  join public.tournaments t on t.id = g.tournament_id
  where g.published_at is not null;
$$;

revoke all on function gallery_internal.published_album_cards() from public;
grant execute on function gallery_internal.published_album_cards() to anon, authenticated;

create or replace view public.published_tournament_albums
with (security_invoker = true, security_barrier = true) as
select id, slug, name, sport, location, starts_at, ends_at, has_public_bracket, cover_photo_id
from gallery_internal.published_album_cards();
