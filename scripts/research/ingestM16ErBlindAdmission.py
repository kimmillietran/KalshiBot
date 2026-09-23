#!/usr/bin/env python3
"""M16-ER CryptoStruct cohort blind admission (NO ECONOMICS).

Streams governed raw day ZIPs → RAW-BBO-CHANGE adapter → canonical M16
pre-entry state machine through confirmation only.

Never computes P&L / target / stop / settlement / MFE / MAE / CR2 economics.
"""
from __future__ import annotations

import hashlib
import json
import math
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import zstandard as zstd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/external-samples/cryptostruct/m16-er/raw"
WORK = ROOT / "data/external-samples/cryptostruct/m16-er/work"
AUDIT = ROOT / "data/research-results/external-kalshi-data-audit"

FIXED_DATES = [
    "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18",
    "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
    "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28",
    "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
    "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
    "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-15",
    "2026-09-16", "2026-09-17", "2026-09-19", "2026-09-21",
]
QUALITY_AUDIT_ONLY = {
    "2026-09-08", "2026-09-09", "2026-09-14", "2026-09-18", "2026-09-20",
}

ADAPTER_ID = "RAW-BBO-CHANGE"
ADAPTER_IDENTITY = "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d"
COHORT_IDENTITY = "afdacb697216ba385e8d4d9627deec6610d90fafeb52c83b474bace7d9ae15c0"

SETUP_CROSS = 40
ABORT_LOW = 30
STRUCTURE_TICK = 1
MIN_REMAINING_MS = 60_000
GOVERNED_START_H = 18
GOVERNED_END_H = 22

REQUIRED_N = 329
REQUIRED_G = 27


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


def bbo_cents(bids: Dict[float, float], asks: Dict[float, float]):
    if not bids or not asks:
        return None
    yb = max(bids)
    ya = min(asks)
    crossed = yb > ya
    locked = yb == ya
    yb_c = int(round(yb * 100))
    ya_c = int(round(ya * 100))
    nb_c = int(round((1.0 - ya) * 100))
    return yb_c, ya_c, nb_c, crossed, locked


# --- Canonical M16 state machine (mirrors m16StateMachine.ts) ---

@dataclass
class Build:
    off_low_seen: bool = False
    rebound_high_h: Optional[float] = None
    pullback_seen: bool = False


@dataclass
class Machine:
    side: str
    phase: str = "awaiting-above-cross"
    saw_above_cross: bool = False
    setup_low_l: Optional[float] = None
    down_cross_ts: Optional[int] = None
    build: Optional[Build] = None
    confirmation_ts: Optional[int] = None
    confirmation_mid: Optional[float] = None
    signal_emitted: bool = False


def candidate_mid(side: str, yes_mid: float) -> float:
    return yes_mid if side == "YES" else 100.0 - yes_mid


def step_machine(state: Machine, mid: float, ts: int, book_eligible: bool, structural_gap: bool, close_time_ms: Optional[int]) -> List[dict]:
    events: List[dict] = []
    if state.phase in (
        "confirmed", "aborted-waterfall", "left-truncated", "invalidated-gap",
        "rejected-time-gate", "done",
    ) or state.signal_emitted:
        return events

    if structural_gap and state.phase in ("in-setup", "building-reversal", "pullback-held"):
        state.phase = "invalidated-gap"
        state.build = None
        events.append({"type": "invalidated-gap", "side": state.side, "timestampMs": ts})
        return events

    if not book_eligible:
        return events

    if state.phase == "awaiting-above-cross" and not state.saw_above_cross:
        if mid <= SETUP_CROSS:
            state.phase = "left-truncated"
            events.append({"type": "left-truncated", "side": state.side, "timestampMs": ts})
            return events
        state.saw_above_cross = True

    if state.phase == "awaiting-above-cross" and state.saw_above_cross:
        if mid <= SETUP_CROSS:
            state.phase = "in-setup"
            state.setup_low_l = mid
            state.down_cross_ts = ts
            state.build = Build()
            events.append({"type": "down-cross", "side": state.side, "timestampMs": ts, "midCents": mid})
            if mid < ABORT_LOW:
                state.phase = "aborted-waterfall"
                state.build = None
                events.append({"type": "abort-waterfall", "side": state.side, "timestampMs": ts, "setupLowL": mid})
            return events
        return events

    if state.phase in ("in-setup", "building-reversal", "pullback-held"):
        assert state.setup_low_l is not None
        L = state.setup_low_l
        if mid < L:
            new_l = mid
            if new_l < ABORT_LOW:
                state.setup_low_l = new_l
                state.phase = "aborted-waterfall"
                state.build = None
                events.append({"type": "abort-waterfall", "side": state.side, "timestampMs": ts, "setupLowL": new_l})
                return events
            state.setup_low_l = new_l
            state.phase = "in-setup"
            state.build = Build()
            return events

        build = state.build or Build()
        if not build.off_low_seen and mid >= L + STRUCTURE_TICK:
            build = Build(off_low_seen=True, rebound_high_h=mid, pullback_seen=False)
            state.phase = "building-reversal"
            state.build = build
        elif build.off_low_seen and not build.pullback_seen:
            H = mid if build.rebound_high_h is None else max(build.rebound_high_h, mid)
            build.rebound_high_h = H
            if mid <= H - STRUCTURE_TICK and mid >= L:
                build.pullback_seen = True
                state.phase = "pullback-held"
                state.build = build
            else:
                state.phase = "building-reversal"
                state.build = build
        elif build.pullback_seen:
            H = build.rebound_high_h
            assert H is not None
            if mid > H:
                remaining = None if close_time_ms is None else close_time_ms - ts
                passed = remaining is not None and remaining >= MIN_REMAINING_MS
                state.confirmation_ts = ts
                state.confirmation_mid = mid
                state.signal_emitted = True
                state.build = build
                if passed:
                    state.phase = "confirmed"
                    events.append({
                        "type": "confirmation",
                        "side": state.side,
                        "timestampMs": ts,
                        "confirmationMidCents": mid,
                        "setupLowL": L,
                        "passedTimeGate": True,
                    })
                else:
                    state.phase = "rejected-time-gate"
                    events.append({
                        "type": "time-gate-reject",
                        "side": state.side,
                        "timestampMs": ts,
                        "confirmationMidCents": mid,
                        "setupLowL": L,
                    })
                return events
            state.phase = "pullback-held"
            state.build = build
        else:
            state.build = build
    return events


def in_governed_window(ts_ms: int) -> bool:
    dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
    return GOVERNED_START_H <= dt.hour < GOVERNED_END_H


def utc_day_key(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")


import re
from zoneinfo import ZoneInfo

TICKER_CLOSE_RE = re.compile(
    r"^KXBTC15M-(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})-"
)
MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}
# Kalshi KXBTC15M ticker HHMM is America/New_York local close, not UTC.
TICKER_TZ = ZoneInfo("America/New_York")


def close_ms_from_ticker(ticker: Optional[str]) -> Optional[int]:
    if not ticker:
        return None
    m = TICKER_CLOSE_RE.match(ticker)
    if not m:
        return None
    yy, mon, dd, hh, mm = m.groups()
    month = MONTHS.get(mon)
    if month is None:
        return None
    year = 2000 + int(yy)
    try:
        dt_et = datetime(
            year, month, int(dd), int(hh), int(mm), tzinfo=TICKER_TZ
        )
        return int(dt_et.astimezone(timezone.utc).timestamp() * 1000)
    except Exception:
        return None


def overlaps_governed_day(
    start_ms: Optional[int], close_ms: Optional[int], day: str
) -> bool:
    day_start = int(
        datetime.fromisoformat(f"{day}T{GOVERNED_START_H:02d}:00:00+00:00").timestamp()
        * 1000
    )
    day_end = int(
        datetime.fromisoformat(f"{day}T{GOVERNED_END_H:02d}:00:00+00:00").timestamp()
        * 1000
    )
    if close_ms is None:
        return False
    # 15m trade window ending at close. Prefer vendor start when it precedes close;
    # otherwise derive open = close − 15m (vendor start can be unrelated).
    c = close_ms
    s = c - 15 * 60 * 1000
    if start_ms is not None and start_ms < c:
        s = start_ms
    return s < day_end and c > day_start


def process_member(z: zipfile.ZipFile, member: str, day: str) -> dict:
    bids: Dict[float, float] = {}
    asks: Dict[float, float] = {}
    ready = False
    fail_closed = False
    last_eid = None
    chain_breaks = 0
    ticker = None
    close_time_ms = None
    start_time_ms = None
    raw_event_count = 0
    obs_count = 0
    prev_key = None

    yes = Machine("YES")
    no = Machine("NO")
    market_claimed = False
    confirmed: Optional[dict] = None
    abort_waterfall = 0
    left_trunc = 0
    gap_inv = 0
    time_gate_reject = 0
    down_cross = 0
    governed_obs = 0
    first_ts = None
    last_ts = None
    had_snapshot = False
    malformed = 0
    skipped_no_overlap = False

    dctx = zstd.ZstdDecompressor()
    with z.open(member) as raw, dctx.stream_reader(raw) as reader:
        buf = b""
        header_done = False
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
                if isinstance(obj, dict) and "instrument" in obj:
                    inst = obj["instrument"]
                    ticker = inst.get("code")
                    for key, dest in (("expiry", "close"), ("start", "start")):
                        s = inst.get(key)
                        if isinstance(s, str) and len(s) >= 19:
                            iso = s.replace(" ", "T") + "Z"
                            try:
                                ms = int(
                                    datetime.fromisoformat(
                                        iso.replace("Z", "+00:00")
                                    ).timestamp()
                                    * 1000
                                )
                                if dest == "close":
                                    close_time_ms = ms
                                else:
                                    start_time_ms = ms
                            except Exception:
                                pass
                    # Vendor expiry often null — derive from ticker close time.
                    if close_time_ms is None:
                        close_time_ms = close_ms_from_ticker(ticker)
                    header_done = True
                    if not overlaps_governed_day(start_time_ms, close_time_ms, day):
                        skipped_no_overlap = True
                        return {
                            "ticker": ticker,
                            "member": member,
                            "closeTimeMs": close_time_ms,
                            "startTimeMs": start_time_ms,
                            "chainBreaks": 0,
                            "hadSnapshot": False,
                            "rawEventCount": 0,
                            "obsCount": 0,
                            "governedObs": 0,
                            "firstTs": None,
                            "lastTs": None,
                            "malformedLines": 0,
                            "downCross": 0,
                            "abortWaterfall": 0,
                            "leftTruncation": 0,
                            "invalidatedGap": 0,
                            "timeGateReject": 0,
                            "confirmation": None,
                            "skippedNoOverlap": True,
                        }
                    continue
                if not header_done:
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
                raw_event_count += 1
                if last_eid is not None and prev_eid not in (None, "", "0"):
                    if str(prev_eid) != str(last_eid):
                        chain_breaks += 1
                        fail_closed = True
                if eid not in (None, ""):
                    last_eid = eid
                if msg == 0:
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, True)
                        ready = True
                        fail_closed = False
                        had_snapshot = True
                else:
                    if not ready or fail_closed:
                        # still consume for continuity accounting but book not updated when fail_closed
                        if not ready:
                            continue
                        if fail_closed:
                            continue
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, False)

                ts_ms = ad_ts // 1_000_000
                bb = bbo_cents(bids, asks)
                if bb is None:
                    yb = nb = None
                    yes_mid = None
                    eligible = False
                else:
                    yb, _ya, nb, crossed, locked = bb
                    yes_mid = 50 + (yb - nb) / 2.0
                    eligible = (not crossed) and (not locked) and (not fail_closed)

                # Always keep book; only observe/step inside governed window
                # (matches prospective capture population start at 18:00Z).
                if not in_governed_window(ts_ms):
                    continue

                key = (yb, nb, eligible, fail_closed)
                if key == prev_key:
                    continue
                prev_key = key
                obs_count += 1
                governed_obs += 1
                first_ts = ts_ms if first_ts is None else min(first_ts, ts_ms)
                last_ts = ts_ms if last_ts is None else max(last_ts, ts_ms)

                if market_claimed or yes_mid is None:
                    continue
                for side_state in (yes, no):
                    if market_claimed:
                        break
                    cand = candidate_mid(side_state.side, yes_mid)
                    evs = step_machine(
                        side_state,
                        cand,
                        ts_ms,
                        eligible,
                        fail_closed,
                        close_time_ms,
                    )
                    for e in evs:
                        t = e["type"]
                        if t == "down-cross":
                            down_cross += 1
                        elif t == "abort-waterfall":
                            abort_waterfall += 1
                        elif t == "left-truncated":
                            left_trunc += 1
                        elif t == "invalidated-gap":
                            gap_inv += 1
                        elif t == "time-gate-reject":
                            time_gate_reject += 1
                        elif t == "confirmation":
                            market_claimed = True
                            confirmed = {
                                "ticker": ticker,
                                "side": e["side"],
                                "confirmationTimestampMs": e["timestampMs"],
                                "setupLowL": e["setupLowL"],
                                "passedTimeGate": True,
                                "inGovernedWindow": True,
                                "utcDayKey": utc_day_key(e["timestampMs"]),
                            }
                            break

    return {
        "ticker": ticker,
        "member": member,
        "closeTimeMs": close_time_ms,
        "startTimeMs": start_time_ms,
        "chainBreaks": chain_breaks,
        "hadSnapshot": had_snapshot,
        "rawEventCount": raw_event_count,
        "obsCount": obs_count,
        "governedObs": governed_obs,
        "firstTs": first_ts,
        "lastTs": last_ts,
        "malformedLines": malformed,
        "downCross": down_cross,
        "abortWaterfall": abort_waterfall,
        "leftTruncation": left_trunc,
        "invalidatedGap": gap_inv,
        "timeGateReject": time_gate_reject,
        "confirmation": confirmed,
        "skippedNoOverlap": skipped_no_overlap,
    }


def day_has_governed_coverage(members: List[dict], day: str) -> bool:
    """True if any ticker has observations overlapping 18–22Z on this UTC day."""
    day_start = int(datetime.fromisoformat(f"{day}T{GOVERNED_START_H:02d}:00:00+00:00").timestamp() * 1000)
    day_end = int(datetime.fromisoformat(f"{day}T{GOVERNED_END_H:02d}:00:00+00:00").timestamp() * 1000)
    for m in members:
        if m["firstTs"] is None or m["lastTs"] is None:
            continue
        if m["firstTs"] < day_end and m["lastTs"] > day_start and m["governedObs"] > 0:
            return True
    return False


def process_day(zpath: Path, day: str) -> dict:
    members_out: List[dict] = []
    confirmations: List[dict] = []
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.endswith(".txt.zst") or n.endswith(".zst")]
        if not names:
            names = [n for n in z.namelist() if not n.endswith("/")]
        for name in names:
            if name.endswith("/"):
                continue
            if not (name.endswith(".zst") or name.endswith(".txt.zst")):
                continue
            try:
                row = process_member(z, name, day)
            except Exception as e:
                return {
                    "utcDate": day,
                    "admitted": False,
                    "exclusionReason": "corrupted-zip",
                    "error": str(e),
                    "confirmations": [],
                    "eligibleConfirmations": 0,
                    "zeroSignal": False,
                    "governedHoursIfAdmitted": 0,
                }
            members_out.append(row)
            if (
                row["confirmation"]
                and row["confirmation"]["inGovernedWindow"]
                and row["confirmation"]["passedTimeGate"]
            ):
                confirmations.append(row["confirmation"])

    active = [m for m in members_out if not m.get("skippedNoOverlap")]
    exclusion = None
    if not active:
        exclusion = "missing-governed-18-22z-interval"
    elif not any(m["hadSnapshot"] for m in active):
        exclusion = "unrecoverable-snapshot-delta-chain-failure"
    elif not day_has_governed_coverage(active, day):
        exclusion = "missing-governed-18-22z-interval"

    eligible = [c for c in confirmations if c["utcDayKey"] == day]
    return {
        "utcDate": day,
        "admitted": exclusion is None,
        "exclusionReason": exclusion,
        "zipMemberProcessed": len(active),
        "tickersWithSnapshot": sum(1 for m in active if m["hadSnapshot"]),
        "totalChainBreaks": sum(m["chainBreaks"] for m in active),
        "downCross": sum(m["downCross"] for m in active),
        "abortWaterfall": sum(m["abortWaterfall"] for m in active),
        "leftTruncation": sum(m["leftTruncation"] for m in active),
        "invalidatedGap": sum(m["invalidatedGap"] for m in active),
        "timeGateReject": sum(m["timeGateReject"] for m in active),
        "confirmations": [
            {
                "ticker": c["ticker"],
                "side": c["side"],
                "confirmationTimestampMs": c["confirmationTimestampMs"],
                "utcDayKey": c["utcDayKey"],
            }
            for c in eligible
        ],
        "eligibleConfirmations": len(eligible),
        "zeroSignal": exclusion is None and len(eligible) == 0,
        "governedHoursIfAdmitted": 4 if exclusion is None else 0,
    }


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    acq_path = WORK / "acquisition-sha.json"
    if not acq_path.exists():
        raise SystemExit(f"missing {acq_path}; run SHA ingest first")
    acq = json.loads(acq_path.read_text())
    by_day = {d["utcDate"]: d for d in acq["days"]}

    day_results = []
    for i, day in enumerate(FIXED_DATES, 1):
        if day in QUALITY_AUDIT_ONLY:
            raise SystemExit(f"refusing quality-audit date {day}")
        info = by_day[day]
        zpath = ROOT / info["governedRelativePath"]
        print(f"[{i}/34] blind process {day} ...", flush=True)
        row = process_day(zpath, day)
        row["sha256"] = info["sha256"]
        row["byteSize"] = info["byteSize"]
        day_results.append(row)
        print(
            f"  admitted={row['admitted']} conf={row['eligibleConfirmations']} "
            f"excl={row['exclusionReason']}",
            flush=True,
        )
        # write incremental progress
        (WORK / "blind-incidence-partial.json").write_text(
            json.dumps({"days": day_results}, separators=(",", ":"))
        )

    admitted = [d for d in day_results if d["admitted"]]
    N = sum(d["eligibleConfirmations"] for d in admitted)
    cluster_days = {
        c["utcDayKey"]
        for d in admitted
        for c in d["confirmations"]
    }
    G = len(cluster_days)
    H = sum(d["governedHoursIfAdmitted"] for d in day_results)

    out = {
        "label": "M16-ER BLIND INCIDENCE — no economics",
        "adapterId": ADAPTER_ID,
        "adapterIdentity": ADAPTER_IDENTITY,
        "cohortReservationIdentity": COHORT_IDENTITY,
        "requiredN": REQUIRED_N,
        "requiredG": REQUIRED_G,
        "totalN": N,
        "totalG": G,
        "totalGovernedHours": H,
        "fixedDateCount": len(FIXED_DATES),
        "admittedDateCount": len(admitted),
        "excludedDateCount": sum(1 for d in day_results if not d["admitted"]),
        "days": day_results,
        "economicFieldsForbidden": True,
        "earlyStoppingUsed": False,
        "replacementDatesUsed": False,
    }
    (WORK / "blind-incidence.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"N": N, "G": G, "H": H, "admitted": len(admitted)}, indent=2))


if __name__ == "__main__":
    main()
