-- Run against a migrated database; all test writes are rolled back.
begin;
do $$
declare
  v_users uuid[];
  v_user uuid;
  v_total integer;
  v_visible integer;
  v_created uuid;
  v_attempt integer;
begin
  select array_agg(user_id) into v_users from public.global_admins where status='approved';
  if coalesce(cardinality(v_users),0)=0 then raise exception 'No approved organisers'; end if;
  perform set_config('request.jwt.claim.sub',v_users[1]::text,true);
  set local role authenticated;
  v_created := public.create_flexible_tournament('Shared access test', 'shared-access-test-' || gen_random_uuid()::text, 'Test', now(), 'padel', 2, 'knockout', 0, 2);
  reset role;
  select count(*) into v_total from public.tournaments;
  foreach v_user in array v_users loop
    perform set_config('request.jwt.claim.sub',v_user::text,true);
    set local role authenticated;
    select count(*) into v_visible from public.tournaments;
    if v_visible <> v_total then raise exception 'An organiser cannot see all tournaments'; end if;
    if not public.is_tournament_owner(v_created) or not public.is_tournament_admin(v_created) then raise exception 'New tournament not shared'; end if;
    update public.tournaments set location='Shared test' where id=v_created;
    if not found then raise exception 'Organiser cannot update new tournament'; end if;
    reset role;
  end loop;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  set local role authenticated;
  if public.is_tournament_owner(v_created) or public.is_global_admin() then raise exception 'Unapproved account has access'; end if;
  if exists (select 1 from public.tournaments where id=v_created) then raise exception 'Unapproved account can read draft'; end if;
  reset role;
  if has_function_privilege('anon','public.resolve_organizer_login(text)','execute')
    or has_function_privilege('authenticated','public.resolve_organizer_login(text)','execute')
    or has_function_privilege('authenticated','public.consume_organizer_login_attempt()','execute') then raise exception 'Private login helpers are exposed'; end if;
  if not exists (select 1 from public.resolve_organizer_login('KyngAdmin')) then raise exception 'Shared login missing'; end if;
  if exists (select 1 from public.resolve_organizer_login('unknown')) then raise exception 'Unknown login resolved'; end if;
  delete from organizer_private.login_attempts;
  for v_attempt in 1..10 loop
    if not public.consume_organizer_login_attempt() then raise exception 'Login limit activated too early'; end if;
  end loop;
  if public.consume_organizer_login_attempt() then raise exception 'Login limit failed'; end if;
end;
$$;
rollback;
