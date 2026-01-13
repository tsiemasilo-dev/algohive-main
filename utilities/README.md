# Alpaca Strategy Metrics Utility

This utility synchronizes strategy metrics stored in Supabase with latest Alpaca market data.

## What it does

- Pulls **daily bar data** for every Alpaca-sourced strategy between the last stored date and today.
- Computes **daily returns** per symbol and aggregates them into **portfolio-level daily performance** using portfolio weights.
- Rebuilds common **time-window series** (1m, 3m, 6m, 1y, 3y, YTD) from the combined historical series.
- Generates **calendar return rows** and a **performance summary** (best/worst day, YTD, stability tiers, etc.).
- Updates Supabase `strategy_metrics` with refreshed series, calendar returns, performance summary, and latest `daily_change_pct` per holding.

## Key flows

1. **Strategy discovery**: `load_alpaca_strategies()` reads all strategy IDs whose `data_source` is `Alpaca`.
2. **Bar ingestion**: `fetch_daily_bars_range()` requests Alpaca's `/v2/stocks/bars` endpoint with retry/backoff via `safe_get()`.
3. **Return math**:
   - `build_symbol_closes()` extracts close prices per date.
   - `compute_symbol_daily_returns()` derives day-over-day percentage changes.
   - `compute_portfolio_daily_returns()` weights symbol returns by `weight_pct` from holdings.
4. **Analytics**:
   - `build_all_windows()` slices the full series into time windows.
   - `build_calendar_returns()` converts the series into year/month/day rows.
   - `build_perf_summary()` calculates volatility-driven `risk_level`, stability metrics, best/worst days, YTD, and averages.
5. **Persistence**: `save_strategy_metrics()` writes the refreshed payload back to Supabase.

## Running it

Ensure the Supabase and Alpaca credentials in `alpaca_metrics.py` are valid, then execute:

```bash
python utilities/alpaca_metrics.py
```

The script prints progress per strategy and will retry failed Alpaca requests with exponential backoff.
