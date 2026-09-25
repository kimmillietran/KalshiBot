#!/usr/bin/env python3
"""Recover YES BBO / midpoint / executable NO ask at retained friction sample times.

Streams M16-ER CryptoStruct RAW-BBO-CHANGE day ZIPs. Emits one feature row per
retained friction sample. No P&L, no settlement labels, no downloads.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import zstandard as zstd

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/external-samples/cryptostruct/m16-er/raw"
SAMPLES = (
    ROOT
    / "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl"
)
OUT_DIR = (
    ROOT
    / "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work"
)

ADAPTER_ID = "RAW-BBO-CHANGE"
ADAPTER_IDENTITY = "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d"
MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}
TICKER_RE = re.compile(r"(KXBTC15M-(\d{2})([A-Z]{3})(\d{2})(\d{4})-(\d{2}))")


def apply_levels(bids: Dict[float, float], asks: Dict[float, float], levels: list, snapshot: bool) -> None:
    if snapshot:
        bids.clear()
        asks.clear()
    for lvl in levels:
        if not isinstance(lvl, list) or len(lvl) < 3:
            continue
        side, ps, qs = lvl[0], lvl[1], lvl[2]
        try:
            price = float(ps)
            qty = float(qs)
        except Exception:
            continue
        if not (0.0 <= price <= 1.0) or qty < 0 or math.isnan(price) or math.isnan(qty):
            continue
        book = bids if side == 0 else asks
        if qty == 0:
            book.pop(price, None)
        else:
            book[price] = qty


def derive_bbo_cents(bids: Dict[float, float], asks: Dict[float, float]):
    if not bids or not asks:
        return None
    yb = max(bids)
    ya = min(asks)
    yes_bid_cents = int(round(yb * 100))
    yes_ask_cents = int(round(ya * 100))
    return {
        "yesBidCents": yes_bid_cents,
        "yesAskCents": yes_ask_cents,
        "yesMidpoint": (yes_bid_cents + yes_ask_cents) / 2 / 100,
        "noAskCents": 100 - yes_bid_cents,
        "yesBidSize": bids[yb],
        "yesAskSize": asks[ya],
        "crossed": yb > ya,
        "locked": yb == ya,
        "halfSpreadCents": (yes_ask_cents - yes_bid_cents) / 2,
    }


def parse_close_ms_from_ticker(ticker: str) -> Optional[int]:
    m = TICKER_RE.search(ticker)
    if not m:
        return None
    yy, mon, dd, hhmm = int(m.group(2)), m.group(3), int(m.group(4)), m.group(5)
    month = MONTHS.get(mon)
    if month is None:
        return None
    hour = int(hhmm[:2])
    minute = int(hhmm[2:])
    year = 2000 + yy
    local = datetime(year, month, dd, hour, minute, tzinfo=ZoneInfo("America/New_York"))
    return int(local.astimezone(timezone.utc).timestamp() * 1000)


def load_samples_index(samples_path: Path) -> Dict[str, Dict[str, Dict[int, dict]]]:
    """utcDay -> ticker -> entryTimestampMs -> sample"""
    index: Dict[str, Dict[str, Dict[int, dict]]] = {}
    with samples_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            sample = json.loads(line)
            day = sample["utcDayKey"]
            ticker = sample["marketTicker"]
            ts = int(sample["entryTimestampMs"])
            index.setdefault(day, {}).setdefault(ticker, {})[ts] = sample
    return index


def process_member(
    zpath: Path,
    member: str,
    utc_day: str,
    wanted_ts: Dict[int, dict],
) -> Tuple[List[dict], dict]:
    """Mirror scripts/research/streamSettlementFrictionCoverage.py wire format."""
    ticker_m = TICKER_RE.search(member)
    ticker = ticker_m.group(1) if ticker_m else None
    close_ms = parse_close_ms_from_ticker(ticker) if ticker else None

    bids: Dict[float, float] = {}
    asks: Dict[float, float] = {}
    captured: Dict[int, dict] = {}
    events = 0
    left_truncation = False
    ready = False
    max_wanted = max(wanted_ts.keys()) if wanted_ts else 0
    done = False

    dctx = zstd.ZstdDecompressor()
    with zipfile.ZipFile(zpath) as zf, zf.open(member) as raw, dctx.stream_reader(raw) as reader:
        buf = b""
        while not done:
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
                    continue
                if isinstance(obj, dict) and "instrument" in obj:
                    inst = obj["instrument"]
                    ticker = inst.get("code") or ticker
                    if ticker:
                        close_ms = parse_close_ms_from_ticker(ticker)
                    continue
                if not isinstance(obj, list) or len(obj) < 6:
                    continue
                msg = obj[0]
                ad_ts = obj[4]
                data = obj[6:] if len(obj) > 6 else []
                if msg not in (0, 1):
                    continue
                if not isinstance(ad_ts, int) or ad_ts <= 0:
                    continue
                if msg == 0:
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, True)
                        ready = True
                else:
                    if not ready:
                        left_truncation = True
                        continue
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, False)
                events += 1
                ts_ms = ad_ts // 1_000_000
                if ts_ms in wanted_ts:
                    bbo = derive_bbo_cents(bids, asks)
                    sample = wanted_ts[ts_ms]
                    retained_half = sample.get("entryHalfSpreadCents")
                    mismatch = None
                    matches_retained = False
                    if bbo is not None and retained_half is not None:
                        if abs(bbo["halfSpreadCents"] - float(retained_half)) <= 1e-9:
                            matches_retained = True
                        else:
                            mismatch = {
                                "retainedHalfSpreadCents": retained_half,
                                "regeneratedHalfSpreadCents": bbo["halfSpreadCents"],
                            }
                    row = {
                        "utcDayKey": utc_day,
                        "marketTicker": ticker or member,
                        "entryTimestampMs": ts_ms,
                        "closeTimeMs": close_ms,
                        "timeRemainingMs": (
                            None if close_ms is None else close_ms - ts_ms
                        ),
                        "retainedEntryFrictionCents": sample.get("entryFrictionCents"),
                        "retainedEntryHalfSpreadCents": retained_half,
                        "retainedEntryFeeCents": sample.get("entryFeeCents"),
                        "bookFeatureStatus": "ok" if bbo else "missing-bbo",
                        "halfSpreadMismatch": mismatch,
                        **(bbo or {}),
                    }
                    existing = captured.get(ts_ms)
                    if existing is None:
                        captured[ts_ms] = row
                    elif existing.get("halfSpreadMismatch") and matches_retained:
                        # Prefer an intra-ms book state that matches retained
                        # half-spread when multiple updates share the admission ms.
                        captured[ts_ms] = row
                    # else keep existing (already matched, or both mismatch)
                if ts_ms > max_wanted and len(captured) == len(wanted_ts):
                    done = True
                    break

    remaining_after = set(wanted_ts.keys()) - set(captured.keys())
    rows = [captured[ts] for ts in sorted(captured.keys())]
    meta = {
        "member": member,
        "ticker": ticker,
        "events": events,
        "wanted": len(wanted_ts),
        "recovered": len(captured),
        "missingTimestamps": sorted(remaining_after),
        "leftTruncation": left_truncation,
    }
    for ts_ms in sorted(remaining_after):
        sample = wanted_ts[ts_ms]
        rows.append(
            {
                "utcDayKey": utc_day,
                "marketTicker": ticker or member,
                "entryTimestampMs": ts_ms,
                "closeTimeMs": close_ms,
                "timeRemainingMs": None if close_ms is None else close_ms - ts_ms,
                "retainedEntryFrictionCents": sample.get("entryFrictionCents"),
                "retainedEntryHalfSpreadCents": sample.get("entryHalfSpreadCents"),
                "retainedEntryFeeCents": sample.get("entryFeeCents"),
                "bookFeatureStatus": "timestamp-not-found-in-stream",
                "halfSpreadMismatch": None,
            }
        )
    return rows, meta


def process_day(args: Tuple[str, Path, Dict[str, Dict[int, dict]]]) -> dict:
    utc_day, zpath, by_ticker = args
    rows: List[dict] = []
    metas: List[dict] = []
    if not zpath.is_file():
        return {
            "utcDayKey": utc_day,
            "status": "missing-zip",
            "zipPath": str(zpath),
            "rows": [],
            "metas": [],
        }
    with zipfile.ZipFile(zpath) as zf:
        members = [n for n in zf.namelist() if n.endswith(".txt.zst")]
    print(f"  {utc_day}: {len(members)} members, {len(by_ticker)} tickers wanted", flush=True)
    for member in members:
        m = TICKER_RE.search(member)
        if not m:
            continue
        ticker = m.group(1)
        wanted = by_ticker.get(ticker)
        if not wanted:
            continue
        print(f"  {utc_day}: streaming {ticker} n={len(wanted)}", flush=True)
        m_rows, meta = process_member(zpath, member, utc_day, wanted)
        rows.extend(m_rows)
        metas.append(meta)
        print(
            f"  {utc_day}: done {ticker} recovered={meta['recovered']}/{meta['wanted']} "
            f"events={meta['events']}",
            flush=True,
        )
    # tickers with no member file
    present = {meta["ticker"] for meta in metas if meta.get("ticker")}
    for ticker, wanted in by_ticker.items():
        if ticker in present:
            continue
        close_ms = parse_close_ms_from_ticker(ticker)
        for ts_ms, sample in wanted.items():
            rows.append(
                {
                    "utcDayKey": utc_day,
                    "marketTicker": ticker,
                    "entryTimestampMs": ts_ms,
                    "closeTimeMs": close_ms,
                    "timeRemainingMs": None if close_ms is None else close_ms - ts_ms,
                    "retainedEntryFrictionCents": sample.get("entryFrictionCents"),
                    "retainedEntryHalfSpreadCents": sample.get("entryHalfSpreadCents"),
                    "retainedEntryFeeCents": sample.get("entryFeeCents"),
                    "bookFeatureStatus": "market-file-missing-in-zip",
                    "halfSpreadMismatch": None,
                }
            )
    return {
        "utcDayKey": utc_day,
        "status": "processed",
        "zipPath": str(zpath),
        "rows": rows,
        "metas": metas,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=Path, default=SAMPLES)
    ap.add_argument("--raw-dir", type=Path, default=RAW)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--days", type=str, default="", help="comma-separated UTC days (optional)")
    args = ap.parse_args()

    print("loading samples", args.samples, flush=True)
    index = load_samples_index(args.samples)
    days = sorted(index.keys())
    if args.days.strip():
        allow = {d.strip() for d in args.days.split(",") if d.strip()}
        days = [d for d in days if d in allow]
    print(f"days={len(days)} sampleMarkets="
          f"{sum(len(v) for v in index.values())}", flush=True)

    jobs = []
    for day in days:
        zpath = args.raw_dir / f"kalshi-btc-15m_{day}.zip"
        jobs.append((day, zpath, index[day]))

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_path = args.out_dir / "book-features.jsonl"
    day_meta_path = args.out_dir / "book-features-by-day.json"

    all_rows: List[dict] = []
    day_summaries: List[dict] = []

    def handle_result(res: dict) -> None:
        day = res["utcDayKey"]
        rows = res["rows"]
        all_rows.extend(rows)
        ok = sum(1 for r in rows if r.get("bookFeatureStatus") == "ok")
        mismatch = sum(1 for r in rows if r.get("halfSpreadMismatch"))
        day_summaries.append(
            {
                "utcDayKey": day,
                "status": res["status"],
                "zipPath": res["zipPath"],
                "sampleRows": len(rows),
                "bookOk": ok,
                "halfSpreadMismatchCount": mismatch,
                "membersProcessed": len(res.get("metas") or []),
            }
        )
        print(
            f"{day} status={res['status']} rows={len(rows)} bookOk={ok} "
            f"mismatch={mismatch}",
            flush=True,
        )

    if args.workers <= 1:
        for job in jobs:
            handle_result(process_day(job))
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futs = {pool.submit(process_day, job): job[0] for job in jobs}
            for fut in as_completed(futs):
                handle_result(fut.result())

    all_rows.sort(key=lambda r: (r["utcDayKey"], r["marketTicker"], r["entryTimestampMs"]))
    with out_path.open("w", encoding="utf-8") as fh:
        for row in all_rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")
    day_summaries.sort(key=lambda d: d["utcDayKey"])
    day_meta_path.write_text(
        json.dumps(
            {
                "adapterId": ADAPTER_ID,
                "adapterIdentity": ADAPTER_IDENTITY,
                "samplesPath": str(args.samples),
                "rawDir": str(args.raw_dir),
                "rowCount": len(all_rows),
                "days": day_summaries,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("wrote", out_path, "rows", len(all_rows), flush=True)


if __name__ == "__main__":
    main()
