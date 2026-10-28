-- Run as postgres against a migrated database (psql -v ON_ERROR_STOP=1 -f ...).
-- Synthetic identities, tournaments, helpers and results all disappear on rollback.
-- Actual RPC calls run as authenticated/anon, so grants and RLS are exercised too.
begin;
set local statement_timeout = '55s';

create temporary table setup_test_results (scenario text, passed boolean, detail text);
create temporary table setup_test_users (kind text, id uuid default gen_random_uuid());
insert into setup_test_users(kind) values ('approved'), ('second-organizer'), ('ordinary'), ('pending'), ('revoked');
insert into auth.users(id, email)
select id, 'setup-test-' || id || '@example.invalid' from setup_test_users;
insert into public.global_admins(user_id, status)
select id, case when kind in ('approved','second-organizer') then 'approved' else kind end
from setup_test_users where kind <> 'ordinary';
select set_config('setup_test.organizer', (select id::text from setup_test_users where kind='approved'), true);
select set_config('setup_test.prefix', 'setup-test-' || gen_random_uuid()::text || '-', true);

create function pg_temp.setup_pairs(n integer, groups integer default 0) returns jsonb
language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', '', 'player_one', '', 'player_two', '',
    'group', case when groups=0 then 'A' else chr(65+(i-1)%groups) end
  ) order by i), '[]'::jsonb) from generate_series(1,n) i;
$$;

create function pg_temp.setup_groups(n integer, qualifiers integer default 2) returns jsonb
language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('code',chr(65+i),'qualify_count',qualifiers) order by i),'[]'::jsonb)
  from generate_series(0,n-1) i;
$$;

create function pg_temp.create_setup(overrides jsonb default '{}') returns uuid
language plpgsql as $$
declare args jsonb := jsonb_build_object(
  'name','  Synthetic tournament  ', 'slug',current_setting('setup_test.prefix') || gen_random_uuid()::text,
  'location','  Vienna, Austria  ', 'starts_at','2027-06-12T10:00:00Z', 'ends_at','2027-06-12T10:00:00Z',
  'sport','padel', 'status','draft', 'format','knockout', 'pairs',pg_temp.setup_pairs(4), 'groups','[]'::jsonb
) || overrides;
begin
  return public.create_tournament_setup(args->>'name',args->>'slug',args->>'location',
    (args->>'starts_at')::timestamptz,(args->>'ends_at')::timestamptz,args->>'sport',args->>'status',args->>'format',args->'pairs',args->'groups');
end;
$$;

create function pg_temp.check_setup(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end; $$;

-- Cross-product of every sport, visibility and format at small, odd, usual and max size.
do $$
#variable_conflict use_variable
declare
  sport text; visibility text; format text; n integer; groups integer; playoff integer;
  size integer; id uuid; label text; t public.tournaments; r record;
begin
  perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
  foreach sport in array array['padel','tennis'] loop
    foreach visibility in array array['draft','published'] loop
      foreach format in array array['knockout','group_knockout'] loop
        foreach n in array array[2,7,16,64] loop
          label := format || '/' || sport || '/' || visibility || '/' || n;
          begin
            groups := case when format='knockout' then 0 else least(4,n/2) end;
            playoff := case when groups=0 then n else groups*2 end;
            size := 2; while size < playoff loop size := size*2; end loop;
            set local role authenticated;
            id := pg_temp.create_setup(jsonb_build_object('sport',sport,'status',visibility,'format',format,
              'pairs',pg_temp.setup_pairs(n,groups),'groups',pg_temp.setup_groups(groups)));
            select * into t from public.tournaments where tournaments.id=id;
            perform pg_temp.check_setup(t.name='Synthetic tournament' and t.location='Vienna, Austria'
              and t.sport=sport and t.status=visibility and t.format=format and t.participant_count=n
              and t.playoff_participant_count=playoff and t.bracket_size=size
              and t.starts_at='2027-06-12T10:00:00Z'::timestamptz and t.ends_at=t.starts_at, 'Tournament metadata mismatch');
            perform pg_temp.check_setup((select count(*)=n and min(seed)=1 and max(seed)=n from public.pairs where tournament_id=id), 'Pair count or seeds mismatch');
            perform pg_temp.check_setup(not exists(select 1 from public.pairs where tournament_id=id and
              (name <> 'Pair '||lpad(seed::text,2,'0') or player_one <> 'Player '||(seed*2-1)::text or player_two <> 'Player '||(seed*2)::text)), 'Placeholder names mismatch');
            perform pg_temp.check_setup((select count(*)=1 from public.tournament_admins where tournament_id=id and user_id=auth.uid() and role='owner'), 'Owner membership missing');
            perform pg_temp.check_setup((select count(*)=size-1 from public.matches where tournament_id=id), 'Wrong playoff match count');
            perform pg_temp.check_setup((select count(*)=1 from public.matches where tournament_id=id and next_match_id is null), 'Must have one final');
            perform pg_temp.check_setup(not exists(select 1 from public.matches m join public.matches next on next.id=m.next_match_id where m.tournament_id=id and
              (next.tournament_id<>id or next.round<>m.round+1 or next.position<>(m.position+1)/2 or m.next_slot<>case when m.position%2=1 then 1 else 2 end)), 'Broken playoff link');
            if groups=0 then
              perform pg_temp.check_setup(not exists(select 1 from public.tournament_groups where tournament_id=id), 'Knockout has groups');
              perform pg_temp.check_setup(not exists(select 1 from public.group_matches where tournament_id=id), 'Knockout has group matches');
              perform pg_temp.check_setup((select count(*)=n from (
                select pair_one_id from public.matches where tournament_id=id and round=1 and pair_one_id is not null
                union all select pair_two_id from public.matches where tournament_id=id and round=1 and pair_two_id is not null
              ) entries), 'Initial draw lost pairs');
              perform pg_temp.check_setup(not exists(select 1 from public.matches where tournament_id=id and round>1 and status='completed' and
                exists(select 1 from public.matches feeder where feeder.next_match_id=matches.id and feeder.status<>'completed' and
                  exists(select 1 from public.pairs p where p.tournament_id=id and p.seed between (feeder.position-1)*power(2,feeder.round)+1 and feeder.position*power(2,feeder.round)))), 'Advanced past an unfinished opponent');
            else
              perform pg_temp.check_setup((select count(*)=groups and sum(qualify_count)=playoff from public.tournament_groups where tournament_id=id), 'Group configuration mismatch');
              perform pg_temp.check_setup((select count(*)=n from public.group_members gm join public.tournament_groups g on g.id=gm.group_id where g.tournament_id=id), 'Group membership missing');
              for r in select g.id, g.code, count(gm.pair_id)::integer members from public.tournament_groups g
                join public.group_members gm on gm.group_id=g.id where g.tournament_id=id group by g.id loop
                perform pg_temp.check_setup((select count(*)=r.members*(r.members-1)/2 from public.group_matches where group_id=r.id), 'Wrong round-robin match count');
              end loop;
              perform pg_temp.check_setup(not exists(select 1 from public.group_members gm join public.tournament_groups g on g.id=gm.group_id
                join public.pairs p on p.id=gm.pair_id where g.tournament_id=id and g.code<>chr(65+(p.seed-1)%groups)), 'Assignments changed');
              perform pg_temp.check_setup(not exists(select 1 from public.group_matches m where m.tournament_id=id and
                (m.pair_one_id=m.pair_two_id or not exists(select 1 from public.group_members where group_id=m.group_id and pair_id=m.pair_one_id)
                or not exists(select 1 from public.group_members where group_id=m.group_id and pair_id=m.pair_two_id))), 'Invalid group opponent');
              perform pg_temp.check_setup(not exists(select 1 from public.matches where tournament_id=id and
                (pair_one_id is not null or pair_two_id is not null or winner_id is not null or status<>'scheduled' or completed_at is not null)), 'Playoffs must wait for group qualifiers');
            end if;
            reset role;
            perform pg_temp.check_setup(exists(select 1 from public.activity_log where tournament_id=id and action='created' and changed_by=current_setting('setup_test.organizer')::uuid), 'Creation audit missing');
            -- Public visibility checks run without the organizer identity.
            perform set_config('request.jwt.claim.sub','',true);
            set local role anon;
            perform pg_temp.check_setup((select count(*) from public.tournaments where tournaments.id=id)=case when visibility='published' then 1 else 0 end, 'Public tournament visibility mismatch');
            perform pg_temp.check_setup((select count(*) from public.pairs where tournament_id=id)=case when visibility='published' then n else 0 end, 'Public pair visibility mismatch');
            reset role;
            perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
            insert into setup_test_results values(label,true,null);
          exception when others then
            reset role;
            insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm);
          end;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Individual qualifier counts, manual moves, one group, maximum groups, and names.
do $$
#variable_conflict use_variable
declare c record; id uuid; pairs jsonb; groups jsonb; actual integer[]; label text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
  for c in select * from (values
    ('manual 3+5 groups',8,2,array[3,5],array[1,3],13),
    ('one group',7,1,array[7],array[3],21),
    ('zero qualifiers in a group',4,2,array[2,2],array[2,0],2),
    ('maximum 26 groups',52,26,array_fill(2,array[26]),array_fill(1,array[26]),26)
  ) cases(label,n,g,sizes,qualifiers,matches) loop
    label := c.label;
    begin
      select jsonb_agg(jsonb_build_object('group',chr(65+g-1),'name',' Team '||g||'-'||i||' ',
        'player_one',' Алексей '||g||'-'||i||' ','player_two',' José '||g||'-'||i||' ') order by g,i)
      into pairs from generate_series(1,c.g) g cross join lateral generate_series(1,c.sizes[g]) i;
      select jsonb_agg(jsonb_build_object('code',chr(65+g-1),'qualify_count',c.qualifiers[g]) order by g)
      into groups from generate_series(1,c.g) g;
      set local role authenticated;
      id := pg_temp.create_setup(jsonb_build_object('format','group_knockout','pairs',pairs,'groups',groups,
        'ends_at','2027-06-14T10:00:00Z','location','  '));
      select array_agg(n order by code) into actual from (
        select g.code,count(*)::integer n from public.tournament_groups g join public.group_members gm on gm.group_id=g.id where g.tournament_id=id group by g.code
      ) sizes;
      perform pg_temp.check_setup(actual=c.sizes,'Manual group sizes were not retained');
      perform pg_temp.check_setup((select array_agg(qualify_count order by code)=c.qualifiers from public.tournament_groups where tournament_id=id),'Individual qualifiers changed');
      perform pg_temp.check_setup((select playoff_participant_count=(select sum(x) from unnest(c.qualifiers) x) and ends_at='2027-06-14T10:00:00Z'::timestamptz and location is null from public.tournaments where tournaments.id=id),'Qualifier total, end date or empty location mismatch');
      perform pg_temp.check_setup((select count(*)=c.matches from public.group_matches where tournament_id=id),'Wrong group match total');
      perform pg_temp.check_setup(not exists(select 1 from public.pairs p where tournament_id=id and
        (p.name<>trim(pairs->(seed-1)->>'name') or player_one<>trim(pairs->(seed-1)->>'player_one') or player_two<>trim(pairs->(seed-1)->>'player_two'))),'Names not trimmed or saved');
      reset role;
      insert into setup_test_results values(label,true,null);
    exception when others then
      reset role;
      insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm);
    end;
  end loop;
end;
$$;

-- Odd and non-power-of-two draws: check automatic wins against occupied seed ranges.
do $$
#variable_conflict use_variable
declare n integer; id uuid; size integer; r record; expected uuid; label text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
  foreach n in array array[3,5,6,9,13,14,17,31,33,63] loop
    label := 'bye progression/' || n;
    begin
      set local role authenticated;
      id := pg_temp.create_setup(jsonb_build_object('pairs',pg_temp.setup_pairs(n)));
      for r in select * from public.matches where tournament_id=id order by round,position loop
        -- Sequential seeds occupy a prefix of each match's original bracket range.
        select case when count(*)=1 then (array_agg(p.id))[1] else null end into expected
        from public.pairs p where p.tournament_id=id and p.seed between (r.position-1)*power(2,r.round)+1 and r.position*power(2,r.round);
        perform pg_temp.check_setup(r.winner_id is not distinct from expected,'Incorrect automatic winner in round '||r.round||' position '||r.position);
        perform pg_temp.check_setup((r.status='completed')=(expected is not null),'Incorrect bye match status');
        if r.round=1 then
          perform pg_temp.check_setup(r.pair_one_id is not distinct from (select p.id from public.pairs p where p.tournament_id=id and seed=r.position*2-1)
            and r.pair_two_id is not distinct from (select p.id from public.pairs p where p.tournament_id=id and seed=r.position*2),'First-round seeding changed');
        else
          perform pg_temp.check_setup(r.pair_one_id is not distinct from (select winner_id from public.matches where next_match_id=r.id and next_slot=1)
            and r.pair_two_id is not distinct from (select winner_id from public.matches where next_match_id=r.id and next_slot=2),'Winner propagated to the wrong slot');
        end if;
      end loop;
      reset role;
      insert into setup_test_results values(label,true,null);
    exception when others then
      reset role;
      insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm);
    end;
  end loop;
end;
$$;

-- Invalid input must fail for the expected reason and leave no partial tournament.
do $$
#variable_conflict use_variable
declare c record; before_count bigint; failed boolean; error_message text; error_code text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
  for c in select * from (values
    ('no pairs',jsonb_build_object('pairs','[]'::jsonb),'Pair count must be between 2 and 64'),
    ('one pair',jsonb_build_object('pairs',pg_temp.setup_pairs(1)),'Pair count must be between 2 and 64'),
    ('65 pairs',jsonb_build_object('pairs',pg_temp.setup_pairs(65)),'Pair count must be between 2 and 64'),
    ('pairs null','{"pairs":null}'::jsonb,'Invalid setup'),
    ('pairs object','{"pairs":{}}'::jsonb,'Invalid setup'),
    ('groups null','{"groups":null}'::jsonb,'Invalid setup'),
    ('groups object','{"groups":{}}'::jsonb,'Invalid setup'),
    ('start null','{"starts_at":null}'::jsonb,'Check tournament dates'),
    ('end null','{"ends_at":null}'::jsonb,'Check tournament dates'),
    ('end before start','{"ends_at":"2027-06-11T10:00:00Z"}'::jsonb,'Check tournament dates'),
    ('blank name','{"name":"  "}'::jsonb,'Tournament name is required'),
    ('name null','{"name":null}'::jsonb,'Tournament name is required'),
    ('bad slug','{"slug":"Bad Slug"}'::jsonb,'Use a lowercase URL slug'),
    ('blank slug','{"slug":""}'::jsonb,'Use a lowercase URL slug'),
    ('slug null','{"slug":null}'::jsonb,'Use a lowercase URL slug'),
    ('bad sport','{"sport":"squash"}'::jsonb,'Invalid sport'),
    ('sport null','{"sport":null}'::jsonb,'Invalid sport'),
    ('bad format','{"format":"round_robin"}'::jsonb,'Invalid format'),
    ('format null','{"format":null}'::jsonb,'Invalid format'),
    ('bad visibility','{"status":"live"}'::jsonb,'Invalid visibility'),
    ('visibility null','{"status":null}'::jsonb,'Invalid visibility'),
    ('one player only',jsonb_build_object('pairs',jsonb_set(pg_temp.setup_pairs(2),'{0,player_one}','"Alex"')),'Enter both player names'),
    ('second player only',jsonb_build_object('pairs',jsonb_set(pg_temp.setup_pairs(2),'{1,player_two}','"Dan"')),'Enter both player names'),
    ('long team name',jsonb_build_object('pairs',jsonb_set(pg_temp.setup_pairs(2),'{0,name}',to_jsonb(repeat('X',201)))),'Enter both player names'),
    ('long player name',jsonb_build_object('pairs',jsonb_set(pg_temp.setup_pairs(2),'{0,player_one}',to_jsonb(repeat('X',201)))),'Enter both player names'),
    ('knockout with groups',jsonb_build_object('groups',pg_temp.setup_groups(1)),'Knockout tournaments do not use groups'),
    ('no groups',jsonb_build_object('format','group_knockout'),'Each group needs at least two pairs'),
    ('too many groups',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(54,27),'groups',pg_temp.setup_groups(27)),'Each group needs at least two pairs'),
    ('too few pairs for groups',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(2),'groups',pg_temp.setup_groups(2)),'Each group needs at least two pairs'),
    ('unordered group codes',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(4,2),'groups','[{"code":"B","qualify_count":2},{"code":"A","qualify_count":2}]'::jsonb),'Groups must be ordered'),
    ('overfilled qualifiers',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(4,2),'groups',pg_temp.setup_groups(2,3)),'Check group size and qualifiers'),
    ('negative qualifiers',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(4,2),'groups',pg_temp.setup_groups(2,-1)),'Check group size and qualifiers'),
    ('null qualifiers',jsonb_build_object('format','group_knockout','groups','[{"code":"A","qualify_count":null}]'::jsonb),'Check group size and qualifiers'),
    ('no qualifiers',jsonb_build_object('format','group_knockout','groups',pg_temp.setup_groups(1,0)),'Choose at least two playoff pairs'),
    ('one qualifier',jsonb_build_object('format','group_knockout','groups',pg_temp.setup_groups(1,1)),'Choose at least two playoff pairs'),
    ('unknown pair group',jsonb_build_object('format','group_knockout','pairs',jsonb_set(pg_temp.setup_pairs(5,2),'{4,group}','"Z"'),'groups',pg_temp.setup_groups(2)),'Every pair needs a valid group'),
    ('missing pair group',jsonb_build_object('format','group_knockout','pairs',pg_temp.setup_pairs(5,2)#-'{4,group}','groups',pg_temp.setup_groups(2)),'Every pair needs a valid group'),
    ('singleton group',jsonb_build_object('format','group_knockout','pairs',jsonb_set(pg_temp.setup_pairs(4,2),'{0,group}','"B"'),'groups',pg_temp.setup_groups(2)),'Check group size and qualifiers')
  ) cases(label,overrides,expected) loop
    begin
      select count(*) into before_count from public.tournaments where slug like current_setting('setup_test.prefix')||'%';
      failed := false;
      begin
        set local role authenticated;
        perform pg_temp.create_setup(c.overrides);
      exception when others then
        failed := true; error_message := sqlerrm; error_code := sqlstate;
      end;
      reset role;
      perform pg_temp.check_setup(failed,'Invalid input was accepted');
      perform pg_temp.check_setup(error_code='P0001' and position(c.expected in error_message)>0,'Unexpected rejection: '||coalesce(error_code,'')||' '||coalesce(error_message,''));
      perform pg_temp.check_setup((select count(*)=before_count from public.tournaments where slug like current_setting('setup_test.prefix')||'%'),'Partial tournament remained');
      insert into setup_test_results values(c.label,true,null);
    exception when others then
      reset role;
      insert into setup_test_results values(c.label,false,sqlstate || ': ' || sqlerrm);
    end;
  end loop;
end;
$$;

-- Unique URL conflicts, ordinary/pending/revoked accounts, shared organizers and anon.
do $$
#variable_conflict use_variable
declare id uuid; slug text; failed boolean; c record; label text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('setup_test.organizer'),true);
  label := 'duplicate slug';
  begin
    slug := current_setting('setup_test.prefix')||'duplicate';
    set local role authenticated;
    id := pg_temp.create_setup(jsonb_build_object('slug',slug));
    failed := false;
    begin perform pg_temp.create_setup(jsonb_build_object('slug',slug));
    exception when unique_violation then failed := true; end;
    perform pg_temp.check_setup(failed,'Duplicate slug accepted');
    perform pg_temp.check_setup((select count(*)=1 from public.tournaments where tournaments.slug=slug),'Duplicate URL left partial state');
    reset role;
    insert into setup_test_results values(label,true,null);
  exception when others then reset role; insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm); end;

  for c in select * from setup_test_users where kind<>'approved' loop
    label := 'access/'||c.kind;
    begin
      perform set_config('request.jwt.claim.sub',c.id::text,true);
      set local role authenticated;
      if c.kind='second-organizer' then
        perform pg_temp.check_setup(public.is_tournament_owner(id),'New tournament not shared');
        perform pg_temp.check_setup(exists(select 1 from public.tournaments where tournaments.id=id),'Other organizer cannot see draft');
        perform pg_temp.create_setup(); -- No pre-existing tournament ownership required.
      else
        failed := false;
        begin perform pg_temp.create_setup();
        exception when raise_exception then
          if sqlerrm <> 'Organiser access required' then raise; end if;
          failed := true;
        end;
        perform pg_temp.check_setup(failed,'Unapproved account created a tournament');
        perform pg_temp.check_setup(not exists(select 1 from public.tournaments where tournaments.id=id),'Unapproved account can see draft');
      end if;
      reset role;
      insert into setup_test_results values(label,true,null);
    exception when others then reset role; insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm); end;
  end loop;

  label := 'access/anonymous';
  begin
    perform set_config('request.jwt.claim.sub','',true);
    set local role anon;
    failed := false;
    begin perform pg_temp.create_setup();
    exception when insufficient_privilege then failed := true; end;
    perform pg_temp.check_setup(failed,'Anonymous RPC execution allowed');
    reset role;
    insert into setup_test_results values(label,true,null);
  exception when others then reset role; insert into setup_test_results values(label,false,sqlstate || ': ' || sqlerrm); end;
end;
$$;

-- Emit all failures before failing the run; successful runs end with a compact report.
select * from setup_test_results where not passed order by scenario;
do $$ declare failures text; begin
  select string_agg(scenario||': '||detail,E'\n' order by scenario) into failures from setup_test_results where not passed;
  if failures is not null then raise exception 'Tournament creation regressions:%',E'\n'||failures; end if;
end; $$;
select count(*) as passed, count(*) filter(where not passed) as failed from setup_test_results;
rollback;
