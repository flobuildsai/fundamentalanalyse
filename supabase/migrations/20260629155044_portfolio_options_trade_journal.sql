alter table public.analysis_snapshots
  drop constraint if exists analysis_snapshots_data_source;

alter table public.analysis_snapshots
  add constraint analysis_snapshots_data_source
  check (data_source is null or data_source in ('fmp', 'sec', 'yahoo'));

create table public.valuation_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null,
  required_return numeric(8, 6) not null default 0.15,
  estimated_growth numeric(8, 6) not null,
  growth_source text not null default 'manual',
  exit_multiple numeric(10, 4),
  exit_multiple_source text not null default 'historical_pe',
  current_eps_override numeric,
  eps_basis text not null default 'latest',
  margin_of_safety_target numeric(8, 6) not null default 0.30,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valuation_profiles_ticker_format check (ticker ~ '^[A-Z0-9._-]{1,12}$'),
  constraint valuation_profiles_growth_source check (growth_source in ('manual', 'zacks', 'analyst')),
  constraint valuation_profiles_exit_multiple_source check (exit_multiple_source in ('historical_pe', 'manual', 'capped', 'cyclical_cap')),
  constraint valuation_profiles_eps_basis check (eps_basis in ('latest', 'normalized', 'manual')),
  constraint valuation_profiles_required_return_reasonable check (required_return > -1 and required_return < 2),
  constraint valuation_profiles_estimated_growth_reasonable check (estimated_growth > -1 and estimated_growth < 2),
  constraint valuation_profiles_exit_multiple_positive check (exit_multiple is null or exit_multiple > 0),
  constraint valuation_profiles_margin_target_reasonable check (margin_of_safety_target >= 0 and margin_of_safety_target <= 0.9),
  constraint valuation_profiles_user_ticker_unique unique (user_id, ticker)
);

create table public.portfolio_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  base_currency text not null default 'USD',
  net_liquidation numeric not null,
  net_liquidation_usd numeric,
  moderate_utilization numeric not null default 1.25,
  critical_utilization numeric not null default 2.0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_settings_currency_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint portfolio_settings_net_liq_positive check (net_liquidation > 0),
  constraint portfolio_settings_net_liq_usd_positive check (net_liquidation_usd is null or net_liquidation_usd > 0),
  constraint portfolio_settings_utilization_positive check (moderate_utilization > 0 and critical_utilization >= moderate_utilization),
  constraint portfolio_settings_workspace_unique unique (workspace_id)
);

create table public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  asset_class text not null,
  strategy text,
  direction text,
  quantity numeric,
  underlying_price numeric,
  short_strike numeric,
  long_strike numeric,
  expiry date,
  notional numeric,
  buying_power_used numeric,
  weight numeric,
  comment text,
  source text not null default 'manual',
  data_quality text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_positions_symbol_format check (symbol ~ '^[A-Z0-9._-]{1,16}$'),
  constraint portfolio_positions_asset_class check (asset_class in ('stock', 'equity_option', 'future_option', 'cash')),
  constraint portfolio_positions_direction check (direction is null or direction in ('long', 'short', 'spread', 'cash')),
  constraint portfolio_positions_non_negative_values check (
    (quantity is null or quantity >= 0)
    and (underlying_price is null or underlying_price >= 0)
    and (short_strike is null or short_strike >= 0)
    and (long_strike is null or long_strike >= 0)
    and (notional is null or notional >= 0)
    and (buying_power_used is null or buying_power_used >= 0)
  ),
  constraint portfolio_positions_weight_reasonable check (weight is null or (weight > -10 and weight < 10)),
  constraint portfolio_positions_comment_length check (comment is null or char_length(comment) <= 1500),
  constraint portfolio_positions_data_quality check (data_quality in ('ok', 'warning', 'placeholder_or_invalid', 'invalid'))
);

create table public.option_strategy_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  default_buyback_target_pct numeric not null default 0.20,
  default_multiplier numeric not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_strategy_templates_name_not_blank check (length(trim(name)) > 0),
  constraint option_strategy_templates_kind check (kind in ('cash_secured_put', 'short_put', 'covered_call', 'bull_put_spread', 'bear_call_spread')),
  constraint option_strategy_templates_buyback_target check (default_buyback_target_pct >= 0 and default_buyback_target_pct <= 1),
  constraint option_strategy_templates_multiplier_positive check (default_multiplier > 0),
  constraint option_strategy_templates_notes_length check (notes is null or char_length(notes) <= 1500),
  constraint option_strategy_templates_user_kind_unique unique (user_id, kind)
);

create table public.option_trades (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_kind text not null,
  underlying text not null,
  opened_at date not null,
  expiry date not null,
  earnings_note text,
  underlying_price_open numeric,
  short_strike numeric not null,
  long_strike numeric,
  spread_width numeric,
  contracts numeric not null default 1,
  multiplier numeric not null default 100,
  premium numeric not null,
  fees numeric not null default 0,
  net_premium numeric,
  total_premium numeric,
  total_risk numeric,
  distance_to_price_pct numeric,
  capital_at_risk numeric,
  capital_at_risk_per_share numeric,
  return_on_risk numeric,
  annualized_return numeric,
  breakeven numeric,
  buyback_target_pct numeric not null default 0.20,
  buyback_target_price numeric,
  closed_at date,
  actual_buyback_price numeric,
  realized_annualized_return numeric,
  status text not null default 'open',
  data_quality text not null default 'ok',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_trades_underlying_format check (underlying ~ '^[A-Z0-9._-]{1,16}$'),
  constraint option_trades_strategy_kind check (strategy_kind in ('cash_secured_put', 'short_put', 'covered_call', 'bull_put_spread', 'bear_call_spread')),
  constraint option_trades_expiry_after_open check (expiry > opened_at),
  constraint option_trades_positive_values check (
    (underlying_price_open is null or underlying_price_open > 0)
    and short_strike > 0
    and (long_strike is null or long_strike > 0)
    and (spread_width is null or spread_width > 0)
    and contracts > 0
    and multiplier > 0
    and premium > 0
    and fees >= 0
    and (total_premium is null or total_premium >= 0)
    and (total_risk is null or total_risk >= 0)
    and (capital_at_risk is null or capital_at_risk >= 0)
    and (capital_at_risk_per_share is null or capital_at_risk_per_share >= 0)
    and (actual_buyback_price is null or actual_buyback_price >= 0)
  ),
  constraint option_trades_buyback_target check (buyback_target_pct >= 0 and buyback_target_pct <= 1),
  constraint option_trades_status check (status in ('open', 'closed', 'expired', 'assigned', 'invalid')),
  constraint option_trades_data_quality check (data_quality in ('ok', 'warning', 'placeholder_or_invalid', 'invalid')),
  constraint option_trades_earnings_note_length check (earnings_note is null or char_length(earnings_note) <= 500)
);

create index valuation_profiles_user_ticker_idx
  on public.valuation_profiles (user_id, ticker);

create index portfolio_settings_user_workspace_idx
  on public.portfolio_settings (user_id, workspace_id);

create index portfolio_positions_user_workspace_symbol_idx
  on public.portfolio_positions (user_id, workspace_id, symbol);

create index option_strategy_templates_user_kind_idx
  on public.option_strategy_templates (user_id, kind);

create index option_trades_user_workspace_opened_idx
  on public.option_trades (user_id, workspace_id, opened_at desc);

create index option_trades_user_underlying_idx
  on public.option_trades (user_id, underlying);

create trigger set_valuation_profiles_updated_at
before update on public.valuation_profiles
for each row execute function public.set_updated_at();

create trigger set_portfolio_settings_updated_at
before update on public.portfolio_settings
for each row execute function public.set_updated_at();

create trigger set_portfolio_positions_updated_at
before update on public.portfolio_positions
for each row execute function public.set_updated_at();

create trigger set_option_strategy_templates_updated_at
before update on public.option_strategy_templates
for each row execute function public.set_updated_at();

create trigger set_option_trades_updated_at
before update on public.option_trades
for each row execute function public.set_updated_at();

alter table public.valuation_profiles enable row level security;
alter table public.portfolio_settings enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.option_strategy_templates enable row level security;
alter table public.option_trades enable row level security;

grant select, insert, update, delete on public.valuation_profiles to authenticated;
grant select, insert, update, delete on public.portfolio_settings to authenticated;
grant select, insert, update, delete on public.portfolio_positions to authenticated;
grant select, insert, update, delete on public.option_strategy_templates to authenticated;
grant select, insert, update, delete on public.option_trades to authenticated;

create policy "Users can read own valuation profiles"
on public.valuation_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own valuation profiles"
on public.valuation_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own valuation profiles"
on public.valuation_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own valuation profiles"
on public.valuation_profiles
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own portfolio settings"
on public.portfolio_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own portfolio settings"
on public.portfolio_settings
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = portfolio_settings.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can update own portfolio settings"
on public.portfolio_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = portfolio_settings.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can delete own portfolio settings"
on public.portfolio_settings
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own portfolio positions"
on public.portfolio_positions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own portfolio positions"
on public.portfolio_positions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = portfolio_positions.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can update own portfolio positions"
on public.portfolio_positions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = portfolio_positions.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can delete own portfolio positions"
on public.portfolio_positions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own option strategy templates"
on public.option_strategy_templates
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own option strategy templates"
on public.option_strategy_templates
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own option strategy templates"
on public.option_strategy_templates
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own option strategy templates"
on public.option_strategy_templates
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own option trades"
on public.option_trades
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own option trades"
on public.option_trades
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = option_trades.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can update own option trades"
on public.option_trades
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.workspaces
    where workspaces.id = option_trades.workspace_id
      and workspaces.user_id = (select auth.uid())
  )
);

create policy "Users can delete own option trades"
on public.option_trades
for delete
to authenticated
using ((select auth.uid()) = user_id);
