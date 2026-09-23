#!/usr/bin/env python3
"""CryptoStruct vs KalshiBot overlap fidelity audit (data fidelity only).

Streams purchased CryptoStruct series-day ZIPs and pre-M16 KalshiBot
forward-quote captures. Writes compact JSON artifacts under
data/research-results/external-kalshi-data-audit/.

Does not inspect M16 outcomes, strategy P&L, or live trading.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import zstandard as zstd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/research-results/external-kalshi-data-audit"
RAW_ZIPS = ROOT / "data/external-samples/cryptostruct/overlap/raw"
WORK = ROOT / "data/external-samples/cryptostruct/overlap/work"
KB_ROOTS = [
    Path("/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes"),
    ROOT / "data/live-capture/forward-quotes",
]

EXPECTED_SHA = {
    "2026-09-08": "91d890acc77db122b4dbaf5dbf1cae4c8151506dfe52ae37639235c88001e27d",
    "2026-09-09": "f468b653c740a8c55058e8558cfceb61f1d4ffad5be3aff634fddd21d31b1e91",
    "2026-09-14": "fb65ac61071b2ec0a757701634a411e03fe7040ea939438a97afd62117d09d54",
    "2026-09-18": "4c713ef0d33dd892ddc9de0eb2a37372fd91990af67380b91cbb53f1ad0742dc",
    "2026-09-20": "52836856281fbc78e8c9593fbc0a35e5eb166792746924a28becde6c97baf2e4",
}

PURCHASED_DAYS = list(EXPECTED_SHA.keys())
TOLERANCES_MS = [100, 500, 1000, 2000, 5000]
MSG = {
    0: "snapshot",
    1: "book_update",
    2: "trades",
    5: "instrument_state",
    6: "top_of_book",
    7: "mark",
    8: "index",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(1024 * 1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def parse_iso_ns(s: str) -> Optional[int]:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1_000_000_000)
    except Exception:
        return None


def pct(xs: List[float], p: float) -> Optional[float]:
    if not xs:
        return None
    a = np.asarray(xs, dtype=np.float64)
    return float(np.quantile(a, p))


def summarize_abs(diffs: np.ndarray) -> Dict[str, Any]:
    if diffs.size == 0:
        return {
            "n": 0,
            "mean": None,
            "median": None,
            "p95": None,
            "max": None,
        }
    return {
        "n": int(diffs.size),
        "mean": float(np.mean(diffs)),
        "median": float(np.median(diffs)),
        "p95": float(np.quantile(diffs, 0.95)),
        "max": float(np.max(diffs)),
    }


@dataclass
class BookState:
    bids: Dict[float, float] = field(default_factory=dict)
    asks: Dict[float, float] = field(default_factory=dict)
    ready: bool = False
    fail_closed: bool = False
    last_book_eid: Any = None
    chain_breaks: int = 0
    delta_before_snapshot: int = 0
    crossed: int = 0
    locked: int = 0
    empty: int = 0


def apply_levels(book: BookState, levels: list, is_snapshot: bool) -> None:
    if is_snapshot:
        book.bids.clear()
        book.asks.clear()
        book.ready = True
        book.fail_closed = False
    else:
        if not book.ready or book.fail_closed:
            book.delta_before_snapshot += 1
            return
    for lvl in levels:
        if not isinstance(lvl, list) or len(lvl) < 3:
            continue
        side, price_s, qty_s = lvl[0], lvl[1], lvl[2]
        try:
            price = float(price_s)
            qty = float(qty_s)
        except Exception:
            continue
        if not (0.0 <= price <= 1.0) or math.isnan(price) or qty < 0 or math.isnan(qty):
            continue
        side_book = book.bids if side == 0 else book.asks
        if qty == 0:
            side_book.pop(price, None)
        else:
            side_book[price] = qty


def bbo_cents(book: BookState) -> Optional[Tuple[int, int, int, int, int]]:
    """Return YES bid/ask, NO bid/ask, YES spread in integer cents, or None if empty."""
    if not book.bids and not book.asks:
        book.empty += 1
        return None
    yb = max(book.bids) if book.bids else None
    ya = min(book.asks) if book.asks else None
    if yb is not None and ya is not None:
        if yb > ya:
            book.crossed += 1
        elif yb == ya:
            book.locked += 1
    # Allow one-sided books; missing side -> None encoded as -1
    yb_c = int(round(yb * 100)) if yb is not None else -1
    ya_c = int(round(ya * 100)) if ya is not None else -1
    # Complement NO
    nb_c = int(round((1.0 - ya) * 100)) if ya is not None else -1
    na_c = int(round((1.0 - yb) * 100)) if yb is not None else -1
    spread = (ya_c - yb_c) if (yb_c >= 0 and ya_c >= 0) else -1
    return yb_c, ya_c, nb_c, na_c, spread


TICKER_RE = re.compile(r"KXBTC15M-26[A-Z]{3}\d{2}\d{4}-\d{2}")


def member_ticker(name: str) -> Optional[str]:
    m = TICKER_RE.search(name)
    return m.group(0) if m else None


def discover_kb_runs() -> Dict[str, List[Dict[str, Any]]]:
    by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    seen = set()
    for root in KB_ROOTS:
        if not root.exists():
            continue
        for d in sorted(root.iterdir()):
            if not d.is_dir():
                continue
            day = d.name[:10]
            if day not in PURCHASED_DAYS:
                continue
            if d.name.startswith("2026-09-22"):
                continue
            key = (day, d.name)
            if key in seen:
                continue
            seen.add(key)
            health_p = d / "capture-health.json"
            status_p = d / "capture-run-status.json"
            tob = d / "top-of-book.jsonl"
            meta = d / "market-metadata.jsonl"
            health = json.loads(health_p.read_text()) if health_p.exists() else {}
            status = json.loads(status_p.read_text()) if status_p.exists() else {}
            tickers: List[str] = []
            if meta.exists():
                for line in meta.open():
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    t = o.get("marketTicker")
                    if t and t not in tickers:
                        tickers.append(t)
            conn = health.get("connection") or {}
            cap = health.get("capture") or {}
            start = health.get("startedAt") or status.get("startedAt")
            end = health.get("endedAt") or status.get("endedAt")
            usable = (
                tob.exists()
                and tob.stat().st_size > 0
                and status.get("state") == "completed"
                and (conn.get("captureEndReason") == "duration-complete")
            )
            reason = None
            if not tob.exists() or tob.stat().st_size == 0:
                usable = False
                reason = "missing_or_empty_top_of_book"
            elif status.get("state") == "failed":
                usable = False
                reason = f"failed:{status.get('captureEndReason') or conn.get('captureEndReason')}"
            elif status.get("state") == "user-cancelled":
                usable = False
                reason = "user-cancelled"
            by_day[day].append(
                {
                    "runId": d.name,
                    "path": str(d),
                    "root": str(root),
                    "startedAt": start,
                    "endedAt": end,
                    "startNs": parse_iso_ns(start) if start else None,
                    "endNs": parse_iso_ns(end) if end else None,
                    "verdict": health.get("verdict"),
                    "state": status.get("state"),
                    "endReason": conn.get("captureEndReason") or status.get("captureEndReason"),
                    "tobRecords": cap.get("topOfBookRecordCount"),
                    "tickers": tickers,
                    "usable": usable,
                    "excludeReason": reason,
                }
            )
    return dict(by_day)


def inventory_zip(day: str, zpath: Path) -> Dict[str, Any]:
    entries = []
    tickers = []
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename
            ticker = member_ticker(name)
            entry = {
                "name": name,
                "compressedSize": info.compress_size,
                "fileSize": info.file_size,
                "ticker": ticker,
            }
            entries.append(entry)
            if ticker:
                tickers.append(ticker)
    return {
        "day": day,
        "zipPath": str(zpath),
        "entryCount": len(entries),
        "zstMembers": sum(1 for e in entries if e["name"].endswith(".zst")),
        "tickers": sorted(set(tickers)),
        "tickerCount": len(set(tickers)),
        "entries": entries,
    }


def stream_cs_bbo(
    zpath: Path,
    member: str,
    window_start_ns: Optional[int] = None,
    window_end_ns: Optional[int] = None,
) -> Dict[str, Any]:
    """Reconstruct causal YES book; emit BBO series on adapter receive time."""
    book = BookState()
    recv_ns: List[int] = []
    venue_ns: List[int] = []
    yb: List[int] = []
    ya: List[int] = []
    nb: List[int] = []
    na: List[int] = []
    sp: List[int] = []
    counts = Counter()
    malformed = 0
    ts_regress_recv = 0
    ts_dup_recv = 0
    last_recv = None
    latency: List[float] = []
    trade_count = 0
    first_recv = None
    last_recv_f = None
    first_venue = None
    last_venue_f = None

    dctx = zstd.ZstdDecompressor()
    with zipfile.ZipFile(zpath) as z:
        with z.open(member) as raw:
            with dctx.stream_reader(raw) as reader:
                buf = b""
                while True:
                    chunk = reader.read(1 << 20)
                    if not chunk:
                        break
                    buf += chunk
                    while True:
                        i = buf.find(b"\n")
                        if i < 0:
                            break
                        line = buf[:i]
                        buf = buf[i + 1 :]
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except Exception:
                            malformed += 1
                            continue
                        if isinstance(obj, dict):
                            counts["header"] += 1
                            continue
                        if not isinstance(obj, list) or not obj:
                            malformed += 1
                            continue
                        msg = obj[0]
                        counts[MSG.get(msg, f"unknown_{msg}")] += 1
                        if msg == 5:
                            continue
                        if len(obj) < 6:
                            malformed += 1
                            continue
                        prev_eid, eid, ad_ts, ex_ts = obj[2], obj[3], obj[4], obj[5]
                        data = obj[6:] if len(obj) > 6 else []

                        if msg in (0, 1):
                            if book.last_book_eid is not None and prev_eid not in (None, "", "0"):
                                if str(prev_eid) != str(book.last_book_eid):
                                    book.chain_breaks += 1
                                    book.fail_closed = True
                            if eid not in (None, ""):
                                book.last_book_eid = eid

                        if isinstance(ad_ts, int) and ad_ts > 0:
                            if last_recv is not None:
                                gap = ad_ts - last_recv
                                if gap < 0:
                                    ts_regress_recv += 1
                                elif gap == 0:
                                    ts_dup_recv += 1
                            last_recv = ad_ts
                            if first_recv is None:
                                first_recv = ad_ts
                            last_recv_f = ad_ts
                        if isinstance(ex_ts, int) and ex_ts > 0:
                            if first_venue is None:
                                first_venue = ex_ts
                            last_venue_f = ex_ts
                            if isinstance(ad_ts, int) and ad_ts > 0:
                                latency.append((ad_ts - ex_ts) / 1e6)

                        if msg == 0:
                            levels = data[0] if data else []
                            if isinstance(levels, list):
                                apply_levels(book, levels, True)
                        elif msg == 1:
                            levels = data[0] if data else []
                            if isinstance(levels, list):
                                apply_levels(book, levels, False)
                        elif msg == 2:
                            trades = data[0] if data else []
                            if isinstance(trades, list):
                                trade_count += len(trades)
                            continue
                        else:
                            continue

                        if not isinstance(ad_ts, int) or ad_ts <= 0:
                            continue
                        if window_start_ns is not None and ad_ts < window_start_ns:
                            continue
                        if window_end_ns is not None and ad_ts > window_end_ns:
                            continue
                        bb = bbo_cents(book)
                        if bb is None:
                            continue
                        # Record every book event BBO (dense). For memory, only keep
                        # changes + periodic heartbeats every 50ms.
                        if recv_ns and ad_ts - recv_ns[-1] < 50_000_000:
                            if (
                                yb[-1] == bb[0]
                                and ya[-1] == bb[1]
                                and nb[-1] == bb[2]
                                and na[-1] == bb[3]
                            ):
                                continue
                        recv_ns.append(ad_ts)
                        venue_ns.append(ex_ts if isinstance(ex_ts, int) else 0)
                        yb.append(bb[0])
                        ya.append(bb[1])
                        nb.append(bb[2])
                        na.append(bb[3])
                        sp.append(bb[4])

    return {
        "member": member,
        "counts": dict(counts),
        "tradeCount": trade_count,
        "malformed": malformed,
        "chainBreaks": book.chain_breaks,
        "deltaBeforeSnapshot": book.delta_before_snapshot,
        "crossed": book.crossed,
        "locked": book.locked,
        "empty": book.empty,
        "tsRegressRecv": ts_regress_recv,
        "tsDupRecv": ts_dup_recv,
        "firstRecvNs": first_recv,
        "lastRecvNs": last_recv_f,
        "firstVenueNs": first_venue,
        "lastVenueNs": last_venue_f,
        "latencyMs": {
            "n": len(latency),
            "p50": pct(latency, 0.5),
            "p90": pct(latency, 0.9),
            "p99": pct(latency, 0.99),
            "max": max(latency) if latency else None,
        },
        "bbo": {
            "recv_ns": np.asarray(recv_ns, dtype=np.int64),
            "venue_ns": np.asarray(venue_ns, dtype=np.int64),
            "yb": np.asarray(yb, dtype=np.int16),
            "ya": np.asarray(ya, dtype=np.int16),
            "nb": np.asarray(nb, dtype=np.int16),
            "na": np.asarray(na, dtype=np.int16),
            "sp": np.asarray(sp, dtype=np.int16),
        },
    }


def stream_kb_tob(
    tob_path: Path,
    tickers: Iterable[str],
    start_ns: Optional[int],
    end_ns: Optional[int],
) -> Dict[str, Dict[str, np.ndarray]]:
    want = set(tickers)
    buckets: Dict[str, Dict[str, List[Any]]] = {
        t: {
            "recv_ns": [],
            "yb": [],
            "ya": [],
            "nb": [],
            "na": [],
            "sp": [],
            "econ": [],
            "parity": [],
            "crossed": [],
            "locked": [],
        }
        for t in want
    }
    with tob_path.open() as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            t = o.get("marketTicker")
            if t not in want:
                continue
            ns = parse_iso_ns(o.get("receivedAtLocal") or "")
            if ns is None:
                continue
            if start_ns is not None and ns < start_ns:
                continue
            if end_ns is not None and ns > end_ns:
                continue
            b = buckets[t]
            # Keep every record but coalesce identical BBO within 0ms? Keep all —
            # files are large; subsample unchanged quotes to <=1 per 10ms.
            yb = o.get("yesBestBidCents")
            ya = o.get("yesBestAskCents")
            nb = o.get("noBestBidCents")
            na = o.get("noBestAskCents")
            sp = o.get("yesSpreadCents")
            if b["recv_ns"] and ns - b["recv_ns"][-1] < 10_000_000:
                if (
                    b["yb"][-1] == yb
                    and b["ya"][-1] == ya
                    and b["nb"][-1] == nb
                    and b["na"][-1] == na
                ):
                    continue
            b["recv_ns"].append(ns)
            b["yb"].append(-1 if yb is None else int(yb))
            b["ya"].append(-1 if ya is None else int(ya))
            b["nb"].append(-1 if nb is None else int(nb))
            b["na"].append(-1 if na is None else int(na))
            b["sp"].append(-1 if sp is None else int(sp))
            b["econ"].append(1 if o.get("isEconomicallyValid") else 0)
            b["parity"].append(1 if o.get("isParityUsable") else 0)
            b["crossed"].append(1 if o.get("yesBookCrossed") else 0)
            b["locked"].append(1 if o.get("yesBookLocked") else 0)
    out: Dict[str, Dict[str, np.ndarray]] = {}
    for t, b in buckets.items():
        out[t] = {k: np.asarray(v, dtype=np.int64 if k == "recv_ns" else np.int16) for k, v in b.items()}
    return out


def asof_indices(query_ns: np.ndarray, ref_ns: np.ndarray, tol_ns: int) -> Tuple[np.ndarray, np.ndarray]:
    """Nearest-preceding indices into ref for each query; unmatched marked -1."""
    if query_ns.size == 0 or ref_ns.size == 0:
        return np.full(query_ns.shape, -1, dtype=np.int64), np.zeros(query_ns.shape, dtype=bool)
    idx = np.searchsorted(ref_ns, query_ns, side="right") - 1
    unmatched = idx < 0
    # tolerance on lag = query - ref[idx]
    ok = ~unmatched
    lag = np.zeros(query_ns.shape, dtype=np.int64)
    lag[ok] = query_ns[ok] - ref_ns[idx[ok]]
    too_old = ok & (lag > tol_ns)
    idx[too_old] = -1
    unmatched = idx < 0
    return idx, unmatched


def field_metrics(
    q_vals: np.ndarray,
    r_vals: np.ndarray,
    idx: np.ndarray,
    unmatched: np.ndarray,
) -> Dict[str, Any]:
    matched = ~unmatched
    gathered = np.full(q_vals.shape, -1, dtype=np.int16)
    ok_idx = matched & (idx >= 0)
    gathered[ok_idx] = r_vals[idx[ok_idx]]
    both = matched & (q_vals >= 0) & (gathered >= 0)
    n_matched = int(both.sum())
    n_unmatched = int(unmatched.sum())
    n_query = int(q_vals.size)
    if n_matched == 0:
        return {
            "matched": 0,
            "unmatched": n_unmatched,
            "matchRate": 0.0 if n_query else None,
            "exactAgreementRate": None,
            "within1cRate": None,
            "absDiffCents": summarize_abs(np.asarray([], dtype=np.float64)),
        }
    diffs = np.abs(q_vals[both].astype(np.int32) - gathered[both].astype(np.int32)).astype(
        np.float64
    )
    exact = float(np.mean(diffs == 0))
    within1 = float(np.mean(diffs <= 1))
    return {
        "matched": n_matched,
        "unmatched": n_unmatched,
        "matchRate": float(n_matched / n_query) if n_query else None,
        "exactAgreementRate": exact,
        "within1cRate": within1,
        "absDiffCents": summarize_abs(diffs),
    }


def disagreement_episodes(
    q_ns: np.ndarray,
    q_vals: np.ndarray,
    r_vals: np.ndarray,
    idx: np.ndarray,
    unmatched: np.ndarray,
) -> Dict[str, Any]:
    both = (~unmatched) & (idx >= 0) & (q_vals >= 0)
    if not both.any():
        return {"episodes": 0, "longestMs": 0, "totalDisagreeMs": 0}
    gathered = r_vals[idx[both]]
    qv = q_vals[both]
    tn = q_ns[both]
    disagree = gathered != qv
    if not disagree.any():
        return {"episodes": 0, "longestMs": 0, "totalDisagreeMs": 0}
    # episode lengths via contiguous True runs using time deltas
    episodes = 0
    longest = 0
    total = 0
    run_start = None
    prev_t = None
    for i, d in enumerate(disagree):
        t = int(tn[i])
        if d:
            if run_start is None:
                run_start = t
                episodes += 1
            if prev_t is not None:
                total += t - prev_t
        else:
            if run_start is not None and prev_t is not None:
                longest = max(longest, prev_t - run_start)
            run_start = None
        prev_t = t
    if run_start is not None and prev_t is not None:
        longest = max(longest, prev_t - run_start)
    return {
        "episodes": episodes,
        "longestMs": longest / 1e6,
        "totalDisagreeMs": total / 1e6,
    }


def compare_direction(
    q_ns: np.ndarray,
    q_fields: Dict[str, np.ndarray],
    r_ns: np.ndarray,
    r_fields: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for tol_ms in TOLERANCES_MS:
        tol_ns = tol_ms * 1_000_000
        idx, unmatched = asof_indices(q_ns, r_ns, tol_ns)
        fields = {}
        for name in ["yb", "ya", "nb", "na", "sp"]:
            fields[name] = field_metrics(q_fields[name], r_fields[name], idx, unmatched)
            fields[name]["disagreement"] = disagreement_episodes(
                q_ns, q_fields[name], r_fields[name], idx, unmatched
            )
        out[str(tol_ms)] = {
            "toleranceMs": tol_ms,
            "queryPoints": int(q_ns.size),
            "refPoints": int(r_ns.size),
            "fields": fields,
        }
    return out


def transition_latency(
    cs: Dict[str, np.ndarray],
    kb: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """For each CS YES-bid/ask change >=1c, time until KB reflects compatible state."""
    cs_ns = cs["recv_ns"]
    if cs_ns.size < 2 or kb["recv_ns"].size == 0:
        return {"nTransitions": 0}
    results = {}
    for field, min_jump in [("yb", 1), ("ya", 1), ("yb", 2), ("ya", 2), ("yb", 5), ("ya", 5)]:
        vals = cs[field]
        latencies = []
        never = 0
        for i in range(1, len(vals)):
            if vals[i] < 0 or vals[i - 1] < 0:
                continue
            jump = abs(int(vals[i]) - int(vals[i - 1]))
            if jump < min_jump:
                continue
            t0 = int(cs_ns[i])
            target = int(vals[i])
            # find first KB observation at/after t0 with same field value
            j = int(np.searchsorted(kb["recv_ns"], t0, side="left"))
            found = None
            next_cs = int(cs_ns[i + 1]) if i + 1 < len(cs_ns) else None
            while j < len(kb["recv_ns"]):
                if next_cs is not None and int(kb["recv_ns"][j]) >= next_cs:
                    break
                if int(kb[field][j]) == target:
                    found = int(kb["recv_ns"][j]) - t0
                    break
                j += 1
            if found is None:
                never += 1
            else:
                latencies.append(found / 1e6)
        key = f"{field}_jump>={min_jump}c"
        results[key] = {
            "nTransitions": len(latencies) + never,
            "observed": len(latencies),
            "neverBeforeNextCsTransition": never,
            "neverRate": (never / (len(latencies) + never)) if (latencies or never) else None,
            "latencyMs": {
                "p50": pct(latencies, 0.5),
                "p90": pct(latencies, 0.9),
                "p95": pct(latencies, 0.95),
                "p99": pct(latencies, 0.99),
                "max": max(latencies) if latencies else None,
            },
        }
    return results


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def conv(o: Any) -> Any:
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(type(o))

    path.write_text(json.dumps(obj, indent=2, default=conv) + "\n")


def self_test() -> None:
    ref = np.asarray([0, 1_000_000_000, 2_000_000_000], dtype=np.int64)
    query = np.asarray([1_100_000_000, 3_500_000_000], dtype=np.int64)
    idx, unmatched = asof_indices(query, ref, tol_ns=500_000_000)
    assert int(idx[0]) == 1 and not bool(unmatched[0])
    assert bool(unmatched[1])
    ref2 = np.asarray([1_000_000_000, 2_000_000_000], dtype=np.int64)
    idx2, unmatched2 = asof_indices(
        np.asarray([500_000_000], dtype=np.int64), ref2, tol_ns=10_000_000_000
    )
    assert bool(unmatched2[0]) and int(idx2[0]) == -1
    book = BookState()
    apply_levels(book, [[0, "0.40", "10", 1], [1, "0.60", "5", 1]], True)
    bb = bbo_cents(book)
    assert bb == (40, 60, 40, 60, 20)
    apply_levels(book, [[0, "0.40", "0", 1]], False)
    assert 0.40 not in book.bids
    print("self_test_ok")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--max-tickers-per-run", type=int, default=12)
    parser.add_argument("--days", nargs="*", default=PURCHASED_DAYS)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    head = (ROOT / ".git").exists()
    import subprocess

    repo_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip()

    # Phase 0 — hashes
    hash_results = {}
    for day in args.days:
        zpath = RAW_ZIPS / f"kalshi-btc-15m_{day}.zip"
        got = sha256_file(zpath)
        hash_results[day] = {
            "path": str(zpath),
            "sha256": got,
            "expected": EXPECTED_SHA[day],
            "match": got == EXPECTED_SHA[day],
            "byteSize": zpath.stat().st_size,
        }

    kb_by_day = discover_kb_runs()
    provenance = {
        "auditId": "cryptostruct-kalshibot-overlap-fidelity-2026-09-22",
        "accessTimeUtc": utc_now(),
        "repoHead": repo_head,
        "branch": branch,
        "scientificBoundaries": {
            "m16Unchanged": True,
            "m16OutcomesUnopened": True,
            "noProspectiveM16DataUsed": True,
            "noStrategyOptimization": True,
            "noToleranceTuning": True,
            "noLiveOrders": True,
            "noAdditionalPurchases": True,
            "rawVendorImmutable": True,
        },
        "zipHashes": hash_results,
        "kalshiBotRootsChecked": [str(p) for p in KB_ROOTS],
        "kalshiBotRunsByDay": kb_by_day,
    }
    write_json(OUT / "cryptostruct-overlap-provenance.json", provenance)

    # Phase 1 inventory
    zip_inv = {}
    for day in args.days:
        zip_inv[day] = inventory_zip(day, RAW_ZIPS / f"kalshi-btc-15m_{day}.zip")
    write_json(OUT / "cryptostruct-overlap-inventory.json", {"days": zip_inv, "kbRuns": kb_by_day})

    clock_audit: Dict[str, Any] = {"days": {}}
    bbo_fidelity: Dict[str, Any] = {"days": {}}
    transition_out: Dict[str, Any] = {"days": {}}
    lifecycle_out: Dict[str, Any] = {"days": {}}
    worst_cases: List[Dict[str, Any]] = []

    for day in args.days:
        print(f"=== DAY {day} ===", flush=True)
        zpath = RAW_ZIPS / f"kalshi-btc-15m_{day}.zip"
        inv = zip_inv[day]
        member_by_ticker = {
            e["ticker"]: e["name"] for e in inv["entries"] if e.get("ticker") and e["name"].endswith(".zst")
        }
        day_runs = [r for r in kb_by_day.get(day, []) if r["usable"]]
        day_clock = {"runs": {}}
        day_bbo = {"runs": {}}
        day_tr = {"runs": {}}
        day_lc = {"runs": {}}

        for run in day_runs:
            print(f"  run {run['runId']}", flush=True)
            shared = sorted(set(run["tickers"]) & set(member_by_ticker))
            # Prefer tickers whose HHMM falls inside the run window for denser overlap
            if len(shared) > args.max_tickers_per_run:
                # take evenly spaced sample across shared list for coverage
                step = max(1, len(shared) // args.max_tickers_per_run)
                shared = shared[::step][: args.max_tickers_per_run]
            print(f"    shared_sample={len(shared)} / available_shared={len(set(run['tickers']) & set(member_by_ticker))}", flush=True)

            kb_data = stream_kb_tob(
                Path(run["path"]) / "top-of-book.jsonl",
                shared,
                run["startNs"],
                run["endNs"],
            )

            run_clock = {"tickers": {}}
            run_bbo = {"tickers": {}, "sharedTickersAll": sorted(set(run["tickers"]) & set(member_by_ticker))}
            run_tr = {"tickers": {}}
            run_lc = {"tickers": {}}

            for ticker in shared:
                member = member_by_ticker[ticker]
                print(f"    ticker {ticker}", flush=True)
                cs = stream_cs_bbo(zpath, member, run["startNs"], run["endNs"])
                kb = kb_data.get(ticker)
                if kb is None or kb["recv_ns"].size == 0:
                    run_bbo["tickers"][ticker] = {"error": "no_kalshibot_observations_in_window"}
                    continue
                if cs["bbo"]["recv_ns"].size == 0:
                    run_bbo["tickers"][ticker] = {"error": "no_cryptostruct_bbo_in_window", "csMeta": {k: v for k, v in cs.items() if k != "bbo"}}
                    continue

                cs_b = cs["bbo"]
                run_clock["tickers"][ticker] = {
                    "cryptostruct": {
                        "firstRecvNs": cs["firstRecvNs"],
                        "lastRecvNs": cs["lastRecvNs"],
                        "latencyMs": cs["latencyMs"],
                        "tsRegressRecv": cs["tsRegressRecv"],
                        "tsDupRecv": cs["tsDupRecv"],
                        "bboPoints": int(cs_b["recv_ns"].size),
                        "chainBreaks": cs["chainBreaks"],
                    },
                    "kalshiBot": {
                        "firstRecvNs": int(kb["recv_ns"][0]),
                        "lastRecvNs": int(kb["recv_ns"][-1]),
                        "points": int(kb["recv_ns"].size),
                        "econValidRate": float(np.mean(kb["econ"])) if kb["econ"].size else None,
                        "parityUsableRate": float(np.mean(kb["parity"])) if kb["parity"].size else None,
                        "crossedRate": float(np.mean(kb["crossed"])) if kb["crossed"].size else None,
                        "lockedRate": float(np.mean(kb["locked"])) if kb["locked"].size else None,
                    },
                }

                # Bidirectional ASOF
                a_kb_to_cs = compare_direction(
                    kb["recv_ns"],
                    {k: kb[k] for k in ["yb", "ya", "nb", "na", "sp"]},
                    cs_b["recv_ns"],
                    {k: cs_b[k] for k in ["yb", "ya", "nb", "na", "sp"]},
                )
                b_cs_to_kb = compare_direction(
                    cs_b["recv_ns"],
                    {k: cs_b[k] for k in ["yb", "ya", "nb", "na", "sp"]},
                    kb["recv_ns"],
                    {k: kb[k] for k in ["yb", "ya", "nb", "na", "sp"]},
                )
                run_bbo["tickers"][ticker] = {
                    "overlap": {
                        "kbPoints": int(kb["recv_ns"].size),
                        "csPoints": int(cs_b["recv_ns"].size),
                        "kbFirst": int(kb["recv_ns"][0]),
                        "kbLast": int(kb["recv_ns"][-1]),
                        "csFirst": int(cs_b["recv_ns"][0]),
                        "csLast": int(cs_b["recv_ns"][-1]),
                        "durationMs": (min(int(kb["recv_ns"][-1]), int(cs_b["recv_ns"][-1])) - max(int(kb["recv_ns"][0]), int(cs_b["recv_ns"][0]))) / 1e6,
                    },
                    "csMeta": {k: v for k, v in cs.items() if k != "bbo"},
                    "A_kalshiBot_to_cryptostruct": a_kb_to_cs,
                    "B_cryptostruct_to_kalshiBot": b_cs_to_kb,
                }

                # Capture worst within-1c shortfall at 1s for YES bid (direction A)
                try:
                    m1 = a_kb_to_cs["1000"]["fields"]["yb"]
                    worst_cases.append(
                        {
                            "day": day,
                            "runId": run["runId"],
                            "ticker": ticker,
                            "direction": "A_kb_to_cs",
                            "tolMs": 1000,
                            "field": "yb",
                            "exact": m1["exactAgreementRate"],
                            "within1c": m1["within1cRate"],
                            "mae": (m1["absDiffCents"] or {}).get("mean"),
                            "p95": (m1["absDiffCents"] or {}).get("p95"),
                            "max": (m1["absDiffCents"] or {}).get("max"),
                        }
                    )
                except Exception:
                    pass

                run_tr["tickers"][ticker] = transition_latency(cs_b, kb)
                run_lc["tickers"][ticker] = {
                    "kbFirst": int(kb["recv_ns"][0]),
                    "kbLast": int(kb["recv_ns"][-1]),
                    "csFirst": int(cs_b["recv_ns"][0]),
                    "csLast": int(cs_b["recv_ns"][-1]),
                    "kbCoverageMs": (int(kb["recv_ns"][-1]) - int(kb["recv_ns"][0])) / 1e6,
                    "csCoverageMs": (int(cs_b["recv_ns"][-1]) - int(cs_b["recv_ns"][0])) / 1e6,
                    "csTradeCountInFileWindow": cs["tradeCount"],
                }

            day_clock["runs"][run["runId"]] = run_clock
            day_bbo["runs"][run["runId"]] = run_bbo
            day_tr["runs"][run["runId"]] = run_tr
            day_lc["runs"][run["runId"]] = run_lc

            # Persist intermediate per-run to limit loss on crash
            write_json(WORK / f"partial-{day}-{run['runId']}.json", {"bbo": run_bbo, "clock": run_clock})

        clock_audit["days"][day] = day_clock
        bbo_fidelity["days"][day] = day_bbo
        transition_out["days"][day] = day_tr
        lifecycle_out["days"][day] = day_lc
        write_json(OUT / "cryptostruct-clock-audit.json", clock_audit)
        write_json(OUT / "cryptostruct-bbo-fidelity.json", bbo_fidelity)
        write_json(OUT / "cryptostruct-transition-latency.json", transition_out)
        write_json(OUT / "cryptostruct-lifecycle-audit.json", lifecycle_out)

    # Aggregate helpers
    def aggregate_field(tol: str, field: str, direction: str) -> Dict[str, Any]:
        exacts, w1, maes, p95s, match_rates = [], [], [], [], []
        for day, dobj in bbo_fidelity["days"].items():
            for run_id, robj in dobj.get("runs", {}).items():
                for ticker, tobj in robj.get("tickers", {}).items():
                    block = tobj.get(direction, {})
                    if tol not in block:
                        continue
                    m = block[tol]["fields"].get(field)
                    if not m or m.get("exactAgreementRate") is None:
                        continue
                    exacts.append(m["exactAgreementRate"])
                    w1.append(m["within1cRate"])
                    if m["absDiffCents"]["mean"] is not None:
                        maes.append(m["absDiffCents"]["mean"])
                        p95s.append(m["absDiffCents"]["p95"])
                    if m.get("matchRate") is not None:
                        match_rates.append(m["matchRate"])
        return {
            "tickerSamples": len(exacts),
            "exactAgreementRateMean": float(np.mean(exacts)) if exacts else None,
            "within1cRateMean": float(np.mean(w1)) if w1 else None,
            "maeMean": float(np.mean(maes)) if maes else None,
            "p95Mean": float(np.mean(p95s)) if p95s else None,
            "matchRateMean": float(np.mean(match_rates)) if match_rates else None,
        }

    aggregate = {"A_kalshiBot_to_cryptostruct": {}, "B_cryptostruct_to_kalshiBot": {}}
    for direction in aggregate:
        aggregate[direction] = {
            tol: {f: aggregate_field(tol, f, direction) for f in ["yb", "ya", "nb", "na", "sp"]}
            for tol in ["100", "500", "1000", "2000", "5000"]
        }

    # Suitability / purchase verdict (conservative, based on aggregates)
    a1 = aggregate["A_kalshiBot_to_cryptostruct"]["1000"]["yb"]
    a100 = aggregate["A_kalshiBot_to_cryptostruct"]["100"]["yb"]
    within1_1s = a1.get("within1cRateMean") or 0
    exact_1s = a1.get("exactAgreementRateMean") or 0
    within1_100 = a100.get("within1cRateMean") or 0

    if within1_1s >= 0.95 and exact_1s >= 0.85:
        overall = "PASS"
        purchase = "A"
    elif within1_1s >= 0.85 and within1_100 >= 0.70:
        overall = "PASS WITH CAVEATS"
        purchase = "A"
    elif within1_1s >= 0.70:
        overall = "MARGINAL"
        purchase = "B"
    else:
        overall = "FAIL"
        purchase = "D"

    worst_sorted = sorted(
        [w for w in worst_cases if w.get("within1c") is not None],
        key=lambda w: w["within1c"],
    )[:15]

    verdict = {
        "overall": overall,
        "purchaseRecommendation": purchase,
        "aggregate": aggregate,
        "worstWithin1cAt1sYesBid": worst_sorted,
        "qualityAuditOnlyDays": PURCHASED_DAYS,
        "reservationStatuses": {d: "QUALITY_AUDIT_ONLY" for d in PURCHASED_DAYS},
        "hashMatchAll": all(v["match"] for v in hash_results.values()),
        "notes": [
            "Primary ASOF uses KalshiBot receivedAtLocal vs CryptoStruct adapter receive timestamps.",
            "CryptoStruct NO quotes derived via Kalshi complement from YES book.",
            "KalshiBot TOB already stores YES/NO BBO in integer cents.",
            "Tolerances predetermined; not tuned to agreement.",
            "Per-run ticker samples capped for tractability; full shared ticker lists retained in artifacts.",
        ],
    }
    write_json(OUT / "cryptostruct-fidelity-verdict.json", verdict)
    print(json.dumps({"overall": overall, "purchase": purchase, "agg_1s_yb": a1}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
