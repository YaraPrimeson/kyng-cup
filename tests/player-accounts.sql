-- Authentication, ownership and organiser regression checks. No test writes persist.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  player uuid;
  old_version integer;
  avatar text;
  admin_id uuid;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
  values (a, a::text || '@example.invalid', now(), '{"role":"superadmin"}'),
         (b, b::text || '@example.invalid', now(), '{}'),
         (pending, pending::text || '@example.invalid', null, '{}');
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  insert into public.player_profiles(auth_user_id, display_name) values (a, 'Первый игрок') returning player_id,version into player,old_version;
  if public.is_global_admin() then raise exception 'Editable metadata granted organiser access'; end if;
  if exists(select 1 from public.tournament_registrations) then raise exception 'Player can read private applications'; end if;
  begin
    insert into public.player_profiles(auth_user_id, display_name) values (b, 'Forged');
    raise exception 'Player can create another user profile';
  exception when insufficient_privilege then null; end;
  begin
    update public.player_profiles set auth_user_id=b where player_id=player;
    raise exception 'Player can change profile owner';
  exception when insufficient_privilege then null; end;
  begin
    update public.player_profiles set player_id=gen_random_uuid() where auth_user_id=a;
    raise exception 'Player can change permanent player ID';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.global_admins(user_id,role,status) values(a,'superadmin','approved');
    raise exception 'Player can grant organiser access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_flexible_tournament('Forbidden','forbidden-' || a::text,'Test',now(),'padel',2,'knockout',0,2);
    raise exception 'Player can create a tournament';
  exception when others then
    if sqlerrm = 'Player can create a tournament' then raise; end if;
  end;
  update public.player_profiles set display_name='Новое имя' where auth_user_id=a and version=old_version;
  if not found then raise exception 'Own name cannot be changed'; end if;
  update public.player_profiles set display_name='Stale write' where auth_user_id=a and version=old_version;
  if found then raise exception 'Stale client can overwrite profile'; end if;
  if not exists(select 1 from public.player_profiles where player_id=player and version=old_version+1 and display_name='Новое имя') then raise exception 'Version or permanent ID changed incorrectly'; end if;
  begin
    insert into public.player_profiles(auth_user_id,display_name) values(a,'Duplicate');
    raise exception 'Duplicate profile accepted';
  exception when unique_violation then null; end;
  avatar := a::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('player-avatars',avatar,a::text,'{"mimetype":"image/jpeg","size":100}');
  update public.player_profiles set avatar_path=avatar where auth_user_id=a;
  begin
    update public.player_profiles set avatar_path=b::text || '/' || gen_random_uuid()::text || '.jpg' where auth_user_id=a;
    raise exception 'Foreign avatar reference accepted';
  exception when check_violation then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('player-avatars',b::text || '/' || gen_random_uuid()::text || '.jpg',a::text);
    raise exception 'Foreign upload allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.player_profiles where auth_user_id=a;
    raise exception 'Client can delete permanent profile';
  exception when insufficient_privilege then null; end;
  reset role;
  update auth.users set email=a::text || '-changed@example.invalid' where id=a;
  perform set_config('request.jwt.claim.sub',b::text,true);
  set local role authenticated;
  if exists(select 1 from public.player_profiles) then raise exception 'Other player can read profile'; end if;
  if exists(select 1 from storage.objects where bucket_id='player-avatars' and name=avatar) then raise exception 'Other player can read avatar'; end if;
  update public.player_profiles set display_name='Hijack' where auth_user_id=a;
  if found then raise exception 'Other player can update profile'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',pending::text,true);
  set local role authenticated;
  begin
    insert into public.player_profiles(auth_user_id,display_name) values(pending,'Unverified');
    raise exception 'Unverified user can create profile';
  exception when insufficient_privilege then null; end;
  reset role;
  select user_id into admin_id from public.global_admins where status='approved' limit 1;
  if admin_id is null then raise exception 'No organiser found for regression check'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  if not public.is_global_admin() then raise exception 'Existing organiser lost access'; end if;
  perform id from public.tournaments;
  if exists(select 1 from public.player_profiles where auth_user_id=a) then raise exception 'Organiser can read private player profile'; end if;
  reset role;
  if not exists(select 1 from public.player_profiles where player_id=player and auth_user_id=a) then raise exception 'Email change lost player identity'; end if;
  if has_table_privilege('anon','public.player_profiles','select') then raise exception 'Anonymous profile access'; end if;
  if exists(select 1 from storage.buckets where id='player-avatars' and public) then raise exception 'Avatars are public'; end if;
end;
$$;
rollback;
