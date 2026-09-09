-- social_copy - the store behind /social and api/social.js.
--
-- It lives in docs/ and not beside api/social.js, which is where it was first put
-- and where it reads better: Vercel builds everything in api/ as a serverless
-- function, has no runtime for .sql, and fails the whole deployment over it. Every
-- deployment from 3c61f4f (2026-09-08 19:11) to cb87b6b failed for that reason and
-- the live site served yesterday's build throughout.
--
-- Run once, in the SQL editor of the Supabase project named 'blitzspirit', in the
-- cliftonflack@gmail.com org. That is a DIFFERENT project from the one admin.js and
-- feedback.js use, which is why this function reads SOCIAL_SUPABASE_URL and
-- SOCIAL_SUPABASE_KEY rather than the shared SUPABASE_* variables: sending the older
-- project's key to this project's URL would authenticate nothing while looking
-- perfectly configured.
--
-- Until the table exists the page still renders every line from
-- standalone/src/data/pages/social.json; only saving is unavailable, and
-- GET /api/social answers 500.
--
-- The table holds only the lines that DIFFER from the committed JSON: an untouched
-- line has no row, reverting deletes its row, and emptying the table returns the page
-- to the copy in the repo. That is why there is no seeding step and no foreign key -
-- the JSON is the source, this is the diff.

create table if not exists public.social_copy (
  -- '<entry ref>:<register>', e.g. 'H-A-01:house'. api/social.js refuses any id that
  -- is not already in the committed JSON, so ids here are always resolvable. The
  -- constraints below repeat the function's limits at the table, so the data stays
  -- sane even if something other than the function ever writes here.
  id text primary key check (char_length(id) between 3 and 100 and id like '%:%'),
  text text not null check (char_length(text) between 1 and 1000),
  updated_at timestamptz not null default now()
);

-- No policies are defined, deliberately. RLS with no policy denies anon and
-- authenticated outright; the service role bypasses it, and the only thing holding
-- the service key is api/social.js, through SOCIAL_SUPABASE_KEY on Vercel. The page
-- is open to edit, but every write still goes through that function's validation -
-- known id, 1000 character cap, no markup.
alter table public.social_copy enable row level security;

-- Check it landed:
--   select count(*) from public.social_copy;
-- and then, on the site, GET /api/social should answer 200 with {"overrides":{}}.
