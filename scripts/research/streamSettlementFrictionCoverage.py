#!/usr/bin/env python3
"""Stream CryptoStruct M16-ER day ZIPs → settlement-friction sample JSONL.

Online RAW-BBO-CHANGE reconstruction with cadence sampling and response matching.
No P&L, no alpha, no downloads. Writes gitignored work artifacts for the TS reporter.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import zstandard as zstd

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/external-samples/cryptostruct/m16-er/raw"
WORK = ROOT / "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage"
AUDIT = ROOT / "data/research-results/external-kalshi-data-audit"

ADAPTER_ID = "RAW-BBO-CHANGE"
ADAPTER_IDENTITY = "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d"
CADENCE_MS = 60_000
HORIZONS_MS = (5_000, 15_000, 30_000)
TOLERANCE_MS = 250
MAX_QUOTE_AGE_MS = 2_000
MIN_SIZE = 1.0
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


def bbo(bids: Dict[float, float], asks: Dict[float, float]):
    if not bids or not asks:
        return None
    yb = max(bids)
    ya = min(asks)
    return yb, ya, bids[yb], asks[ya], yb > ya, yb == ya


def taker_fee_cents(price_cents: int) -> int:
    """STANDARD taker ceil-cent — matches computeKalshiScheduleFeeCents."""
    if not (0 <= price_cents <= 100):
        raise ValueError(f"bad price {price_cents}")
    # ceil(7 * qty * p * (100-p) / (100 * 100)) with qty=1
    return int(math.ceil((7 * price_cents * (100 - price_cents)) / 10000))


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


def parse_start_ms(start: Optional[str]) -> Optional[int]:
    if not isinstance(start, str) or len(start) < 19:
        return None
    iso = start.replace(" ", "T") + "Z"
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return None


@dataclass
class EligibleQuote:
    timestamp_ms: int
    yes_bid: int
    yes_ask: int
    no_bid: int
    yes_bid_size: float
    yes_ask_size: float
    mid: float
    complement_ask: bool


@dataclass
class Pending:
    horizon_ms: int
    entry: EligibleQuote
    target_ms: int
    upper_ms: int


@dataclass
class MarketState:
    last_bucket: float = field(default=float("-inf"))
    last_key: Optional[Tuple] = None
    pending: List[Pending] = field(default_factory=list)
    samples_by_entry_ts: Dict[int, dict] = field(default_factory=dict)
    exclusions: Dict[str, int] = field(default_factory=dict)

    def bump(self, reason: str) -> None:
        self.exclusions[reason] = self.exclusions.get(reason, 0) + 1


def eligible_from_bbo(yb, ya, yb_sz, ya_sz, crossed, locked, fail_closed, ts_ms, open_ms, close_ms, quote_age_ms):
    reasons = []
    if fail_closed:
        reasons.append("structural-gap")
    if crossed:
        reasons.append("crossed-book")
    if locked:
        reasons.append("locked-book")
    if yb_sz < MIN_SIZE or ya_sz < MIN_SIZE:
        reasons.append("insufficient-size")
    if quote_age_ms is None:
        reasons.append("missing-quote-age")
    elif quote_age_ms > MAX_QUOTE_AGE_MS:
        reasons.append("stale-quote")
    if open_ms is not None and ts_ms < open_ms:
        reasons.append("outside-session")
    if close_ms is not None and ts_ms > close_ms:
        reasons.append("outside-session")
    yb_c = int(round(yb * 100))
    ya_c = int(round(ya * 100))
    nb_c = int(round((1.0 - ya) * 100))
    mid = 50.0 + (yb_c - nb_c) / 2.0
    if not (0 <= yb_c <= 100 and 0 <= ya_c <= 100):
        reasons.append("missing-prices")
    return reasons, EligibleQuote(
        timestamp_ms=ts_ms,
        yes_bid=yb_c,
        yes_ask=ya_c,
        no_bid=nb_c,
        yes_bid_size=yb_sz,
        yes_ask_size=ya_sz,
        mid=mid,
        complement_ask=False,
    )


def entry_friction(q: EligibleQuote) -> Tuple[float, float, int]:
    half = q.yes_ask - q.mid
    fee = taker_fee_cents(q.yes_ask)
    return half, float(fee), half + fee


def rt_friction(entry: EligibleQuote, exit_q: EligibleQuote) -> Tuple[float, float, int, float]:
    entry_half, entry_fee, _ = entry_friction(entry)
    response_half = exit_q.mid - exit_q.yes_bid
    exit_fee = taker_fee_cents(exit_q.yes_bid)
    total = entry_half + response_half + entry_fee + exit_fee
    return response_half, float(exit_fee), exit_fee, total


def process_member(zpath: Path, member: str, utc_day: str) -> Tuple[List[dict], Dict[str, int], dict]:
    bids: Dict[float, float] = {}
    asks: Dict[float, float] = {}
    ready = False
    fail_closed = False
    last_eid = None
    ticker = None
    open_ms = None
    close_ms = None
    state = MarketState()
    events = 0
    left_truncation = False

    dctx = zstd.ZstdDecompressor()
    with zipfile.ZipFile(zpath) as z, z.open(member) as raw, dctx.stream_reader(raw) as reader:
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
                    continue
                if isinstance(obj, dict) and "instrument" in obj:
                    inst = obj["instrument"]
                    ticker = inst.get("code") or ticker
                    open_ms = parse_start_ms(inst.get("start"))
                    if ticker:
                        close_ms = parse_close_ms_from_ticker(ticker)
                    continue
                if not isinstance(obj, list) or len(obj) < 6:
                    continue
                msg = obj[0]
                prev_eid, eid, ad_ts = obj[2], obj[3], obj[4]
                data = obj[6:] if len(obj) > 6 else []
                if msg not in (0, 1):
                    continue
                if not isinstance(ad_ts, int) or ad_ts <= 0:
                    continue
                if last_eid is not None and prev_eid not in (None, "", "0"):
                    if str(prev_eid) != str(last_eid):
                        fail_closed = True
                if eid not in (None, ""):
                    last_eid = eid
                if msg == 0:
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, True)
                        ready = True
                        fail_closed = False
                else:
                    if not ready:
                        left_truncation = True
                        continue
                    if fail_closed:
                        state.bump("structural-gap")
                        continue
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, False)
                events += 1
                bb = bbo(bids, asks)
                ts_ms = ad_ts // 1_000_000
                if bb is None:
                    state.bump("missing-prices")
                    continue
                yb, ya, yb_sz, ya_sz, crossed, locked = bb
                reasons, quote = eligible_from_bbo(
                    yb, ya, yb_sz, ya_sz, crossed, locked, fail_closed,
                    ts_ms, open_ms, close_ms, 0,
                )
                # RAW-BBO-CHANGE key
                key = (quote.yes_bid, quote.no_bid, len(reasons) == 0, fail_closed)
                if key == state.last_key:
                    continue
                state.last_key = key

                # resolve pending responses on this eligible quote stream only
                still: List[Pending] = []
                for pending in state.pending:
                    if ts_ms <= pending.entry.timestamp_ms:
                        still.append(pending)
                        continue
                    sample = state.samples_by_entry_ts.get(pending.entry.timestamp_ms)
                    if ts_ms > pending.upper_ms:
                        if sample is not None:
                            sample["roundTripByHorizon"][str(pending.horizon_ms)] = {
                                "observable": False,
                                "roundTripFrictionCents": None,
                                "responseHalfSpreadCents": None,
                                "exitFeeCents": None,
                                "exitTimestampMs": None,
                            }
                        continue
                    if ts_ms >= pending.target_ms and not reasons:
                        rh, ef, _, total = rt_friction(pending.entry, quote)
                        if sample is not None:
                            sample["roundTripByHorizon"][str(pending.horizon_ms)] = {
                                "observable": True,
                                "roundTripFrictionCents": total,
                                "responseHalfSpreadCents": rh,
                                "exitFeeCents": ef,
                                "exitTimestampMs": ts_ms,
                            }
                        continue
                    still.append(pending)
                state.pending = still

                if reasons:
                    for r in reasons:
                        state.bump(r)
                    continue

                bucket = ts_ms // CADENCE_MS
                if bucket <= state.last_bucket:
                    continue
                state.last_bucket = bucket
                half, fee, entry_total = entry_friction(quote)
                sample = {
                    "utcDayKey": utc_day,
                    "marketTicker": ticker or member,
                    "entryTimestampMs": ts_ms,
                    "entryFrictionCents": entry_total,
                    "entryHalfSpreadCents": half,
                    "entryFeeCents": fee,
                    "complementDerivedAsk": False,
                    "roundTripByHorizon": {},
                }
                for h in HORIZONS_MS:
                    sample["roundTripByHorizon"][str(h)] = {
                        "observable": False,
                        "roundTripFrictionCents": None,
                        "responseHalfSpreadCents": None,
                        "exitFeeCents": None,
                        "exitTimestampMs": None,
                    }
                    state.pending.append(
                        Pending(
                            horizon_ms=h,
                            entry=quote,
                            target_ms=ts_ms + h,
                            upper_ms=ts_ms + h + TOLERANCE_MS,
                        )
                    )
                state.samples_by_entry_ts[ts_ms] = sample

    # flush pending as unobservable
    for pending in state.pending:
        sample = state.samples_by_entry_ts.get(pending.entry.timestamp_ms)
        if sample is None:
            continue
        cell = sample["roundTripByHorizon"].get(str(pending.horizon_ms))
        if cell and cell.get("observable") is not True:
            sample["roundTripByHorizon"][str(pending.horizon_ms)] = {
                "observable": False,
                "roundTripFrictionCents": None,
                "responseHalfSpreadCents": None,
                "exitFeeCents": None,
                "exitTimestampMs": None,
            }

    cleaned = list(state.samples_by_entry_ts.values())

    meta = {
        "ticker": ticker,
        "member": member,
        "events": events,
        "openTimeMs": open_ms,
        "closeTimeMs": close_ms,
        "leftTruncation": left_truncation,
        "retainedSamples": len(cleaned),
        "sessionCoverageNote": (
            "left-truncated-before-snapshot" if left_truncation
            else "instrument-start-to-ticker-close-when-available"
        ),
    }
    return cleaned, state.exclusions, meta


def process_day(utc_day: str) -> dict:
    zpath = RAW / f"kalshi-btc-15m_{utc_day}.zip"
    if not zpath.exists():
        return {
            "utcDayKey": utc_day,
            "status": "missing-local",
            "reason": "zip-missing",
            "marketsSeen": 0,
            "retainedSamples": 0,
            "sessionCoverageNote": "not processed as a complete session",
            "samples": [],
            "exclusions": {},
        }
    samples: List[dict] = []
    exclusions: Dict[str, int] = {}
    markets = 0
    left_trunc_markets = 0
    with zipfile.ZipFile(zpath) as z:
        members = [n for n in z.namelist() if n.endswith(".zst") and "KXBTC15M" in n]
    for member in members:
        markets += 1
        m_samples, m_excl, meta = process_member(zpath, member, utc_day)
        samples.extend(m_samples)
        if meta.get("leftTruncation"):
            left_trunc_markets += 1
        for k, v in m_excl.items():
            exclusions[k] = exclusions.get(k, 0) + v
    return {
        "utcDayKey": utc_day,
        "status": "processed" if samples else "rejected",
        "reason": None if samples else "zero-retained-samples",
        "marketsSeen": markets,
        "retainedSamples": len(samples),
        "leftTruncatedMarkets": left_trunc_markets,
        "sessionCoverageNote": (
            f"processed {markets} markets; leftTruncatedMarkets={left_trunc_markets}; "
            "not all markets are guaranteed complete sessions"
        ),
        "samples": samples,
        "exclusions": exclusions,
    }


def load_eligible_days() -> List[str]:
    clusters = json.loads((AUDIT / "m16-er-day-clusters.json").read_text())
    spent = json.loads((AUDIT / "cryptostruct-reservoir-status.json").read_text())[
        "datesByState"
    ]["SPENT_VALIDATION"]
    m16 = [d["utcDayKey"] for d in clusters["days"]]
    if len(m16) != len(set(m16)) or len(spent) != len(set(spent)):
        raise SystemExit("duplicate days in authority artifacts")
    if set(m16) != set(spent) or len(m16) != 34:
        raise SystemExit("eligible calendar mismatch")
    return sorted(m16)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=max(1, min(14, (os_cpu()))))
    parser.add_argument("--max-days", type=int, default=0, help="0 = all eligible")
    args = parser.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    days = load_eligible_days()
    if args.max_days > 0:
        days = days[: args.max_days]

    results = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(process_day, d): d for d in days}
        for fut in as_completed(futs):
            day = futs[fut]
            res = fut.result()
            results.append(res)
            print(
                f"{day} status={res['status']} markets={res['marketsSeen']} "
                f"samples={res['retainedSamples']}",
                flush=True,
            )

    results.sort(key=lambda r: r["utcDayKey"])
    samples_path = WORK / "samples.jsonl"
    with samples_path.open("w", encoding="utf-8") as fh:
        for res in results:
            for sample in res["samples"]:
                fh.write(json.dumps(sample, separators=(",", ":")) + "\n")

    exclusions: Dict[str, int] = {}
    for res in results:
        for k, v in res.get("exclusions", {}).items():
            exclusions[k] = exclusions.get(k, 0) + v

    available = [r["utcDayKey"] for r in results if r["status"] != "missing-local"]
    day_notes = [
        {
            "utcDayKey": r["utcDayKey"],
            "status": r["status"],
            "reason": r["reason"],
            "marketsSeen": r["marketsSeen"],
            "retainedSamples": r["retainedSamples"],
            "sessionCoverageNote": r["sessionCoverageNote"],
        }
        for r in results
    ]
    meta = {
        "adapterId": ADAPTER_ID,
        "adapterIdentity": ADAPTER_IDENTITY,
        "eligibleDays": days,
        "availableDays": available,
        "dayNotes": day_notes,
        "exclusions": exclusions,
        "samplesPath": str(samples_path.relative_to(ROOT)),
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
    }
    (WORK / "stream-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (WORK / "available-days.json").write_text(json.dumps(available, indent=2) + "\n")
    (WORK / "day-notes.json").write_text(json.dumps(day_notes, indent=2) + "\n")
    (WORK / "exclusions.json").write_text(json.dumps(exclusions, indent=2) + "\n")
    # empty labels file — local official settlement labels not present in CS zips
    (WORK / "labels.jsonl").write_text("")
    print("wrote", samples_path, "samples", sum(r["retainedSamples"] for r in results))


def os_cpu() -> int:
    import os

    return os.cpu_count() or 1


if __name__ == "__main__":
    main()
