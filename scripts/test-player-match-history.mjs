import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const read=p=>fs.readFileSync(p,'utf8');
const migration=p=>read(`${root}/supabase/migrations/${p}`);
const db=new PGlite();
try {
  await db.exec(read(`${root}/tests/fixtures/player-history-schema.sql`));
  // Exercise existing local-source triggers too; no network/notification code loaded.
  const scores=migration('20261028180015_tournament_results_and_knockout_stages.sql');
  await db.exec(scores.slice(scores.indexOf('create function public.assert_result_score'),scores.indexOf('-- Preserve existing')));
  const registrations=migration('20260820071715_create_tournament_registrations.sql');
  await db.exec(registrations.slice(registrations.indexOf('create or replace function public.prepare_tournament_registration'),registrations.indexOf('alter table public.tournament_registrations enable row level security')));
  const owners=migration('20261029184937_link_player_registrations.sql');
  await db.exec(owners.slice(owners.indexOf('create function player_private.assign_registration_owner'),owners.indexOf('-- Existing organiser')));
  await db.exec(`alter table public.group_matches add foreign key(pair_one_id) references public.pairs(id) on delete restrict;
    alter table public.group_matches add foreign key(pair_two_id) references public.pairs(id) on delete restrict;
    alter table public.group_matches add foreign key(winner_id) references public.pairs(id) on delete restrict;`);
  if(process.argv[2]!=='red') await db.exec(migration('20261030120000_player_match_history.sql'));
  await db.exec(read(`${root}/tests/player-match-history.sql`));
  console.log('PASS player-match-history.sql (PGlite PostgreSQL, catalog table/check/unique schema, real auth/score/registration functions, reset RPC)');
} catch(e){ console.error(e.message); console.error('SQLSTATE',e.code); process.exitCode=1; }
finally { await db.close(); }
