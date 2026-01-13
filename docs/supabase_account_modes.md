# Supabase setup for Paper (demo) vs Live accounts

This guide outlines a minimal Supabase schema to support both **Paper (demo)** and **Live** investment flows. It keeps Live records in the existing `profiles` table and adds a dedicated `demo_profiles` table so data stays separated while still sharing the same authenticated user.

## Auth metadata and mode tracking
- Store the chosen account mode in the user's auth metadata (the current UI uses the `account_type` key) so the client can default to the last selection.
- Suggested auth metadata fields (set during sign-up and updateable on toggle):
  - `account_mode` (or `account_type` in the UI): `'paper' | 'live'`
  - `verification_status`: `'pending' | 'verified' | 'n/a'` (use `pending` for live until KYC completes)

Example (Node client):
```js
await supabase.auth.updateUser({
  data: { account_mode: 'paper', verification_status: 'n/a' }
});
```

## Tables
### `profiles` (Live)
Use your existing live table but ensure it contains:
- `id uuid primary key references auth.users(id)`
- `account_mode text default 'live' check (account_mode in ('live'))`
- `verification_status text default 'pending' check (verification_status in ('pending','verified'))`
- `created_at timestamptz default now()`
- Any live-only portfolio state (balances, holdings, KYC references, etc.)

### `demo_profiles` (Paper)
Keep demo users fully separated but still tied to the auth user. Store the requested profile fields so a demo sign-up lives in `auth.users` **and** `demo_profiles` (live sign-ups still use `profiles`).
```sql
create table public.demo_profiles (
  id uuid not null,
  account_mode text null default 'paper'::text,
  first_name text not null,
  last_name text not null,
  phone text null,
  risk_appetite text null,
  balance numeric null default 10000,
  allocated numeric null default 0,
  base_currency text null default 'USD',
  strategies jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  avatar_url text null,
  watch_list jsonb null default '[]'::jsonb,
  constraint demo_profiles_pkey primary key (id),
  constraint demo_profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint demo_profiles_account_mode_check check ((account_mode = 'paper'::text))
);

create index if not exists demo_profiles_risk_idx on public.demo_profiles using btree (risk_appetite) tablespace pg_default;
```
- Use `balance` for the simulated wallet, `allocated` for the running total of demo allocations, `strategies` to persist demo
  subscriptions, and `watch_list` for demo favorites.
- Keep simulated balances/positions here so they never mix with live data.
- Optionally add reset columns (e.g., `last_reset_at`) for paper resets.

### `demo_accounts` (Paper metrics)
Create a per-demo-account metrics row that auto-links to the demo profile id.
```sql
create table public.demo_accounts (
  id uuid not null,
  currency text null default 'USD',
  pnl numeric null default 0,
  trades_count integer null default 0,
  last_activity_at timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  constraint demo_accounts_pkey primary key (id),
  constraint demo_accounts_id_fkey foreign key (id) references demo_profiles (id) on delete cascade
);

create or replace function create_demo_account()
returns trigger as $$
begin
  insert into demo_accounts (id) values (new.id);
  return new;
end;$$ language plpgsql;

drop trigger if exists trg_create_demo_account on demo_profiles;
create trigger trg_create_demo_account
after insert on demo_profiles for each row
execute function create_demo_account ();
```
- The trigger ensures every demo profile automatically gets a metrics row without extra client calls.

### Optional: `account_modes` view
Expose a simple mode snapshot to the client:
```sql
create view account_modes as
select id, 'live'::text as mode, verification_status
from profiles
union
select id, 'paper'::text as mode, 'n/a'::text
from demo_profiles;
```

## RLS policies
Enable Row Level Security on both tables and restrict rows to the owning user:
```sql
alter table profiles enable row level security;
alter table demo_profiles enable row level security;

create policy "Profiles are only visible to owner" on profiles
  for select using (auth.uid() = id);
create policy "Profiles are only insertable by owner" on profiles
  for insert with check (auth.uid() = id);
create policy "Profiles are only updatable by owner" on profiles
  for update using (auth.uid() = id);

create policy "Demo profiles are only visible to owner" on demo_profiles
  for select using (auth.uid() = id);
create policy "Demo profiles are only insertable by owner" on demo_profiles
  for insert with check (auth.uid() = id);
create policy "Demo profiles are only updatable by owner" on demo_profiles
  for update using (auth.uid() = id);
```

## How the app separates Live vs Paper
- **On sign up:**
  - Create the auth user and set `account_mode` metadata based on the chosen pill.
  - If `paper` (demo): insert into `demo_profiles` with first/last name, phone, risk appetite, balance, and strategies; the trigger auto-creates `demo_accounts` so the metrics row is ready. No live `profiles` insert is needed.
  - If `live`: insert into `profiles` (with `verification_status = 'pending'` until KYC completes). No `demo_profiles` row is created unless the user later opts into paper mode.
- **On sign in:** read `user.user_metadata.account_mode` (or the `account_modes` view) and/or the UI toggle to decide whether to hydrate from `profiles` or `demo_profiles` + `demo_accounts`. If metadata is absent, default to paper to keep new users safe.
- **Switching modes in-app:** update auth metadata and fetch the matching table. Avoid mixing queries; paper flows read/write `demo_profiles`/`demo_accounts`, while live flows read/write `profiles`.
- **Live verification:** block trading/transfer actions when `verification_status != 'verified'` and show the "Will Require Additional Verification" messaging on sign-up when `account_mode = 'live'`.

## Front-end wiring (auth.html)
- The auth page now upserts into `demo_profiles` immediately after sign-up/sign-in when **Paper** is selected. It pulls defaults from the user's auth `user_metadata` when present and falls back to safe placeholders (`Demo`/`User`, `balanced` risk appetite, `10000` balance, and empty strategies array) so the row always exists for paper users.
- The auth metadata `account_type` is updated on every successful auth so subsequent sessions default to the last selected mode.
- On sign-in, the UI now hydrates the account toggle from `user_metadata.account_type` when available (falling back to local storage, then paper) so routing honors the user’s saved mode even if the toggle wasn’t manually set before logging in.
- Live mode keeps the existing live profile gating. Paper mode skips live gating and simply redirects after ensuring the `demo_profiles` row exists (the `demo_accounts` trigger will populate metrics automatically).

## Safety checklist
- Enforce foreign keys to `auth.users` on both tables and cascade deletes so demo data is dropped when the user is removed.
- Use separate storage buckets (if needed) for paper vs live uploads.
- Keep distinct RPC functions or edge functions per mode to prevent cross-mode state changes.
- Default any analytics/telemetry to anonymized data for paper users if requirements differ.
