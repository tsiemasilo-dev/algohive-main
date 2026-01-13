import os
import time
import datetime as dt
from typing import Dict, List, Any, Tuple
from supabase import create_client, Client

# ==========================
# CONFIG
# ==========================

SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODExMjU0NSwiZXhwIjoyMDczNjg4NTQ1fQ.FUyd9yCRrHYv5V5YrKup9_OI3n01aCfxS3_MxReLxBM"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ================ HELPERS ===================

def _strategy_series_to_date_returns(series_all: List[Dict[str, Any]]) -> List[Tuple[dt.date, float]]:
    """
    Turn strategy_metrics.series_all (list of {date, pct}) into
    sorted list of (date_obj, pct_decimal).
    """
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
            r = float(pct)  # decimal, e.g. 0.01 == 1%
        except Exception:
            continue
        data.append((d, r))
    data.sort(key=lambda x: x[0])
    return data


def build_value_window_series(series_all: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    From allocation series_all (list of {date, value}), build 1d,1m,3m,6m,1y,3y,ytd.
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


# ================ MAIN ENGINE ===================

def update_demo_allocations_from_strategies():
    print("[INFO] Loading strategy_metrics (series_all)...")

    # Get strategy returns once, build a map: strategy_id -> [(date, pct_decimal)]
    strat_resp = supabase.table("strategy_metrics").select("strategy_id, series_all").execute()
    strat_rows = strat_resp.data or []

    strategy_returns: Dict[str, List[Tuple[dt.date, float]]] = {}
    for row in strat_rows:
        sid = row.get("strategy_id")
        if not sid:
            continue
        series_all = row.get("series_all") or []
        if not isinstance(series_all, list):
            series_all = []
        strategy_returns[sid] = _strategy_series_to_date_returns(series_all)

    print(f"[INFO] Loaded {len(strategy_returns)} strategies with return series")

    print("[INFO] Fetching demo_allocations rows...")
    alloc_resp = supabase.table("demo_allocations").select("*").execute()
    alloc_rows = alloc_resp.data or []

    print(f"[INFO] Found {len(alloc_rows)} demo allocations")

    today = now_utc().date()

    for row in alloc_rows:
        alloc_id = row.get("id")
        strategy_id = row.get("strategy_id")
        amount_invested_raw = row.get("amount_invested")
        start_date_raw = row.get("start_date")

        if not alloc_id or not strategy_id or amount_invested_raw is None or start_date_raw is None:
            continue

        try:
            amount_invested = float(amount_invested_raw)
        except (TypeError, ValueError):
            print(f"[WARN] Allocation {alloc_id}: invalid amount_invested, skipping")
            continue

        try:
            start_date = dt.date.fromisoformat(start_date_raw)
        except Exception:
            print(f"[WARN] Allocation {alloc_id}: invalid start_date, skipping")
            continue

        print(f"[INFO] Updating demo allocation {alloc_id} (strategy {strategy_id})")

        strat_series = strategy_returns.get(strategy_id)
        if not strat_series:
            print(f"[INFO] Allocation {alloc_id}: no strategy series found, skipping")
            continue

        # Filter strategy daily returns for dates >= start_date and <= today
        strat_rets = [(d, r) for (d, r) in strat_series if d >= start_date and d <= today]
        if not strat_rets:
            print(f"[INFO] Allocation {alloc_id}: no strategy returns after start_date, skipping")
            continue

        # Build allocation value path from scratch every time
        value_series: List[Dict[str, Any]] = []
        prev_value = amount_invested

        for d, r in strat_rets:
            # r is decimal, e.g. 0.01 == 1%
            prev_value = prev_value * (1.0 + r)
            value_series.append({
                "date": d.isoformat(),
                "value": round(prev_value, 2),
            })

        if not value_series:
            print(f"[INFO] Allocation {alloc_id}: no value series built, skipping update")
            continue

        # Ensure sorted
        try:
            value_series.sort(key=lambda x: x.get("date", ""))
        except Exception as e:
            print(f"[WARN] Allocation {alloc_id}: could not sort series_all: {e}")

        # Windows
        windows = build_value_window_series(value_series)

        # Latest
        latest_value = value_series[-1]["value"]
        if amount_invested > 0:
            latest_return_pct = (latest_value / amount_invested) - 1.0  # decimal: 0.09 == 9%
        else:
            latest_return_pct = None

        update_payload = {
            "series_all": value_series,
            "series_1d": windows["series_1d"],
            "series_1m": windows["series_1m"],
            "series_3m": windows["series_3m"],
            "series_6m": windows["series_6m"],
            "series_1y": windows["series_1y"],
            "series_3y": windows["series_3y"],
            "series_ytd": windows["series_ytd"],
            "latest_value": latest_value,
            "latest_return_pct": latest_return_pct,
        }

        supabase.table("demo_allocations").update(update_payload).eq("id", alloc_id).execute()
        print(f"[INFO] Allocation {alloc_id} updated. series_all length: {len(value_series)}")

    print("[INFO] Done updating demo_allocations.")


# ================ SCHEDULER LOOP ===================

if __name__ == "__main__":
    print("[ENGINE] Demo allocations engine started. Running every 10 minutes.")
    while True:
        try:
            print(f"\n[ENGINE] Run at {now_utc().isoformat()}")
            update_demo_allocations_from_strategies()
        except Exception as e:
            print(f"[ERROR] Engine run failed: {e}")
        # sleep 10 minutes
        time.sleep(600)
