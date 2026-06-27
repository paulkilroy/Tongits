# Enabling online play (Supabase)

Online play needs a free Supabase project. One-time setup, ~5 minutes.

## 1. Create the project
1. Go to <https://supabase.com> → sign in **with GitHub** → **New project**.
2. Name it `tongits`, pick a region near you, set a database password (save it).
3. Wait ~1 min for it to provision.

## 2. Create the table + realtime + access policy
Open **SQL Editor** → **New query**, paste this, and **Run**:

```sql
create table rooms (
  code        text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Push row changes to clients in realtime
alter publication supabase_realtime add table rooms;

-- Open access via the public anon key (friendly game, random codes — no accounts).
alter table rooms enable row level security;
create policy "anon full access" on rooms
  for all to anon using (true) with check (true);
```

> Security note: this lets anyone with the anon key read/write the `rooms` table.
> That's fine for a private game between friends using random 5-char codes. If we
> ever make it public we'd lock this down (per-room auth).

## 3. Grab your keys
**Settings → API**, copy:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

## 4. Add the keys in two places
**Local dev:** create `.env.local` (copy from `.env.example`) and paste both values.

**Vercel:** Project → **Settings → Environment Variables**, add both
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) for Production, then **redeploy**
(Deployments → ⋯ → Redeploy) so the build picks them up.

## 5. Play
- One person taps **Host vs a friend** → shares the 5-char **code**.
- The other enters the code → **Join**.
- Take turns; the game syncs automatically. (Practice vs AI works with no setup.)
