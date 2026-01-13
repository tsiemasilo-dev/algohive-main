-- Demo schema setup for paper accounts

create table if not exists public.demo_profiles (
  id uuid not null,
  account_mode text null default 'paper'::text,
  first_name text not null,
  last_name text not null,
  phone text null,
  risk_appetite text null,
  balance numeric null default 10000,
  allocated numeric null default 0, -- running total of demo allocations
  base_currency text null default 'USD',
  strategies jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  avatar_url text null,
  watch_list jsonb null default '[]'::jsonb,
  constraint demo_profiles_pkey primary key (id),
  constraint demo_profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint demo_profiles_account_mode_check check ((account_mode = 'paper'::text))
) tablespace pg_default;

create index if not exists demo_profiles_risk_idx on public.demo_profiles using btree (risk_appetite) tablespace pg_default;

-- Demo accounts hold trading metrics and activity for each demo profile
create table if not exists public.demo_accounts (
  id uuid not null,
  pnl numeric null default 0,
  currency text null default 'USD',
  trades_count integer null default 0,
  last_activity_at timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  constraint demo_accounts_pkey primary key (id),
  constraint demo_accounts_id_fkey foreign key (id) references demo_profiles (id) on delete cascade
) tablespace pg_default;

-- Trigger to auto-create demo_accounts when a demo profile is inserted
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
