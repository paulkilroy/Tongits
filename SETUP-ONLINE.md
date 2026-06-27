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

---

# Accounts & wallet (anonymous auth)

This adds silent per-device accounts with a persistent play-money balance.

> ⚠️ Important: once accounts are on, the app signs in anonymously, so every
> request uses the `authenticated` role instead of `anon`. The SQL below updates
> the `rooms` policy to allow it — **run it or online play will stop working.**

### 1. Run this SQL FIRST (SQL Editor → New query → Run)
Do this before enabling anonymous auth, so the `rooms` policy already allows
signed-in users — no window where online breaks.
```sql
-- Let signed-in (anonymous) users use the rooms table, not just the anon role
drop policy if exists "anon full access" on rooms;
create policy "room access" on rooms
  for all to anon, authenticated using (true) with check (true);

-- Player accounts: name, avatar, play-money balance, friend code
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default 'Player',
  avatar      text not null default '🐱',
  balance     int  not null default 1000,
  friend_code text unique not null,
  updated_at  timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "read all profiles"  on profiles for select to authenticated using (true);
create policy "insert own profile" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Atomic, server-side balance change for the signed-in user only
create or replace function add_balance(delta int) returns int
language sql security definer set search_path = public as $$
  update profiles set balance = balance + delta, updated_at = now()
  where id = auth.uid()
  returning balance;
$$;
grant execute on function add_balance(int) to authenticated;
```

### 2. Enable anonymous sign-ins
Supabase → **Authentication → Sign In / Providers** → turn on **Anonymous Sign-ins** → Save.

### 3. That's it
No new keys. On next load each device gets ₱1000; online all-human games stake
₱10 (a TONGITS! win pays double). Practice-vs-AI games never touch the wallet.

---

# Friends & challenges

Add friends by code, see who's online, and challenge them straight into a game.
Run this SQL (SQL Editor → New query → Run). No new keys; presence needs no table.

```sql
-- Friendships (directed rows; 'accepted' = mutual friends)
create table friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references profiles(id) on delete cascade,
  addressee  uuid not null references profiles(id) on delete cascade,
  status     text not null default 'pending',   -- 'pending' | 'accepted'
  created_at timestamptz not null default now(),
  unique (requester, addressee)
);
alter table friendships enable row level security;
create policy "see own friendships" on friendships for select to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);
create policy "send request" on friendships for insert to authenticated
  with check (auth.uid() = requester);
create policy "respond friendship" on friendships for update to authenticated
  using (auth.uid() = requester or auth.uid() = addressee)
  with check (auth.uid() = requester or auth.uid() = addressee);
create policy "remove friendship" on friendships for delete to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);
alter publication supabase_realtime add table friendships;

-- Challenges (invite a friend into a room you're hosting)
create table challenges (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references profiles(id) on delete cascade,
  to_id      uuid not null references profiles(id) on delete cascade,
  room_code  text not null,
  status     text not null default 'pending',   -- pending|accepted|declined|cancelled
  created_at timestamptz not null default now()
);
alter table challenges enable row level security;
create policy "see own challenges" on challenges for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);
create policy "create challenge" on challenges for insert to authenticated
  with check (auth.uid() = from_id);
create policy "respond challenge" on challenges for update to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id)
  with check (auth.uid() = from_id or auth.uid() = to_id);
alter publication supabase_realtime add table challenges;
```

Then: Lobby → **👥 Friends** → share your code, add friends, and **Challenge**
online friends straight into a game. "Online" means "in the lobby, ready to play".
