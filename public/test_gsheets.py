import os, time, subprocess, psutil
from datetime import datetime, timedelta, timezone, date
import math
import re
import pandas as pd
import MetaTrader5 as mt5
from supabase import create_client, Client

# ----------------- CONFIG -----------------
SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODExMjU0NSwiZXhwIjoyMDczNjg4NTQ1fQ.FUyd9yCRrHYv5V5YrKup9_OI3n01aCfxS3_MxReLxBM"

MT5_PATH = r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"

ATTEMPTS_PER_STRATEGY = 2
LOOP_SLEEP_SECONDS = 5   # sample once a minute
TZ_OFFSET_HOURS = 2      # ZA time (UTC+2)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ========= JSON-safe helpers =========
def num_or_none(x):
    try:
        f = float(x)
        if math.isfinite(f):
            return f
    except Exception:
        pass
    return None

def safe_round(x, nd=4):
    f = num_or_none(x)
    return round(f, nd) if f is not None else None

def jclean(obj):
    if isinstance(obj, dict):
        return {k: jclean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [jclean(v) for v in obj]
    if isinstance(obj, (int, float)):
        return num_or_none(obj)
    if hasattr(obj, "isoformat"):
        try:
            return obj.isoformat()
        except Exception:
            return None
    return obj

# ========= Supabase safe executor =========
def safe_exec(q):
    """Swallow PostgREST 204 'Missing response' quirks."""
    try:
        return q.execute()
    except Exception as e:
        msg = str(e)
        if "Missing response" in msg or "code': '204" in msg or " 204" in msg:
            return None
        raise

# ========= MT5 helpers =========
def kill_mt5():
    os.system('taskkill /IM terminal64.exe /F >nul 2>&1')

def start_mt5():
    subprocess.Popen([MT5_PATH])
    for _ in range(30):
        if any("terminal64.exe" in p.name() for p in psutil.process_iter()):
            return True
        time.sleep(1)
    return False

def mt5_login(login: int, password: str, server: str):
    """Login and return (ok: bool, equity: float|None)."""
    kill_mt5(); time.sleep(2)
    if not start_mt5():
        print("❌ MT5 failed to start"); return False, None
    time.sleep(5)
    ok = mt5.initialize(
        path=MT5_PATH, login=login, password=password, server=server,
        timeout=60000, portable=False
    )
    if not ok:
        try: print("❌ Login failed:", mt5.last_error())
        except: pass
        try: mt5.shutdown(); kill_mt5()
        except: pass
        return False, None
    eq = None
    try:
        info = mt5.account_info()
        if info is not None and hasattr(info, "equity"):
            eq = float(info.equity)
    except Exception as e:
        print("⚠️ Could not read equity:", e)
    return True, eq

def mt5_shutdown_clean():
    try: mt5.shutdown()
    except: pass
    kill_mt5()

# ========= Deals utilities =========
def _to_dt(dt_or_sec):
    if isinstance(dt_or_sec, (int, float)):
        return datetime.fromtimestamp(dt_or_sec, tz=timezone.utc)
    return dt_or_sec

def dtfmt(dt):
    return _to_dt(dt).strftime("%Y.%m.%d %H:%M:%S")

def deals_sum_pnl(deal):
    return float(getattr(deal, "profit", 0) or 0) + \
           float(getattr(deal, "swap", 0) or 0) + \
           float(getattr(deal, "commission", 0) or 0)

def safe_history_deals_get(date_from, date_to, retries=8, pause=1.0):
    df = date_from; dt = date_to
    for _ in range(retries):
        try:
            deals = mt5.history_deals_get(df, dt)
            if deals is not None:
                return list(deals)
        except Exception:
            pass
        try: _ = mt5.symbols_total()
        except Exception: pass
        time.sleep(pause)
    for _ in range(3):
        try:
            deals = mt5.history_deals_get(df, dt, group="*")
            if deals is not None:
                return list(deals)
        except Exception:
            pass
        time.sleep(pause)
    out=[]; day=timedelta(days=1); cur=df
    while cur <= dt:
        nxt = min(cur+day, dt)
        for _ in range(2):
            try:
                got = mt5.history_deals_get(cur, nxt)
                if got is not None:
                    out.extend(list(got)); break
            except Exception:
                pass
            time.sleep(0.5)
        cur = nxt + timedelta(seconds=1)
    return out

# ========= Build equity timeline =========
def build_df_from(login: int, start_from: datetime):
    t_from = start_from
    t_to   = datetime.now(timezone.utc)
    epoch  = datetime(1970,1,1, tzinfo=timezone.utc)

    deals_before = safe_history_deals_get(epoch, t_from - timedelta(seconds=1))
    starting_balance = 0.0
    for d in deals_before:
        try: starting_balance += deals_sum_pnl(d)
        except Exception: continue

    deals = safe_history_deals_get(t_from, t_to)

    balance_ops, position_deals = [], []
    for d in deals:
        try:
            if d.type == mt5.DEAL_TYPE_BALANCE:
                balance_ops.append(d)
            elif getattr(d, "position_id", 0):
                position_deals.append(d)
        except Exception:
            continue

    pos_map = {}
    for d in position_deals:
        try:
            pid = d.position_id
            rec = pos_map.get(pid)
            if rec is None:
                rec = {
                    "account": login, "position_id": pid, "symbol": d.symbol,
                    "open_time": None, "close_time": None,
                    "open_price": None, "close_price": None,
                    "volume": None, "type": None, "total_profit": 0.0,
                }
                pos_map[pid] = rec
            rec["total_profit"] += deals_sum_pnl(d)

            entry = d.entry
            if entry in (mt5.DEAL_ENTRY_IN, mt5.DEAL_ENTRY_INOUT):
                ot = _to_dt(d.time)
                if rec["open_time"] is None or ot < rec["open_time"]:
                    rec["open_time"]  = ot
                    rec["open_price"] = d.price
                    rec["volume"]     = d.volume
                    if d.type == mt5.DEAL_TYPE_BUY:  rec["type"] = "Buy"
                    elif d.type == mt5.DEAL_TYPE_SELL: rec["type"] = "Sell"

            if entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY):
                ct = _to_dt(d.time)
                if rec["close_time"] is None or ct > rec["close_time"]:
                    rec["close_time"]  = ct
                    rec["close_price"] = d.price
        except Exception:
            continue

    pos_events = [rec for rec in pos_map.values() if rec["close_time"] is not None]

    bal_events = []
    for d in balance_ops:
        try:
            bal_events.append({"time": _to_dt(d.time), "amount": deals_sum_pnl(d), "ticket": d.ticket})
        except Exception:
            continue

    events = [{"kind":"balance","time":b["time"],"amount":b["amount"],"ticket":b["ticket"]} for b in bal_events]
    events += [{"kind":"position","time":p["close_time"],"pos":p} for p in pos_events]
    events.sort(key=lambda e: e["time"])

    headers = ["AccountNumber","PositionID","Symbol","Type","Volume","OpenPrice","ClosePrice",
               "OpenTime","CloseTime","TotalNetProfit","RunningBalance"]
    rows = []
    rows.append([
        str(login), "STARTING_BALANCE", "---", "Balance",
        "---","---","---",
        dtfmt(t_from), "---",
        f"{starting_balance:.2f}",
        f"{starting_balance:.2f}",
    ])
    running = starting_balance
    for ev in events:
        if ev["kind"] == "balance":
            running += ev["amount"]
            rows.append([
                str(login), f"BAL-{ev['ticket']}", "---","Balance",
                "---","---","---",
                dtfmt(ev["time"]), "---",
                f"{ev['amount']:.2f}", f"{running:.2f}",
            ])
        else:
            p = ev["pos"]
            running += p["total_profit"]
            rows.append([
                str(p["account"]), str(p["position_id"]), p["symbol"] or "",
                p["type"] or "Unknown",
                f"{(p['volume'] or 0):.2f}",
                f"{(p['open_price'] or 0):.5f}",
                f"{(p['close_price'] or 0):.5f}",
                dtfmt(p["open_time"]) if p["open_time"] else "",
                dtfmt(p["close_time"]) if p["close_time"] else "",
                f"{p['total_profit']:.2f}",
                f"{running:.2f}",
            ])
    return pd.DataFrame(rows, columns=headers)

# ========= Metrics builders =========
def build_daily_equity(df: pd.DataFrame):
    if df.empty: return pd.DataFrame(columns=["date","equity"])
    df["OpenTime"] = df["OpenTime"].replace({"---": None})
    df["CloseTime"] = df["CloseTime"].replace({"---": None})
    pairs = []
    for _, r in df.iterrows():
        t = r["CloseTime"] if r["CloseTime"] not in (None, "", "---") else r["OpenTime"]
        if t in (None, "", "---"): continue
        rb = float(r["RunningBalance"])
        pairs.append((datetime.strptime(t, "%Y.%m.%d %H:%M:%S"), rb))
    if not pairs:
        return pd.DataFrame(columns=["date","equity"])
    pairs.sort(key=lambda x: x[0])
    by_day = {}
    for t, eq in pairs:
        d = t.date()
        by_day[d] = eq
    return pd.DataFrame([{"date": d, "equity": by_day[d]} for d in sorted(by_day.keys())])

def pct(a, b):
    if b == 0 or b is None or a is None: return None
    return (a / b - 1.0) * 100.0

def daily_returns(daily_eq: pd.DataFrame):
    if daily_eq.empty: return pd.DataFrame(columns=["date","equity","ret_pct"])
    daily_eq = daily_eq.sort_values("date").reset_index(drop=True)
    rets = [None]
    for i in range(1, len(daily_eq)):
        rets.append(pct(daily_eq.loc[i, "equity"], daily_eq.loc[i-1, "equity"]))
    out = daily_eq.copy()
    out["ret_pct"] = rets
    return out

def label_weekday(d: date):
    return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d.weekday()]

def aggregate_monthly(daily_df: pd.DataFrame):
    if daily_df.empty: return pd.DataFrame(columns=["ym","label","pct"])
    daily_df = daily_df.sort_values("date")
    groups = {}
    for _, r in daily_df.iterrows():
        d = r["date"]; ym = (d.year, d.month)
        groups.setdefault(ym, []).append((d, r["equity"]))
    rows = []
    for (y, m), arr in groups.items():
        arr.sort(key=lambda x: x[0])
        first_eq = arr[0][1]; last_eq = arr[-1][1]
        rows.append({"ym": f"{y}-{m:02d}", "label": f"{date(y,m,1).strftime('%b %Y')}",
                     "pct": None if first_eq==0 else (last_eq/first_eq - 1.0)*100.0})
    return pd.DataFrame(rows).sort_values("ym")

def build_series_payloads_equity_monthlies(daily_df: pd.DataFrame):
    if daily_df.empty:
        return {"series_6m": [], "series_1y": [], "series_all": []}
    monthly = aggregate_monthly(daily_df)
    series_6m = monthly.tail(6)[["label","pct"]].apply(
        lambda r: {"label": r["label"], "pct": safe_round(r["pct"], 4)}, axis=1
    ).to_list()
    series_1y = monthly.tail(12)[["label","pct"]].apply(
        lambda r: {"label": r["label"], "pct": safe_round(r["pct"], 4)}, axis=1
    ).to_list()
    series_all = monthly[["label","pct"]].apply(
        lambda r: {"label": r["label"], "pct": safe_round(r["pct"], 4)}, axis=1
    ).to_list()
    return {"series_6m": series_6m, "series_1y": series_1y, "series_all": series_all}

def build_calendar_returns(daily_df: pd.DataFrame):
    out = []
    for _, r in daily_df.iterrows():
        if r["ret_pct"] is None:
            continue
        d = r["date"]
        out.append({"year": d.year, "month": d.month, "day": d.day, "pct": safe_round(r["ret_pct"], 4)})
    return out

def build_perf_summary(daily_df: pd.DataFrame):
    ytd_return_pct = None
    ytd_start_date = None
    ytd_end_date = None
    if daily_df is not None and not daily_df.empty:
        today_year = datetime.now(timezone.utc).year
        df_year = daily_df.loc[daily_df["date"].apply(lambda d: d.year == today_year)].sort_values("date")
        if not df_year.empty:
            first_eq = float(df_year.iloc[0]["equity"])
            last_eq  = float(df_year.iloc[-1]["equity"])
            if first_eq != 0:
                ytd_return_pct = ((last_eq / first_eq) - 1.0) * 100.0
            ytd_start_date = df_year.iloc[0]["date"].strftime("%Y-%m-%d")
            ytd_end_date   = df_year.iloc[-1]["date"].strftime("%Y-%m-%d")

    usable = daily_df.dropna(subset=["ret_pct"]).copy()
    if usable.empty:
        return {
            "best_day_pct": None, "best_day_date": None,
            "worst_day_pct": None, "worst_day_date": None,
            "avg_daily_return_pct": None,
            "positive_days_pct": None, "negative_days_pct": None,
            "days_positive": 0, "days_negative": 0, "total_days": 0,
            "ytd_return_pct": safe_round(ytd_return_pct, 4),
            "ytd_start_date": ytd_start_date,
            "ytd_end_date": ytd_end_date
        }

    best_i = usable["ret_pct"].idxmax()
    worst_i = usable["ret_pct"].idxmin()
    best = float(usable.loc[best_i, "ret_pct"]);  best_d = usable.loc[best_i, "date"].strftime("%Y-%m-%d")
    worst = float(usable.loc[worst_i, "ret_pct"]); worst_d = usable.loc[worst_i, "date"].strftime("%Y-%m-%d")
    avg = float(usable["ret_pct"].mean())
    pos_days = int((usable["ret_pct"] > 0).sum())
    neg_days = int((usable["ret_pct"] < 0).sum())
    total = int(len(usable))
    pos_pct = 100.0 * pos_days / total if total else None
    neg_pct = 100.0 * neg_days / total if total else None

    return {
        "best_day_pct": safe_round(best, 4),
        "best_day_date": best_d,
        "worst_day_pct": safe_round(worst, 4),
        "worst_day_date": worst_d,
        "avg_daily_return_pct": safe_round(avg, 4),
        "positive_days_pct": safe_round(pos_pct, 4),
        "negative_days_pct": safe_round(neg_pct, 4),
        "days_positive": int(pos_days),
        "days_negative": int(neg_days),
        "total_days": int(total),
        "ytd_return_pct": safe_round(ytd_return_pct, 4),
        "ytd_start_date": ytd_start_date,
        "ytd_end_date": ytd_end_date
    }

# ========= Supabase helpers =========
def has_val(x):
    return (x is not None) and (str(x).strip() != "")

def fetch_strategies_with_creds():
    res = supabase.table("strategies").select(
        "id,name,mt5_server_name,mt5_account_number,mt5_password,last_login,inception_date"
    ).execute()
    rows = res.data or []
    print(f"[diag] total strategies: {len(rows)}")

    bad = []
    good = []
    for r in rows:
        ok = all([
            has_val(r.get("mt5_server_name")),
            has_val(r.get("mt5_account_number")),
            has_val(r.get("mt5_password")),
        ])
        (good if ok else bad).append(r)

    print(f"[diag] with usable creds: {len(good)} | missing creds: {len(bad)}")
    if bad:
        for r in bad:
            print("   ↳ missing for:", r.get("name") or r["id"],
                  "| srv?", bool(has_val(r.get("mt5_server_name"))),
                  "acc?", bool(has_val(r.get("mt5_account_number"))),
                  "pwd?", bool(has_val(r.get("mt5_password"))))
    return good

def safe_update_strategy(strategy_id: str, payload: dict):
    q = (supabase.table("strategies")
         .update(jclean(payload))
         .eq("id", strategy_id))
    safe_exec(q)

def set_last_login_and_aum(strategy_id: str, equity):
    payload = {"last_login": datetime.now(timezone.utc).isoformat()}
    if equity is not None:
        payload["aum"] = safe_round(equity, 2)
    safe_update_strategy(strategy_id, payload)

def upsert_strategy_metrics(strategy_id: str, series_payloads: dict, perf_summary: dict, calendar_returns: list):
    body = {
        "strategy_id": strategy_id,
        "asof_date": date.today().isoformat(),
        "series_6m": series_payloads.get("series_6m", []),
        "series_1y": series_payloads.get("series_1y", []),
        "series_all": series_payloads.get("series_all", []),
        "perf_summary": perf_summary,
        "calendar_returns": calendar_returns
    }
    q = supabase.table("strategy_metrics").upsert(
        jclean(body),
        on_conflict="strategy_id",
        returning="representation"
    )
    safe_exec(q)

# ---- Intraday (1D) helper only ----
def za_today(dt_utc: datetime) -> date:
    return (dt_utc + timedelta(hours=TZ_OFFSET_HOURS)).date()

def ensure_metrics_row(strategy_id: str):
    r = supabase.table("strategy_metrics").select("strategy_id").eq("strategy_id", strategy_id).maybe_single().execute()
    exists = bool(getattr(r, "data", None))
    if not exists:
        q = supabase.table("strategy_metrics").insert({
            "strategy_id": strategy_id,
            "asof_date": date.today().isoformat(),
            "series_1d": []
        }, returning="representation")
        safe_exec(q)

def append_series_1d_and_update_live(strategy_id: str, equity, balance=None, margin=None, floating=None):
    now_utc = datetime.now(timezone.utc)
    # fetch current series
    cur = supabase.table("strategy_metrics").select("series_1d").eq("strategy_id", strategy_id).maybe_single().execute()
    raw = (cur and getattr(cur, "data", None)) or {}
    series = raw.get("series_1d", []) if isinstance(raw, dict) else []

    today_za = za_today(now_utc)
    pruned = []
    for it in (series or []):
        try:
            its = it.get("ts")
            if not its: continue
            ts = its.replace("Z", "+00:00") if "Z" in its else its
            dza = za_today(datetime.fromisoformat(ts))
            if dza == today_za:
                pruned.append({"ts": its, "equity": num_or_none(it.get("equity"))})
        except Exception:
            continue

    pruned.append({"ts": now_utc.isoformat(), "equity": safe_round(equity, 2)})
    pruned = pruned[-1440:]  # keep ~1 day of minutes

    q = supabase.table("strategy_metrics").upsert(
        jclean({
            "strategy_id": strategy_id,
            "asof_date": date.today().isoformat(),
            "series_1d": pruned,
            "live_equity": safe_round(equity, 2),
            "live_equity_ts": now_utc.isoformat(),
            "live_balance": safe_round(balance, 2) if balance is not None else None,
            "live_margin": safe_round(margin, 2) if margin is not None else None,
            "live_floating_pnl": safe_round(floating, 2) if floating is not None else None,
        }),
        on_conflict="strategy_id",
        returning="representation"
    )
    safe_exec(q)

# ========= NEW: Portfolio holdings + Asset allocation =========
# --- MT5 path -> class map (folder-first) ---
_PATH_MAP = {
    "forex": "FX",
    "fx": "FX",
    "currencies": "FX",
    "indices": "Indices",
    "index": "Indices",
    "equities": "Equities",
    "stocks": "Equities",
    "shares": "Equities",
    "metals": "Metals",
    "energy": "Energies",
    "energies": "Energies",
    "crypto": "Crypto",
    "bonds": "Bonds",
    "cfd": "CFDs",
}

# --- Heuristic hints (fallbacks) ---
_CCY = {"USD","EUR","GBP","JPY","CHF","AUD","NZD","CAD","ZAR","CNH","CNY","SEK","NOK","DKK","MXN","TRY","PLN","HUF","SGD","HKD"}
_INDEX_HINTS = ["US30","US500","USTEC","NAS100","NDX","SPX","DJI","GER40","DE40","DAX","UK100","FTSE","FRA40","CAC","JP225","NIKKEI","HK50","HSI","CHINA50","AUS200","ESP35","IBEX","EU50","STOXX"]
_METAL_HINTS = ["XAU","XAG","XPT","XPD"]
_ENERGY_HINTS = ["UKOIL","USOIL","XBR","XTI","BRENT","WTI","NGAS","XNG"]
_CRYPTO_HINTS = ["BTC","ETH","SOL","ADA","XRP","LTC","BCH","DOGE","DOT","AVAX","MATIC","BNB","LINK"]
_BOND_HINTS = ["US10Y","US02Y","US05Y","US30Y","BUND","GILT","JGB"]
_CFD_HINTS = [".cash","-cash","_cash","CFD"]

def _strip_suffix_letters(sym: str) -> str:
    """Remove common MT5 suffixes like 'EURUSDm', 'EURUSD.a' -> 'EURUSD'."""
    return re.sub(r'[^A-Z]+$', '', sym.upper())

def _classify_from_path(path: str) -> str | None:
    parts = [p.strip().lower() for p in (path or "").split("\\") if p.strip()]
    for p in parts:
        for key, cls in _PATH_MAP.items():
            if key in p:
                return cls
    return None

def classify_symbol(sym: str) -> str:
    """MT5 path/description first; then symbol heuristics."""
    info = mt5.symbol_info(sym)

    # 1) Broker folder (best signal)
    if info and getattr(info, "path", ""):
        cls = _classify_from_path(info.path)
        if cls:
            return cls

    # 2) Description hints
    desc = (getattr(info, "description", "") or "").upper()
    if desc:
        if any(h in desc for h in _METAL_HINTS): return "Metals"
        if any(h in desc for h in _ENERGY_HINTS): return "Energies"
        if "INDEX" in desc or any(h in desc for h in _INDEX_HINTS): return "Indices"
        if "CRYPTO" in desc or any(h in desc for h in _CRYPTO_HINTS): return "Crypto"
        if "BOND" in desc: return "Bonds"

    # 3) Symbol heuristics
    s = sym.upper()
    core = _strip_suffix_letters(s)
    if any(core.startswith(h) for h in _METAL_HINTS): return "Metals"
    if any(h in core for h in _ENERGY_HINTS): return "Energies"
    if any(h in core for h in _CRYPTO_HINTS): return "Crypto"
    if any(h in core for h in _INDEX_HINTS): return "Indices"
    if any(h in s for h in _CFD_HINTS): return "CFDs"
    if "/" in core: return "FX"
    if len(core) >= 6 and core[:3] in _CCY and core[3:6] in _CCY: return "FX"
    if re.fullmatch(r"[A-Z\.]{2,10}", core) and not core.startswith("X"): return "Equities"
    return "Other"

def _mid_price(sym: str) -> float:
    """Best-effort mid; fallback to last; else 0."""
    try:
        tick = mt5.symbol_info_tick(sym)
        if not tick:
            return 0.0
        parts = [v for v in [tick.bid, tick.ask, tick.last] if v not in (None, 0)]
        if not parts:
            return 0.0
        if tick.bid and tick.ask:
            return (float(tick.bid) + float(tick.ask)) / 2.0
        return sum(map(float, parts)) / len(parts)
    except Exception:
        return 0.0

def compute_portfolio_holdings() -> list:
    """
    Build an array of {symbol, class, price, long_volume, short_volume, net_volume, value, weight_pct, updated_ts}
    from current open positions. Value = (long+short) * price. Weights sum to 100.
    """
    try:
        pos = mt5.positions_get()
    except Exception:
        pos = None
    pos = pos or []

    # Aggregate by symbol
    by_sym = {}
    for p in pos:
        try:
            sym = p.symbol
            if sym not in by_sym:
                by_sym[sym] = {"symbol": sym, "long_volume": 0.0, "short_volume": 0.0}
            if p.type == mt5.POSITION_TYPE_BUY:
                by_sym[sym]["long_volume"] += float(p.volume or 0)
            else:
                by_sym[sym]["short_volume"] += float(p.volume or 0)
        except Exception:
            continue

    # Attach price + compute values
    total_val = 0.0
    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for sym, agg in by_sym.items():
        price = _mid_price(sym)
        long_v = float(agg["long_volume"])
        short_v = float(agg["short_volume"])
        net_v = long_v - short_v
        # Exposure-style value uses total exposure (long + short)
        value = (long_v + short_v) * price
        total_val += value
        rows.append({
            "symbol": sym,
            "class": classify_symbol(sym),
            "price": safe_round(price, 5),
            "long_volume": safe_round(long_v, 2),
            "short_volume": safe_round(short_v, 2),
            "net_volume": safe_round(net_v, 2),
            "value": safe_round(value, 2),
            "updated_ts": now_iso
        })

    # Weights
    if total_val and total_val > 0:
        for r in rows:
            r["weight_pct"] = safe_round(100.0 * (num_or_none(r["value"]) / total_val), 2)
    else:
        for r in rows:
            r["weight_pct"] = 0.0

    # Sort heavy to light
    rows.sort(key=lambda x: x.get("weight_pct", 0.0), reverse=True)
    return jclean(rows)

def compute_asset_allocation_from_holdings(holdings: list) -> list:
    """
    Aggregate holdings into asset classes and compute % weights.
    Returns array of {class, value, weight_pct}.
    """
    total = 0.0
    by_cls = {}
    for h in holdings or []:
        cls = h.get("class") or "Other"
        val = num_or_none(h.get("value")) or 0.0
        by_cls[cls] = by_cls.get(cls, 0.0) + val
        total += val

    order = ["FX","Indices","Equities","Metals","Energies","Crypto","Bonds","CFDs","Other"]
    out = []
    for cls in order:
        v = by_cls.get(cls, 0.0)
        w = 100.0 * (v / total) if total > 0 else 0.0
        out.append({"class": cls, "value": safe_round(v, 2), "weight_pct": safe_round(w, 2)})
    return jclean(out)

def update_portfolio_holdings(strategy_id: str, holdings: list):
    q = (supabase.table("strategy_metrics")
         .update(jclean({"portfolio_holdings": holdings, "asof_date": date.today().isoformat()}))
         .eq("strategy_id", strategy_id))
    safe_exec(q)

def update_asset_allocation(strategy_id: str, allocation: list):
    q = (supabase.table("strategy_metrics")
         .update(jclean({"asset_allocation": allocation, "asof_date": date.today().isoformat()}))
         .eq("strategy_id", strategy_id))
    safe_exec(q)

# ========= Main loop =========
if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.")
        raise SystemExit(1)

    print(f"🔁 MT5 watcher + metrics started. Sweep every {LOOP_SLEEP_SECONDS}s. Ctrl+C to stop.")
    try:
        while True:
            try:
                strategies = fetch_strategies_with_creds()
                if not strategies:
                    print(f"[loop] No rows with creds. Sleeping {LOOP_SLEEP_SECONDS}s…")
                    time.sleep(LOOP_SLEEP_SECONDS)
                    continue

                for s in strategies:
                    sid  = s["id"]
                    name = s.get("name") or sid
                    srv  = str(s["mt5_server_name"]).strip()
                    acc_raw = s["mt5_account_number"]
                    pwd  = str(s["mt5_password"]).strip()

                    # start date
                    start_from = None
                    try:
                        if s.get("inception_date"):
                            start_from = datetime.strptime(s["inception_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except Exception:
                        start_from = None
                    if start_from is None:
                        start_from = datetime.now(timezone.utc) - timedelta(days=730)

                    try:
                        login = int(str(acc_raw).strip())
                    except Exception:
                        print(f"⚠️ Bad account number for {name}: {acc_raw}")
                        continue

                    print(f"\n➡️ {datetime.now(timezone.utc).isoformat()} — login & metrics for {name}: {login}@{srv}")
                    success, equity = False, None
                    for i in range(1, ATTEMPTS_PER_STRATEGY + 1):
                        print(f"   attempt {i}/{ATTEMPTS_PER_STRATEGY}…")
                        success, equity = mt5_login(login, pwd, srv)
                        if success:
                            set_last_login_and_aum(sid, equity)
                            print(f"   ✅ last_login updated; aum={safe_round(equity,2)}")

                            try:
                                info = mt5.account_info()
                                bal = float(getattr(info, "balance", 0) or 0) if info else None
                                mar = float(getattr(info, "margin", 0) or 0) if info else None
                                flp = float(getattr(info, "profit", 0) or 0) if info else None
                            except Exception:
                                bal = mar = flp = None

                            ensure_metrics_row(sid)
                            append_series_1d_and_update_live(sid, equity, bal, mar, flp)

                            # --- Portfolio holdings + asset allocation ---
                            try:
                                holdings = compute_portfolio_holdings()
                                update_portfolio_holdings(sid, holdings)
                                allocation = compute_asset_allocation_from_holdings(holdings)
                                update_asset_allocation(sid, allocation)
                                print(f"   🧺 portfolio_holdings ({len(holdings)} syms) + 🧩 asset_allocation updated")
                            except Exception as e:
                                print("   ⚠️ holdings/allocation update failed:", e)

                            # history & derived metrics (monthlies, calendar, summary)
                            try:
                                df = build_df_from(login, start_from)
                            except Exception as e:
                                print("   ⚠️ Failed to build history DF:", e)
                                df = None

                            if df is not None and not df.empty:
                                daily_eq = build_daily_equity(df)
                                dr = daily_returns(daily_eq)
                                monthly_payloads = build_series_payloads_equity_monthlies(dr)
                                perf_summary = build_perf_summary(dr)
                                calendar_payload = build_calendar_returns(dr)
                                upsert_strategy_metrics(sid, monthly_payloads, perf_summary, calendar_payload)
                                print("   📈 metrics upserted")
                            else:
                                print("   ⚠️ no history rows; metrics not updated")

                            mt5_shutdown_clean()
                            break

                        time.sleep(1)

                    if not success:
                        print("   ❌ login failed; last_login/aum/metrics unchanged")
                        mt5_shutdown_clean()

                    time.sleep(1)

            except Exception as e:
                print("[loop] ❌ error:", e)
                mt5_shutdown_clean()
                time.sleep(10)

            print(f"\n[loop] Sleeping {LOOP_SLEEP_SECONDS}s…")
            time.sleep(LOOP_SLEEP_SECONDS)

    except KeyboardInterrupt:
        print("\n👋 Exiting cleanly.")
        mt5_shutdown_clean()
