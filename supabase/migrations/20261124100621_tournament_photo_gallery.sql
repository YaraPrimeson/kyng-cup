create table public.tournament_galleries (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  cover_photo_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  cover_required_state text generated always as (
    case when published_at is not null then 'visible' end
  ) stored,
  constraint published_gallery_has_cover check (published_at is null or cover_photo_id is not null)
);

create table public.tournament_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournament_galleries(tournament_id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  state text not null default 'pending' check (state in ('pending', 'visible', 'hidden')),
  created_at timestamptz not null default now(),
  unique (tournament_id, id),
  unique (tournament_id, id, state)
);

alter table public.tournament_galleries
  add constraint gallery_cover_belongs_to_tournament
    foreign key (tournament_id, cover_photo_id)
    references public.tournament_gallery_photos(tournament_id, id),
  add constraint published_gallery_cover_is_visible
    foreign key (tournament_id, cover_photo_id, cover_required_state)
    references public.tournament_gallery_photos(tournament_id, id, state);

create index tournament_gallery_photos_order_idx
  on public.tournament_gallery_photos (tournament_id, sort_order, id);

alter table public.tournament_galleries enable row level security;
alter table public.tournament_gallery_photos enable row level security;

revoke all on public.tournament_galleries, public.tournament_gallery_photos from public, anon, authenticated;
grant select on public.tournament_galleries, public.tournament_gallery_photos to anon, authenticated;
grant insert (tournament_id), update (cover_photo_id, published_at)
  on public.tournament_galleries to authenticated;
grant insert (id, tournament_id, sort_order), update (sort_order, state)
  on public.tournament_gallery_photos to authenticated;

create policy "Public reads published galleries"
on public.tournament_galleries for select to anon, authenticated
using (
  published_at is not null and exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status = 'completed'
  )
);

create policy "Organisers read galleries"
on public.tournament_galleries for select to authenticated
using ((select public.is_global_admin()));

create policy "Organisers create gallery drafts"
on public.tournament_galleries for insert to authenticated
with check ((select public.is_global_admin()));

create policy "Organisers edit galleries"
on public.tournament_galleries for update to authenticated
using ((select public.is_global_admin()))
with check ((select public.is_global_admin()));

create policy "Public reads visible photos of published galleries"
on public.tournament_gallery_photos for select to anon, authenticated
using (
  state = 'visible' and exists (
    select 1 from public.tournament_galleries gallery
    where gallery.tournament_id = tournament_gallery_photos.tournament_id
      and gallery.published_at is not null
  )
);

create policy "Organisers read all gallery photos"
on public.tournament_gallery_photos for select to authenticated
using ((select public.is_global_admin()));

create policy "Organisers register pending gallery photos"
on public.tournament_gallery_photos for insert to authenticated
with check ((select public.is_global_admin()));

create policy "Organisers edit gallery photos"
on public.tournament_gallery_photos for update to authenticated
using ((select public.is_global_admin()))
with check ((select public.is_global_admin()));

-- Only the upload finalizer can move a photo out of the pending state.
create function public.keep_pending_gallery_photo_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and (old.state = 'pending') <> (new.state = 'pending') then
    raise insufficient_privilege using message = 'Photo uploads must be verified before changing their visibility';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_pending_gallery_photo_state() from public, anon, authenticated;

create trigger keep_pending_gallery_photo_state
before update of state on public.tournament_gallery_photos
for each row execute function public.keep_pending_gallery_photo_state();

grant select on public.tournament_gallery_photos to service_role;
grant update (state) on public.tournament_gallery_photos to service_role;

create function public.public_gallery_photo_counts(p_tournament_ids uuid[])
returns table (tournament_id uuid, photo_count integer)
language sql stable security invoker set search_path = '' as $$
  select photo.tournament_id, count(*)::integer
  from public.tournament_gallery_photos photo
  join public.tournament_galleries gallery on gallery.tournament_id = photo.tournament_id
  join public.tournaments tournament on tournament.id = gallery.tournament_id
  where photo.tournament_id = any(p_tournament_ids)
    and photo.state = 'visible'
    and gallery.published_at is not null
    and tournament.status = 'completed'
  group by photo.tournament_id;
$$;

revoke all on function public.public_gallery_photo_counts(uuid[]) from public;
grant execute on function public.public_gallery_photo_counts(uuid[]) to anon, authenticated;
