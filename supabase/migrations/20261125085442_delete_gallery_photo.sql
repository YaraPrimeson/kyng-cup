alter table public.tournament_gallery_photos
  drop constraint tournament_gallery_photos_state_check,
  add constraint tournament_gallery_photos_state_check
    check (state in ('pending', 'visible', 'hidden', 'deleting')),
  add column delete_lease_until timestamptz;

grant select on public.tournament_galleries to service_role;
grant update (cover_photo_id, published_at) on public.tournament_galleries to service_role;
grant update (delete_lease_until) on public.tournament_gallery_photos to service_role;
grant delete on public.tournament_gallery_photos to service_role;

create or replace function public.keep_pending_gallery_photo_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and (old.state = 'pending') <> (new.state = 'pending') then
    raise insufficient_privilege using message = 'Photo uploads must be verified before changing their visibility';
  end if;
  if current_user = 'authenticated' and (old.state = 'deleting') <> (new.state = 'deleting') then
    raise insufficient_privilege using message = 'Only the gallery service can change a photo deletion';
  end if;
  return new;
end;
$$;

create function public.prevent_deleting_gallery_cover()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.tournament_gallery_photos
    where tournament_id = new.tournament_id and id = new.cover_photo_id and state = 'deleting'
  ) then
    raise check_violation using message = 'A photo marked for deletion cannot be the album cover';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_deleting_gallery_cover() from public, anon, authenticated;
create trigger prevent_deleting_gallery_cover
before update of cover_photo_id on public.tournament_galleries
for each row execute function public.prevent_deleting_gallery_cover();

create function public.begin_gallery_photo_delete(p_tournament_id uuid, p_photo_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_cover uuid;
  replacement_cover uuid;
  photo_state text;
  lease_until timestamptz;
begin
  -- Serialize cover selection and claim a retryable storage deletion before making any R2 calls.
  select cover_photo_id into current_cover
  from public.tournament_galleries
  where tournament_id = p_tournament_id
  for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;

  select state, delete_lease_until into photo_state, lease_until
  from public.tournament_gallery_photos
  where tournament_id = p_tournament_id and id = p_photo_id
  for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if photo_state = 'pending' then return jsonb_build_object('status', 'pending'); end if;
  if lease_until > clock_timestamp() then return jsonb_build_object('status', 'busy'); end if;

  if current_cover = p_photo_id then
    select id into replacement_cover
    from public.tournament_gallery_photos
    where tournament_id = p_tournament_id and id <> p_photo_id and state = 'visible'
    order by sort_order, id limit 1 for update;

    update public.tournament_galleries
    set cover_photo_id = replacement_cover,
        published_at = case when replacement_cover is null then null else published_at end
    where tournament_id = p_tournament_id;
  end if;

  lease_until := clock_timestamp() + interval '1 minute';
  update public.tournament_gallery_photos set state = 'deleting', delete_lease_until = lease_until
  where tournament_id = p_tournament_id and id = p_photo_id;
  return jsonb_build_object('status', 'claimed', 'lease', lease_until);
end;
$$;

revoke all on function public.begin_gallery_photo_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_gallery_photo_delete(uuid, uuid) to service_role;
