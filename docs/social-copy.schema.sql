-- social_copy - the store behind /social and api/social.js.
--
-- It lives in docs/ and not beside api/social.js, which is where it was first put
-- and where it reads better: Vercel builds everything in api/ as a serverless
-- function, has no runtime for .sql, and fails the whole deployment over it. Every
-- deployment from 3c61f4f (2026-09-08 19:11) to cb87b6b failed for that reason and
-- the live site served yesterday's build throughout.
--
-- Run once, in the Supabase SQL editor for the project api/social.js names
-- (ojrzxknkovkiafzejegy). Until it exists the page still renders every line from
-- standalone/src/data/pages/social.json; only saving is unavailable, and
-- GET /api/social answers 500.
--
-- The table holds only the lines that DIFFER from the committed JSON: an untouched
-- line has no row, reverting deletes its row, and emptying the table returns the page
-- to the copy in the repo. That is why there is no seeding step and no foreign key -
-- the JSON is the source, this is the diff.

create table if not exists public.social_copy (
  -- '<entry ref>:<register>', e.g. 'H-A-01:house'. api/social.js refuses any id that
  -- is not already in the committed JSON, so ids here are always resolvable.
  id text primary key,
  text text not null,
  updated_at timestamptz not null default now()
);

-- No policies are defined, deliberately. RLS with no policy denies anon and
-- authenticated outright; the service role bypasses it, and the only thing holding
-- the service key is api/social.js. The page is open to edit, but every write still
-- goes through that function's validation - known id, 1000 character cap, no markup.
alter table public.social_copy enable row level security;

-- Check it landed:
--   select count(*) from public.social_copy;
-- and then, on the site, GET /api/social should answer 200 with {"overrides":{}}.
