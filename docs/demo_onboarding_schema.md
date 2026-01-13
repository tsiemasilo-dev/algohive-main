# Demo onboarding data requirements

To support the demo onboarding flow (basics, investing preferences, and OpenStrategies alignment), ensure the following Supabase tables/columns exist.

## `demo_profiles`
Use the dedicated demo profile table (separate from live `profiles`) with the full set of defaults used by the demo UI:

```sql
create table public.demo_profiles (
  id uuid not null,
  account_mode text null default 'paper'::text,
  first_name text not null,
  last_name text not null,
  phone text null,
  risk_appetite text null, -- values aligned to OpenStrategies filters: Conservative, Low, Moderate, High, High Risk, Very High Risk
  balance numeric null default 10000,
  allocated numeric null default 0, -- running total of demo allocations saved from strategy.html
  base_currency text null default 'USD', -- user-set display/denomination currency for paper balances
  strategies jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  avatar_url text null,
  watch_list jsonb null default '[]'::jsonb, -- array of strategy ids the user starred during onboarding
  constraint demo_profiles_pkey primary key (id),
  constraint demo_profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint demo_profiles_account_mode_check check ((account_mode = 'paper'::text))
) tablespace pg_default;

create index if not exists demo_profiles_risk_idx on public.demo_profiles using btree (risk_appetite) tablespace pg_default;
```

### Automatic demo account creation
Mirror the application flow by auto-creating demo metrics rows whenever a demo profile is inserted:

```sql
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

### Investment preferences payload
Persist the investing-questions answers in the `investment_preferences` column. A flat JSON document keeps reads simple for 
the onboarding page and OpenStrategies filters. Suggested shape:

```sql
-- Example contents for investment_preferences
-- {
--   "return_target": "15%+ per year",
--   "drawdown_tolerance": "I can tolerate large swings",
--   "time_horizon": "3-5 years",
--   "guidance_style": "Hands-on coaching",
--   "objectives": "Diversified growth with tech tilt"
-- }
```

Recommended enum-style options for each field (aligned to existing OpenStrategies filters) include:

* `risk_appetite` (top-level column): `Conservative`, `Low`, `Moderate`, `High`, `High Risk`, `Very High Risk`
* `return_target`: `Preserve capital`, `5-8% per year`, `8-12% per year`, `12-15% per year`, `15%+ per year`
* `drawdown_tolerance`: `I prefer minimal drawdowns`, `I can handle moderate swings`, `I can tolerate large swings`
* `time_horizon`: `< 1 year`, `1-3 years`, `3-5 years`, `5+ years`
* `guidance_style`: `Self-directed`, `Light touch guidance`, `Hands-on coaching`
* `objectives`: free-text notes (optional)

## `profiles` (live)
```sql
alter table public.profiles
  add column if not exists risk_appetite text,
  add column if not exists phone text,
  add column if not exists avatar_url text;
```

## `strategies`
The recommendations tab pulls from this table by `risk_level`.
```sql
create table if not exists public.strategies (
  id uuid primary key,
  name text not null,
  creator text,
  currency text,
  risk_level text,
  style text,
  unit_price numeric,
  aum numeric
);
create index if not exists strategies_risk_idx on public.strategies (risk_level);
```

These columns keep risk appetite in sync with OpenStrategies filters and allow the onboarding page to surface matching strategies with allocation links.
