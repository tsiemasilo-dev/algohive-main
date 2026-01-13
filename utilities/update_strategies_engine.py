import os
import time
import datetime as dt
from typing import Dict, List, Any, Tuple
from supabase import create_client, Client
from statistics import pstdev

# ==========================
# CONFIG
# ==========================
SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODExMjU0NSwiZXhwIjoyMDczNjg4NTQ1fQ.FUyd9yCRrHYv5V5YrKup9_OI3n01aCfxS3_MxReLxBM"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ================ UNIVERSE HELPERS ===================

def build_symbol_pct_from_universe(
    symbols: List[str],
    start_date: dt.date | None,
    end_date: dt.date | None,
) -> Dict[str, Dict[str, float]]:
    """
    For a list of symbols, pull their closes_30d from trading_universe
    and return: { symbol: { 'YYYY-MM-DD': pct_decimal } }, filtered
    strictly AFTER (start_date - 1 day) effectively:
      - if start_date is not None, we include that date and after
      - up to end_date inclusive.
    """
    if not symbols:
        return {}

    print(f"[INFO] Fetching trading_universe data for symbols: {symbols}")

    resp = (
        supabase.table("trading_universe")
        .select("symbol, closes_30d")
        .in_("symbol", symbols)
        .execute()
    )
    rows = resp.data or []

    symbol_map: Dict[str, Dict[str, float]] = {}

    for row in rows:
        symbol = row.get("symbol")
        if not symbol:
            continue

        entries = row.get("closes_30d") or []
        if not isinstance(entries, list):
            continue

        date_to_pct: Dict[str, float] = {}

        for e in entries:
            if not isinstance(e, dict):
                continue
            date_str = e.get("date")
            pct = e.get("pct")
            if date_str is None or pct is None:
                continue

            try:
                d = dt.date.fromisoformat(date_str)
            except Exception:
                continue

            # allow reloading for the existing last date
            if start_date and d < start_date:
                continue
            if end_date and d > end_date:
                continue

            try:
                date_to_pct[date_str] = float(pct)
            except (TypeError, ValueError):
                continue

        symbol_map[symbol] = date_to_pct

    return symbol_map


def build_symbol_intraday_from_universe(symbols: List[str]) -> Dict[str, Dict[str, float]]:
    """
    Pull intraday pct history (ts -> pct_decimal) from trading_universe
    for the given symbols.
    """
    if not symbols:
        return {}

    print(f"[INFO] Fetching intraday trading_universe data for symbols: {symbols}")

    resp = (
        supabase.table("trading_universe")
        .select("symbol, intraday")
        .in_("symbol", symbols)
        .execute()
    )
    rows = resp.data or []

    symbol_map: Dict[str, Dict[str, float]] = {}

    for row in rows:
        symbol = row.get("symbol")
        if not symbol:
            continue

        entries = row.get("intraday") or []
        if not isinstance(entries, list):
            continue

        ts_to_pct: Dict[str, float] = {}

        for e in entries:
            if not isinstance(e, dict):
                continue
            ts_str = e.get("ts")
            pct = e.get("pct")

            if ts_str is None or pct is None:
                continue

            try:
                # validate ts
                dt.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                ts_to_pct[ts_str] = float(pct)
            except Exception:
                continue

        symbol_map[symbol] = ts_to_pct

    return symbol_map


def compute_weighted_daily_series_from_universe(
    weights: Dict[str, float],
    symbol_pct_map: Dict[str, Dict[str, float]],
) -> List[Dict[str, Any]]:
    """
    Given normalised weights and {symbol: {date: pct_decimal}} from trading_universe,
    compute portfolio daily pct per date: sum(weight * pct_symbol(date)).
    pct values here are still decimals (0.01 == 1%).
    """
    all_dates: set[str] = set()
    for series in symbol_pct_map.values():
        all_dates.update(series.keys())

    if not all_dates:
        return []

    series: List[Dict[str, Any]] = []

    for date_str in sorted(all_dates):
        total_pct = 0.0
        for sym, w in weights.items():
            pct_map = symbol_pct_map.get(sym, {})
            if date_str in pct_map:
                total_pct += w * pct_map[date_str]
        series.append({"date": date_str, "pct": float(total_pct)})

    return series


def compute_weighted_intraday_series_from_universe(
    weights: Dict[str, float],
    symbol_intraday_map: Dict[str, Dict[str, float]],
) -> List[Dict[str, Any]]:
    """
    Combine intraday pct entries (decimal) by timestamp across symbols
    using the provided weights. Output entries keep the timestamp in the
    "date" field for consistency with strategy_metrics schema.
    """

    all_ts: set[str] = set()
    for series in symbol_intraday_map.values():
        all_ts.update(series.keys())

    if not all_ts:
        return []

    def _sort_key(ts: str) -> dt.datetime:
        try:
            return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return dt.datetime.min.replace(tzinfo=dt.timezone.utc)

    series: List[Dict[str, Any]] = []

    for ts in sorted(all_ts, key=_sort_key):
        total_pct = 0.0
        for sym, w in weights.items():
            pct_map = symbol_intraday_map.get(sym, {})
            if ts in pct_map:
                total_pct += w * pct_map[ts]
        # store timestamp string under "date" as requested
        series.append({"date": ts, "pct": float(total_pct)})

    return series


# ================ STATS HELPERS ===================

def build_window_series(series_all: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    From full series_all (sorted), build all time-window series.
    series_all uses pct in decimal space (0.01 == 1%).
    """
    if not series_all:
        return {
            "series_1d": [],
            "series_1m": [],
            "series_3m": [],
            "series_6m": [],
            "series_1y": [],
            "series_3y": [],
            "series_ytd": [],
        }

    today = now_utc().date()
    one_month_ago = today - dt.timedelta(days=30)
    three_months_ago = today - dt.timedelta(days=90)
    six_months_ago = today - dt.timedelta(days=180)
    one_year_ago = today - dt.timedelta(days=365)
    three_years_ago = today - dt.timedelta(days=3 * 365)
    ytd_start = dt.date(today.year, 1, 1)

    def filter_from(date_cutoff: dt.date) -> List[Dict[str, Any]]:
        cutoff_str = date_cutoff.isoformat()
        return [e for e in series_all if e.get("date", "") >= cutoff_str]

    series_1d = series_all[-1:]  # last point only
    series_1m = filter_from(one_month_ago)
    series_3m = filter_from(three_months_ago)
    series_6m = filter_from(six_months_ago)
    series_1y = filter_from(one_year_ago)
    series_3y = filter_from(three_years_ago)
    series_ytd = filter_from(ytd_start)

    return {
        "series_1d": series_1d,
        "series_1m": series_1m,
        "series_3m": series_3m,
        "series_6m": series_6m,
        "series_1y": series_1y,
        "series_3y": series_3y,
        "series_ytd": series_ytd,
    }


def _series_to_date_returns(series_all: List[Dict[str, Any]]) -> List[Tuple[dt.date, float]]:
    data: List[Tuple[dt.date, float]] = []
    for e in series_all:
        if not isinstance(e, dict):
            continue
        d_str = e.get("date")
        pct = e.get("pct")
        if d_str is None or pct is None:
            continue
        try:
            d = dt.date.fromisoformat(d_str)
            r = float(pct)  # still decimal
        except Exception:
            continue
        data.append((d, r))
    data.sort(key=lambda x: x[0])
    return data


def compute_perf_summary(series_all: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build perf_summary dict from series_all.
    All *_pct fields here are in "percent space": 9.0 == 9% not 0.09.
    """
    data = _series_to_date_returns(series_all)
    if not data:
        return {}

    dates = [d for d, _ in data]
    rets = [r for _, r in data]  # decimals

    total_days = len(rets)

    # best / worst days
    best_idx = max(range(total_days), key=lambda i: rets[i])
    worst_idx = min(range(total_days), key=lambda i: rets[i])

    best_day_pct = rets[best_idx] * 100.0
    worst_day_pct = rets[worst_idx] * 100.0
    best_day_date = dates[best_idx].isoformat()
    worst_day_date = dates[worst_idx].isoformat()

    days_positive = sum(1 for r in rets if r > 0)
    days_negative = sum(1 for r in rets if r < 0)

    positive_days_pct = (days_positive / total_days) * 100.0
    negative_days_pct = (days_negative / total_days) * 100.0

    avg_daily_return_pct = (sum(rets) / total_days) * 100.0

    # daily vol in percent space
    if len(rets) > 1:
        daily_vol_pct = pstdev(rets) * 100.0
    else:
        daily_vol_pct = 0.0

    # YTD cumulative return (product of daily returns)
    today = now_utc().date()
    ytd_start = dt.date(today.year, 1, 1)
    ytd_rets = [r for d, r in data if ytd_start <= d <= today]

    if ytd_rets:
        growth = 1.0
        for r in ytd_rets:
            growth *= (1.0 + r)
        ytd_return_pct = (growth - 1.0) * 100.0
    else:
        ytd_return_pct = 0.0

    # stability components
    abs_returns_pct = [abs(r) * 100.0 for r in rets]
    if abs_returns_pct:
        abs_returns_pct_sorted = sorted(abs_returns_pct)
        typical_day_pct = abs_returns_pct_sorted[len(abs_returns_pct_sorted) // 2]
    else:
        typical_day_pct = 0.0

    k = 25.0
    # simple stability score: lower vol => higher stability
    stability_numeric = max(0.0, min(100.0, 100.0 - daily_vol_pct))

    if stability_numeric >= 75.0:
        stability_tier = "Stable"
        risk_level = "Conservative"
    elif stability_numeric >= 50.0:
        stability_tier = "Mixed"
        risk_level = "Balanced"
    else:
        stability_tier = "Aggressive"
        risk_level = "Aggressive"

    return {
        "risk_level": risk_level,
        "total_days": total_days,
        "best_day_pct": best_day_pct,
        "best_day_date": best_day_date,
        "days_negative": days_negative,
        "days_positive": days_positive,
        "worst_day_pct": worst_day_pct,
        "stability_tier": stability_tier,
        "worst_day_date": worst_day_date,
        "ytd_return_pct": ytd_return_pct,
        "negative_days_pct": negative_days_pct,
        "positive_days_pct": positive_days_pct,
        "stability_numeric": stability_numeric,
        "avg_daily_return_pct": avg_daily_return_pct,
        "stability_components": {
            "k": k,
            "worst_day_pct": worst_day_pct,
            "typical_day_pct": typical_day_pct,
        },
    }


def build_calendar_returns(series_all: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build calendar_returns as list of:
    {
      "year": 2024,
      "month": 12,
      "day": 4,
      "pct": -9.3429  # percent, not decimal
    }
    from series_all which is in decimal space.
    """
    data = _series_to_date_returns(series_all)
    result: List[Dict[str, Any]] = []

    for d, r in data:
        result.append({
            "year": d.year,
            "month": d.month,
            "day": d.day,
            "pct": r * 100.0,  # convert decimal -> percent
        })

    return result


# ================ MAIN ENGINE ===================

def update_strategy_metrics_from_universe():
    print("[INFO] Fetching strategy_metrics rows...")

    resp = supabase.table("strategy_metrics").select("*").execute()
    rows = resp.data or []

    print(f"[INFO] Found {len(rows)} strategies")

    today = now_utc().date()
    default_lookback_start = today - dt.timedelta(days=3 * 365)

    for row in rows:
        strategy_id = row.get("strategy_id")
        if not strategy_id:
            continue

        holdings = row.get("portfolio_holdings") or []
        if not isinstance(holdings, list) or not holdings:
            print(f"[INFO] Strategy {strategy_id} has no holdings, skipping")
            continue

        print(f"[INFO] Updating strategy {strategy_id}")

        # build weights from holdings
        raw_weights: Dict[str, float] = {}
        total_weight = 0.0

        for asset in holdings:
            if not isinstance(asset, dict):
                continue
            symbol = asset.get("symbol")
            w_raw = asset.get("weight_pct", 0.0)
            try:
                w = float(w_raw)
            except (TypeError, ValueError):
                continue

            if symbol and w > 0:
                raw_weights[symbol] = raw_weights.get(symbol, 0.0) + w
                total_weight += w

        if total_weight <= 0:
            print(f"[WARN] Strategy {strategy_id} has non_positive total weight, skipping")
            continue

        weights: Dict[str, float] = {sym: w / total_weight for sym, w in raw_weights.items()}

        # existing series_all
        series_all = row.get("series_all") or []
        if not isinstance(series_all, list):
            series_all = []

        try:
            series_all.sort(key=lambda x: x.get("date", ""))
        except Exception as e:
            print(f"[WARN] Could not sort existing series_all for {strategy_id}: {e}")

        # last loaded date
        if series_all:
            last_date_str = series_all[-1].get("date")
            try:
                last_date = dt.date.fromisoformat(last_date_str)
            except Exception:
                last_date = default_lookback_start
        else:
            last_date = None

        start_date = last_date if last_date else None
        end_date = today

        symbol_pct_map = build_symbol_pct_from_universe(
            symbols=list(weights.keys()),
            start_date=start_date,
            end_date=end_date,
        )

        symbol_intraday_map = build_symbol_intraday_from_universe(list(weights.keys()))

        new_series = compute_weighted_daily_series_from_universe(weights, symbol_pct_map)
        print(f"[INFO] Strategy {strategy_id}: {len(new_series)} new daily points from universe")

        intraday_series = compute_weighted_intraday_series_from_universe(
            weights, symbol_intraday_map
        )
        if intraday_series:
            print(
                f"[INFO] Strategy {strategy_id}: {len(intraday_series)} intraday points from universe"
            )

        # merge with existing series_all safely
        series_map: Dict[str, float] = {}

        for e in series_all:
            if not isinstance(e, dict):
                continue
            d_str = e.get("date")
            p_raw = e.get("pct")
            if d_str is None or p_raw is None:
                continue
            try:
                p = float(p_raw)
            except (TypeError, ValueError):
                continue
            series_map[d_str] = p

        for e in new_series:
            if not isinstance(e, dict):
                continue
            d_str = e.get("date")
            p_raw = e.get("pct")
            if d_str is None or p_raw is None:
                continue
            try:
                p = float(p_raw)
            except (TypeError, ValueError):
                continue
            # overwrite for that date (so today's pct gets refreshed)
            series_map[d_str] = p

        series_all = [
            {"date": d, "pct": p}
            for d, p in sorted(series_map.items())
        ]

        # ===== NEW BIT: portfolio_holdings.daily_change_pct in percent =====
        # Use latest daily pct per symbol from symbol_pct_map and store as percent (3.0 == 3%)
        updated_holdings: List[Dict[str, Any]] = []
        for asset in holdings:
            if not isinstance(asset, dict):
                continue
            sym = asset.get("symbol")
            asset_copy = dict(asset)
            daily_pct_decimal = 0.0
            if sym in symbol_pct_map:
                sym_map = symbol_pct_map[sym]
                if sym_map:
                    # latest date for this symbol
                    last_sym_date = max(sym_map.keys())
                    daily_pct_decimal = sym_map[last_sym_date]
            # convert decimal → percent
            asset_copy["daily_change_pct"] = daily_pct_decimal * 100.0
            updated_holdings.append(asset_copy)
        # ===================================================================

        # derive windows, perf_summary, calendar_returns
        windows = build_window_series(series_all)
        perf_summary = compute_perf_summary(series_all)
        calendar_returns = build_calendar_returns(series_all)

        update_payload = {
            "series_all": series_all,
            # override 1d with intraday history when available, otherwise keep last daily point
            "series_1d": intraday_series if intraday_series else windows["series_1d"],
            "series_1m": windows["series_1m"],
            "series_3m": windows["series_3m"],
            "series_6m": windows["series_6m"],
            "series_1y": windows["series_1y"],
            "series_3y": windows["series_3y"],
            "series_ytd": windows["series_ytd"],
            "perf_summary": perf_summary,
            "calendar_returns": calendar_returns,
            "portfolio_holdings": updated_holdings,  # updated with daily_change_pct as percent
            "asof_date": today.isoformat(),
            "updated_at": now_utc().isoformat(),
        }

        supabase.table("strategy_metrics").update(update_payload).eq("strategy_id", strategy_id).execute()
        print(f"[INFO] Strategy {strategy_id} updated. series_all length: {len(series_all)}")

    print("[INFO] Done updating strategy_metrics from trading_universe.")


# ================== SCHEDULER LOOP =====================

if __name__ == "__main__":
    print("[ENGINE] Strategy metrics engine started — running every 20 minutes.")
    while True:
        try:
            print(f"\n[ENGINE] Run at {now_utc().isoformat()}")
            update_strategy_metrics_from_universe()
        except Exception as e:
            print(f"[ERROR] Strategy engine run failed: {e}")
        # sleep 20 minutes
        time.sleep(1200)
