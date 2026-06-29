create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_blank check (length(trim(name)) > 0),
  constraint workspaces_user_name_unique unique (user_id, name)
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlist_items_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint watchlist_items_workspace_ticker_unique unique (workspace_id, ticker)
);

create table public.assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null,
  required_return numeric(8, 6) not null,
  estimated_growth numeric(8, 6) not null,
  growth_source text not null default 'zacks',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assumptions_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint assumptions_growth_source check (growth_source in ('manual', 'zacks', 'analyst')),
  constraint assumptions_required_return_reasonable check (required_return > -1 and required_return < 2),
  constraint assumptions_estimated_growth_reasonable check (estimated_growth > -1 and estimated_growth < 2),
  constraint assumptions_user_ticker_unique unique (user_id, ticker)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint notes_body_length check (char_length(body) <= 3000),
  constraint notes_user_ticker_unique unique (user_id, ticker)
);

create table public.analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  currency text not null,
  data_source text,
  current_price numeric,
  intrinsic_value numeric,
  decision_rating text,
  analysis jsonb not null,
  created_at timestamptz not null default now(),
  constraint analysis_snapshots_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint analysis_snapshots_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint analysis_snapshots_data_source check (data_source is null or data_source in ('fmp', 'yahoo')),
  constraint analysis_snapshots_decision_rating check (
    decision_rating is null
    or decision_rating in ('prime', 'watch', 'neutral', 'avoid', 'incomplete')
  )
);

create table private.provider_cache (
  provider_key text not null,
  ticker text not null,
  payload jsonb not null,
  stored_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (provider_key, ticker),
  constraint provider_cache_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint provider_cache_provider_key_not_blank check (length(trim(provider_key)) > 0),
  constraint provider_cache_payload_object check (jsonb_typeof(payload) = 'object')
);

create index watchlist_items_user_workspace_sort_idx
  on public.watchlist_items (user_id, workspace_id, sort_order, ticker);

create index assumptions_user_ticker_idx
  on public.assumptions (user_id, ticker);

create index notes_user_ticker_idx
  on public.notes (user_id, ticker);

create index analysis_snapshots_user_ticker_created_idx
  on public.analysis_snapshots (user_id, ticker, created_at desc);

create index provider_cache_expires_idx
  on private.provider_cache (expires_at);

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger set_watchlist_items_updated_at
before update on public.watchlist_items
for each row execute function public.set_updated_at();

create trigger set_assumptions_updated_at
before update on public.assumptions
for each row execute function public.set_updated_at();

create trigger set_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.assumptions enable row level security;
alter table public.notes enable row level security;
alter table public.analysis_snapshots enable row level security;
alter table private.provider_cache enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;
grant select, insert, update, delete on public.assumptions to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert on public.analysis_snapshots to authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on private.provider_cache to service_role;

create policy "Users can read own workspaces"
on public.workspaces
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own workspaces"
on public.workspaces
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own workspaces"
on public.workspaces
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own workspaces"
on public.workspaces
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own watchlist items"
on public.watchlist_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own watchlist items"
on public.watchlist_items
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = watchlist_items.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can update own watchlist items"
on public.watchlist_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = watchlist_items.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can delete own watchlist items"
on public.watchlist_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own assumptions"
on public.assumptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can upsert own assumptions"
on public.assumptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own assumptions"
on public.assumptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own assumptions"
on public.assumptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own notes"
on public.notes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can upsert own notes"
on public.notes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own notes"
on public.notes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own notes"
on public.notes
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own analysis snapshots"
on public.analysis_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own analysis snapshots"
on public.analysis_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Service role can manage provider cache"
on private.provider_cache
for all
to service_role
using (true)
with check (true);
