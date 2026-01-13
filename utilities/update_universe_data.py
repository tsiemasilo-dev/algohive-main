import os
import time
import datetime as dt
import requests
from supabase import create_client, Client

# ==========================
# CONFIG
# ==========================

SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODExMjU0NSwiZXhwIjoyMDczNjg4NTQ1fQ.FUyd9yCRrHYv5V5YrKup9_OI3n01aCfxS3_MxReLxBM"

ALPACA_API_KEY = "PKARM7PKO5AYOTHGHBAEYNLXV2"
ALPACA_SECRET_KEY = "AfVJWotnuyuSE2LBqFhX744zia9qc65xPSwbGEvCEC1T"
ALPACA_DATA_URL = "https://data.alpaca.markets/v2"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


LOOKBACK_DAYS = 365 * 3
INTRADAY_LOOKBACK_HOURS = 24


def get_bars_last_3_years(symbol: str):
    """Get daily bars for roughly the last 3 years for one symbol."""
    end_dt = now_utc() + dt.timedelta(days=1)
    start_dt = end_dt - dt.timedelta(days=LOOKBACK_DAYS)

    start_iso = start_dt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds").replace("+00:00", "Z")
    end_iso = end_dt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds").replace("+00:00", "Z")

    url = f"{ALPACA_DATA_URL}/stocks/bars"

    params = {
        "symbols": symbol,
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
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }

    resp = requests.get(url, params=params, headers=headers)

    if resp.status_code != 200:
        print(f"[WARN] Failed to fetch bars for {symbol}: {resp.status_code} {resp.text}")
        return []

    data = resp.json()
    bars_by_symbol = data.get("bars", {})
    bars = bars_by_symbol.get(symbol, [])

    if not bars:
        print(f"[WARN] No bars returned for {symbol} in last {LOOKBACK_DAYS} days")
        return []

    return bars


def get_intraday_bars(symbol: str):
    """Get 1-minute bars for the configured intraday lookback window."""
    end_dt = now_utc()
    start_dt = end_dt - dt.timedelta(hours=INTRADAY_LOOKBACK_HOURS)

    start_iso = start_dt.replace(second=0, microsecond=0).isoformat(timespec="seconds").replace("+00:00", "Z")
    end_iso = end_dt.replace(second=0, microsecond=0).isoformat(timespec="seconds").replace("+00:00", "Z")

    url = f"{ALPACA_DATA_URL}/stocks/bars"

    params = {
        "symbols": symbol,
        "timeframe": "1Min",
        "start": start_iso,
        "end": end_iso,
        "limit": 10000,
        "adjustment": "raw",
        "feed": "iex",
        "sort": "asc",
    }

    headers = {
        "accept": "application/json",
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }

    resp = requests.get(url, params=params, headers=headers)

    if resp.status_code != 200:
        print(f"[WARN] Failed to fetch intraday bars for {symbol}: {resp.status_code} {resp.text}")
        return []

    data = resp.json()
    bars_by_symbol = data.get("bars", {})
    bars = bars_by_symbol.get(symbol, [])

    if not bars:
        print(f"[WARN] No intraday bars returned for {symbol} in last {INTRADAY_LOOKBACK_HOURS} hours")
        return []

    return bars


def update_trading_universe_closes_3y():
    print("[INFO] Fetching trading_universe rows...")

    resp = supabase.table("trading_universe").select("*").execute()
    rows = resp.data or []

    print(f"[INFO] Found {len(rows)} instruments")

    for row in rows:
        symbol = row.get("symbol")
        if not symbol:
            continue

        print(f"[INFO] Updating {symbol}...")

        bars = get_bars_last_3_years(symbol)
        if not bars:
            print(f"[INFO] Skipping {symbol}, no bars in range")
            continue

        closes = row.get("closes_30d") or []
        if not isinstance(closes, list):
            closes = []

        # Convert to dict for fast overwrite: date -> entry
        closes_by_date = {e.get("date"): e for e in closes if isinstance(e, dict) and "date" in e}

        for bar in bars:
            t = bar.get("t")
            o = bar.get("o")
            c = bar.get("c")

            if t is None or o is None or c is None:
                continue

            date_str = t[:10]

            # compute pct
            pct = 0.0 if o == 0 else (c - o) / o

            # ALWAYS overwrite today's value (or any day's)
            closes_by_date[date_str] = {
                "pct": float(pct),
                "date": date_str
            }

        # Convert dict back to list
        closes = list(closes_by_date.values())

        # Only keep the configured lookback window
        cutoff_date = (now_utc().date() - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
        closes = [e for e in closes if e.get("date", "") >= cutoff_date]

        # Sort
        closes.sort(key=lambda x: x.get("date", ""))

        intraday_bars = get_intraday_bars(symbol)

        intraday = row.get("intraday") or []
        if not isinstance(intraday, list):
            intraday = []

        intraday_by_ts = {e.get("ts"): e for e in intraday if isinstance(e, dict) and "ts" in e}

        for bar in intraday_bars:
            t = bar.get("t")
            o = bar.get("o")
            c = bar.get("c")

            if t is None or o is None or c is None:
                continue

            pct = 0.0 if o == 0 else (c - o) / o

            intraday_by_ts[t] = {
                "pct": float(pct),
                "ts": t
            }

        intraday = list(intraday_by_ts.values())

        intraday_cutoff = (now_utc() - dt.timedelta(hours=INTRADAY_LOOKBACK_HOURS)).isoformat(timespec="seconds").replace("+00:00", "Z")
        intraday = [e for e in intraday if e.get("ts", "") >= intraday_cutoff]

        intraday.sort(key=lambda x: x.get("ts", ""))

        update_payload = {
            "closes_30d": closes,
            "intraday": intraday,
            "last_updated_at": now_utc().isoformat()
        }

        supabase.table("trading_universe").update(update_payload).eq("id", row["id"]).execute()

        print(f"[INFO] {symbol} updated, total days stored: {len(closes)}")

    print(f"[INFO] Done updating closes_30d for last {LOOKBACK_DAYS} days.")


# ===================== SCHEDULER =======================

if __name__ == "__main__":
    print("[ENGINE] Universe updater started — running every 10 minutes.")

    while True:
        try:
            print(f"\n[ENGINE] Run at {now_utc().isoformat()}")
            update_trading_universe_closes_3y()
        except Exception as e:
            print(f"[ERROR] Universe update failed: {e}")

        # Sleep 10 minutes
        time.sleep(600)
