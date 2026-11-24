create table if not exists public.tournament_gallery_photo_filenames (
  photo_id uuid primary key,
  tournament_id uuid not null,
  filename text not null check (char_length(filename) between 1 and 255),
  foreign key (tournament_id, photo_id)
    references public.tournament_gallery_photos (tournament_id, id) on delete cascade
);

create index if not exists tournament_gallery_photo_filenames_tournament_idx
  on public.tournament_gallery_photo_filenames (tournament_id, photo_id);

alter table public.tournament_gallery_photo_filenames enable row level security;
revoke all on public.tournament_gallery_photo_filenames from public, anon, authenticated;
grant select, insert on public.tournament_gallery_photo_filenames to authenticated;

drop policy if exists "Organisers read photo filenames" on public.tournament_gallery_photo_filenames;
create policy "Organisers read photo filenames"
  on public.tournament_gallery_photo_filenames for select to authenticated
  using ((select public.is_global_admin()));

drop policy if exists "Organisers register photo filenames" on public.tournament_gallery_photo_filenames;
create policy "Organisers register photo filenames"
  on public.tournament_gallery_photo_filenames for insert to authenticated
  with check ((select public.is_global_admin()));
