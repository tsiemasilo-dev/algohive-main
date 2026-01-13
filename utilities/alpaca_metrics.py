import datetime as dt
import math
import random
import time
from collections import defaultdict

import requests
from supabase import Client, create_client

# ===========================
# CONFIG
# ===========================

SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODExMjU0NSwiZXhwIjoyMDczNjg4NTQ1fQ.FUyd9yCRrHYv5V5YrKup9_OI3n01aCfxS3_MxReLxBM"
)
APCA_API_KEY_ID = "PKARM7PKO5AYOTHGHBAEYNLXV2"
APCA_API_SECRET_KEY = "AfVJWotnuyuSE2LBqFhX744zia9qc65xPSwbGEvCEC1T"

ALPACA_DATA_BASE = "https://data.alpaca.markets"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ===========================
# HTTP / ALPACA HELPERS
# ===========================


def safe_get(url, headers, params, retries=5):
    """Requests GET with retries + backoff."""
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            resp.raise_for_status()
            return resp
        except Exception as e:
            wait = (2 ** attempt) + random.uniform(0, 1)
            print(f"[Retry {attempt+1}] Error: {e} — waiting {wait:.2f}s")
            time.sleep(wait)
    raise RuntimeError("Max retries exceeded for Alpaca request")


def fetch_daily_bars_range(symbols, start_date: dt.date, end_date: dt.date):
    """
    Fetch daily bars for all symbols between [start_date, end_date].

    Uses:
      /v2/stocks/bars?symbols=...&timeframe=1D&start=...&end=...&limit=1000&adjustment=raw&feed=iex&sort=asc

    Returns:
      dict: { symbol: [ {t, o, h, l, c, v, ...}, ... ] } (sorted oldest -> newest)
    """
    symbols = list({s for s in symbols if s})
    if not symbols:
        return {}

    start_iso = start_date.strftime("%Y-%m-%d") + "T00:00:00Z"
    end_iso = end_date.strftime("%Y-%m-%d") + "T00:00:00Z"

    url = f"{ALPACA_DATA_BASE}/v2/stocks/bars"
    params = {
        "symbols": ",".join(symbols),
        "timeframe": "1D",
        "start": start_iso,
        "end": end_iso,
        "limit": 1000,
        "adjustment": "raw",
        "feed": "iex",
        "sort": "asc",
    }
    headers = {
        "accept": "application/json",
        "APCA-API-KEY-ID": APCA_API_KEY_ID,
        "APCA-API-SECRET-KEY": APCA_API_SECRET_KEY,
    }

    resp = safe_get(url, headers=headers, params=params)
    data = resp.json()

    bars_by_symbol = data.get("bars") or {}
    result = {}

    if isinstance(bars_by_symbol, dict):
        for sym, bar_list in bars_by_symbol.items():
            if not bar_list:
                continue
            # Ensure sorted by time
            bar_list = sorted(bar_list, key=lambda b: b.get("t"))
            result[sym] = bar_list

    return result


# ===========================
# SUPABASE HELPERS
# ===========================


def load_alpaca_strategies():
    """Return strategies that use Alpaca as data source."""
    res = (
        supabase.table("strategies").select("id").eq("data_source", "Alpaca").execute()
    )
    return res.data or []


def load_strategy_metrics(strategy_id: str):
    res = (
        supabase.table("strategy_metrics")
        .select(
            "portfolio_holdings, series_all, series_1m, series_3m, series_6m, "
            "series_1y, series_3y, series_ytd, calendar_returns, perf_summary"
        )
        .eq("strategy_id", strategy_id)
        .single()
        .execute()
    )
    return res.data or {}


def save_strategy_metrics(strategy_id: str, payload: dict):
    supabase.table("strategy_metrics").update(payload).eq("strategy_id", strategy_id).execute()


# ===========================
# PORTFOLIO RETURN LOGIC
# ===========================


def build_symbol_closes(bars_by_symbol):
    """
    Convert bars_by_symbol into:
      closes_by_symbol: {symbol: {date: close}}
    """
    closes_by_symbol = {}
    for sym, bar_list in bars_by_symbol.items():
        date_to_close = {}
        for bar in bar_list:
            ts = bar.get("t")
            c = bar.get("c")
            if ts is None or c is None:
                continue
            date_str = str(ts).split("T")[0]
            date_to_close[date_str] = float(c)
        if date_to_close:
            closes_by_symbol[sym] = dict(sorted(date_to_close.items()))
    return closes_by_symbol


def compute_symbol_daily_returns(closes_by_symbol):
    """
    For each symbol, compute its own daily returns:
      {symbol: {date: pct_return_decimal}}

    pct_decimal = (close_t / close_prev) - 1
    """
    ret_by_symbol = {}
    for sym, date_to_close in closes_by_symbol.items():
        dates = sorted(date_to_close.keys())
        if len(dates) < 2:
            continue
        daily = {}
        prev_date = dates[0]
        prev_close = date_to_close[prev_date]
        for d in dates[1:]:
            curr_close = date_to_close[d]
            if prev_close is None or prev_close == 0 or curr_close is None:
                prev_date = d
                prev_close = curr_close
                continue
            r = (curr_close / prev_close) - 1.0
            daily[d] = float(r)
            prev_date = d
            prev_close = curr_close
        if daily:
            ret_by_symbol[sym] = daily
    return ret_by_symbol


def compute_portfolio_daily_returns(ret_by_symbol, holdings):
    """
    Compute portfolio daily returns (weighted) based on symbol daily returns.

    holdings = list of dicts with at least {symbol, weight_pct}

    Returns:
      list of dicts: [{ "date": "YYYY-MM-DD", "pct": decimal }, ...] sorted by date
      and symbol_last_daily: {symbol: last_daily_pct_decimal or None}
    """
    # map symbol -> weight (0–1)
    weights = {}
    for h in holdings:
        sym = h.get("symbol")
        w = h.get("weight_pct")
        if not sym or w is None:
            continue
        try:
            weights[sym] = float(w) / 100.0
        except (TypeError, ValueError):
            continue

    # gather all dates across all symbols
    all_dates_set = set()
    for sym, day_map in ret_by_symbol.items():
        all_dates_set.update(day_map.keys())

    if not all_dates_set:
        return [], {}

    all_dates = sorted(all_dates_set)

    portfolio_series = []
    symbol_last_daily = {}

    for d in all_dates:
        num = 0.0
        den = 0.0
        for sym, day_map in ret_by_symbol.items():
            r = day_map.get(d)
            w = weights.get(sym)
            if r is None or w is None:
                continue
            num += w * r
            den += w
            symbol_last_daily[sym] = r  # will end as last seen day

        if den <= 0:
            continue

        port_r = num / den
        portfolio_series.append({"date": d, "pct": float(port_r)})

    return portfolio_series, symbol_last_daily


# ===========================
# SERIES WINDOW HELPERS
# ===========================


def filter_series_by_date(series_all, start_date: dt.date):
    """Return points with date >= start_date."""
    out = []
    for pt in series_all:
        d_str = pt.get("date")
        if not d_str:
            continue
        try:
            d = dt.date.fromisoformat(d_str)
        except ValueError:
            continue
        if d >= start_date:
            out.append(pt)
    return out


def build_all_windows(series_all):
    """Build 1m, 3m, 6m, 1y, 3y, ytd from series_all."""
    today = dt.date.today()
    out = {
        "series_1m": [],
        "series_3m": [],
        "series_6m": [],
        "series_1y": [],
        "series_3y": [],
        "series_ytd": [],
    }
    if not series_all:
        return out

    out["series_1m"] = filter_series_by_date(series_all, today - dt.timedelta(days=31))
    out["series_3m"] = filter_series_by_date(series_all, today - dt.timedelta(days=93))
    out["series_6m"] = filter_series_by_date(series_all, today - dt.timedelta(days=186))
    out["series_1y"] = filter_series_by_date(series_all, today - dt.timedelta(days=365))
    out["series_3y"] = filter_series_by_date(series_all, today - dt.timedelta(days=365 * 3))

    # YTD
    ytd_start = dt.date(today.year, 1, 1)
    out["series_ytd"] = filter_series_by_date(series_all, ytd_start)

    return out


# ===========================
# CALENDAR RETURNS & PERF SUMMARY (from series_all)
# ===========================


def build_calendar_returns(series_all):
    """
    Build calendar_returns from series_all.

    pct stored as DECIMAL (e.g. 0.01 for 1%).
    """
    cal = []
    for pt in series_all:
        d_str = pt.get("date")
        pct = pt.get("pct")
        if d_str is None or pct is None:
            continue
        try:
            d = dt.date.fromisoformat(d_str)
            pct_val = float(pct)
        except Exception:
            continue
        cal.append(
            {
                "year": d.year,
                "month": d.month,
                "day": d.day,
                "pct": pct_val,  # decimal, NOT percent
            }
        )
    return cal


def build_perf_summary(series_all):
    """
    Build perf_summary based on series_all.
    Uses pct as decimal (e.g. 0.01 for 1%), but stores *_pct fields in percent units.
    """
    if not series_all:
        return {}

    daily = []
    for pt in series_all:
        pct = pt.get("pct")
        d_str = pt.get("date")
        if pct is None or d_str is None:
            continue
        try:
            daily.append((dt.date.fromisoformat(d_str), float(pct)))
        except Exception:
            continue

    if not daily:
        return {}

    daily.sort(key=lambda x: x[0])
    dates = [d for d, _ in daily]
    rets = [r for _, r in daily]

    total_days = len(rets)
    best_idx = max(range(total_days), key=lambda i: rets[i])
    worst_idx = min(range(total_days), key=lambda i: rets[i])

    best_day_pct_dec = rets[best_idx]
    worst_day_pct_dec = rets[worst_idx]

    best_day_date = dates[best_idx].isoformat()
    worst_day_date = dates[worst_idx].isoformat()

    days_positive = sum(1 for r in rets if r > 0)
    days_negative = sum(1 for r in rets if r < 0)

    positive_days_pct = days_positive / total_days * 100.0
    negative_days_pct = days_negative / total_days * 100.0

    avg_daily_return_dec = sum(rets) / total_days
    avg_daily_return_pct = avg_daily_return_dec * 100.0

    # YTD cumulative
    today = dt.date.today()
    ytd_start = dt.date(today.year, 1, 1)
    ytd_rets = [r for (d, r) in daily if d >= ytd_start]
    ytd_cum_dec = 0.0
    if ytd_rets:
        cum = 1.0
        for r in ytd_rets:
            cum *= (1.0 + r)
        ytd_cum_dec = cum - 1.0
    ytd_return_pct = ytd_cum_dec * 100.0

    # std dev of daily returns (decimal)
    if len(rets) > 1:
        mean = avg_daily_return_dec
        var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
        std_dec = math.sqrt(var)
    else:
        std_dec = 0.0

    # risk_level based on volatility
    if std_dec < 0.005:
        risk_level = "Conservative"
    elif std_dec < 0.012:
        risk_level = "Balanced"
    else:
        risk_level = "Aggressive"

    # stability_tier based on distribution of positive vs negative days
    if negative_days_pct < 40:
        stability_tier = "Stable"
    elif negative_days_pct < 55:
        stability_tier = "Mixed"
    else:
        stability_tier = "Volatile"

    # simple stability score 0–100
    volatility_penalty = min(std_dec * 1000.0, 50.0)
    stability_numeric = max(
        0.0,
        min(100.0, 80.0 - volatility_penalty + (positive_days_pct - negative_days_pct) * 0.1),
    )

    k = 25
    tail = rets[-k:] if len(rets) > k else rets
    if tail:
        typical_day_dec = sum(abs(r) for r in tail) / len(tail)
    else:
        typical_day_dec = 0.0
    typical_day_pct = typical_day_dec * 100.0

    summary = {
        "risk_level": risk_level,
        "total_days": total_days,
        "best_day_pct": best_day_pct_dec * 100.0,
        "best_day_date": best_day_date,
        "days_negative": days_negative,
        "days_positive": days_positive,
        "worst_day_pct": worst_day_pct_dec * 100.0,
        "stability_tier": stability_tier,
        "worst_day_date": worst_day_date,
        "ytd_return_pct": ytd_return_pct,
        "negative_days_pct": negative_days_pct,
        "positive_days_pct": positive_days_pct,
        "stability_numeric": stability_numeric,
        "avg_daily_return_pct": avg_daily_return_pct,
        "stability_components": {
            "k": k,
            "worst_day_pct": worst_day_pct_dec * 100.0,
            "typical_day_pct": typical_day_pct,
        },
    }

    return summary


# ===========================
# MAIN STRATEGY ENGINE
# ===========================


def process_strategy(strategy_id: str):
    metrics = load_strategy_metrics(strategy_id)
    holdings = metrics.get("portfolio_holdings") or []
    existing_series_all = metrics.get("series_all") or []

    if not holdings:
        print(f"[WARN] No holdings for strategy {strategy_id}")
        return

    # symbols from holdings
    symbols = [h.get("symbol") for h in holdings if h.get("symbol")]
    if not symbols:
        print(f"[WARN] No symbols in holdings for strategy {strategy_id}")
        return

    # figure last date in existing series_all, if any
    last_date = None
    if existing_series_all:
        try:
            date_strings = [pt.get("date") for pt in existing_series_all if pt.get("date")]
            if date_strings:
                last_date_str = max(date_strings)
                last_date = dt.date.fromisoformat(last_date_str)
        except Exception:
            last_date = None

    today = dt.date.today()

    if last_date is None:
        # no history yet → pull last ~365 days
        start_date = today - dt.timedelta(days=365)
    else:
        # start from the day AFTER the last recorded date
        start_date = last_date + dt.timedelta(days=1)

    end_date = today + dt.timedelta(days=1)

    if start_date >= end_date:
        print(f"[INFO] No new days to fetch for strategy {strategy_id}")
        # still rebuild analytics from existing series_all
        combined_series_all = sorted(existing_series_all, key=lambda x: x.get("date", ""))
    else:
        print(
            f"\n[INFO] Fetching bars for strategy {strategy_id} from {start_date} to {end_date}"
        )

        bars_by_symbol = fetch_daily_bars_range(symbols, start_date, end_date)
        if not bars_by_symbol:
            print(f"[WARN] No bar data from Alpaca for strategy {strategy_id}")
            combined_series_all = sorted(existing_series_all, key=lambda x: x.get("date", ""))
        else:
            closes_by_symbol = build_symbol_closes(bars_by_symbol)
            ret_by_symbol = compute_symbol_daily_returns(closes_by_symbol)

            if not ret_by_symbol:
                print(f"[WARN] No daily returns computed for strategy {strategy_id}")
                combined_series_all = sorted(
                    existing_series_all, key=lambda x: x.get("date", "")
                )
            else:
                # portfolio series for the fetched range
                series_range, symbol_last_daily = compute_portfolio_daily_returns(
                    ret_by_symbol, holdings
                )

                # filter only dates strictly after last_date (if any)
                if last_date is not None:
                    series_range = [
                        pt for pt in series_range if dt.date.fromisoformat(pt["date"]) > last_date
                    ]

                # combine old + new
                combined_series_all = list(existing_series_all) + series_range
                combined_series_all = sorted(
                    combined_series_all, key=lambda x: x.get("date", "")
                )

                # update holdings.daily_change_pct using last_daily from Alpaca range
                updated_holdings = []
                for h in holdings:
                    sym = h.get("symbol")
                    last_r = symbol_last_daily.get(sym)
                    new_h = dict(h)
                    if last_r is None:
                        new_h["daily_change_pct"] = None
                    else:
                        new_h["daily_change_pct"] = float(last_r)
                    updated_holdings.append(new_h)
                holdings = updated_holdings

    if not combined_series_all:
        print(f"[WARN] Empty series_all for strategy {strategy_id}")
        return

    # windows from combined series_all
    windows = build_all_windows(combined_series_all)

    # calendar_returns (decimal pct)
    calendar_returns = build_calendar_returns(combined_series_all)

    # perf_summary from series_all (decimal)
    perf_summary = build_perf_summary(combined_series_all)

    payload = {
        "series_all": combined_series_all,
        "series_1m": windows["series_1m"],
        "series_3m": windows["series_3m"],
        "series_6m": windows["series_6m"],
        "series_1y": windows["series_1y"],
        "series_3y": windows["series_3y"],
        "series_ytd": windows["series_ytd"],
        "calendar_returns": calendar_returns,
        "perf_summary": perf_summary,
        "portfolio_holdings": holdings,
    }

    save_strategy_metrics(strategy_id, payload)
    print(f"[OK] Updated metrics for strategy {strategy_id}")


def main():
    strategies = load_alpaca_strategies()
    print(f"Found {len(strategies)} Alpaca strategies")

    for s in strategies:
        sid = s["id"]
        try:
            process_strategy(sid)
        except Exception as e:
            print(f"[ERROR] Strategy {sid}: {e}")


if __name__ == "__main__":
    main()
