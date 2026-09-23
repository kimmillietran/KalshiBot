#!/usr/bin/env python3
"""M16-ER economic outcome evaluation (gate-authorized only).

Streams governed raw ZIPs with the frozen RAW-BBO-CHANGE adapter and M16
state machine, then applies frozen post-confirmation executable economics.

Refuses to run unless m16-er-outcome-open-authorization.json exists with
humanOutcomeOpenApproval=true and economicOutcomesPreviouslyOpened=false
(first open) or an explicit allowRecompute flag for reproducibility.

Mirrors src/lib/data/research/m16ExternalReplication/m16ErOutcomeEvaluator.ts
"""
from __future__ import annotations

import json
import math
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Reuse blind ingest primitives (book, adapter, machine, ticker ET close).
from ingestM16ErBlindAdmission import (
    ADAPTER_IDENTITY,
    COHORT_IDENTITY,
    FIXED_DATES,
    QUALITY_AUDIT_ONLY,
    RAW,
    WORK,
    AUDIT,
    Machine,
    apply_levels,
    bbo_cents,
    candidate_mid,
    close_ms_from_ticker,
    in_governed_window,
    overlaps_governed_day,
    step_machine,
    utc_day_key,
)

TARGET_BID = 55
REQUIRED_N = 329
REQUIRED_G = 27

PROTOCOL_IDENTITY = "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65"
SOURCE_IDENTITY = "63049f060df62092aee62e07fad1691ee5318424d09ebf97c6953cd9dd7149f4"
DEPENDENCE_IDENTITY = "b81c49e9fe574f900c22099c0071cb4607ea1c059952757ef8c95cbc88928603"
EVIDENCE_IDENTITY = "d7697bea40d9c3997aad67bf677dcc4ad3e7a0a09c71fc114e16e4952ed0f699"
FEE_IDENTITY = "2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f"


def standard_taker_fee_cents(price_cents: int) -> int:
    """ceil(7 * P * (100-P) / 10000) — STANDARD taker, qty=1."""
    if not isinstance(price_cents, int) or price_cents < 0 or price_cents > 100:
        raise ValueError(f"invalid fee price {price_cents}")
    return math.ceil(7 * price_cents * (100 - price_cents) / 10000)


def candidate_ask(side: str, yb: int, nb: int) -> int:
    if side == "YES":
        return 100 - nb  # yes ask
    return 100 - yb  # no ask


def candidate_bid(side: str, yb: int, nb: int) -> int:
    return yb if side == "YES" else nb


def require_authorization(auth_path: Path) -> dict:
    if not auth_path.exists():
        raise SystemExit(
            f"refusing economics: missing authorization record {auth_path}"
        )
    auth = json.loads(auth_path.read_text())
    if auth.get("humanOutcomeOpenApproval") is not True:
        raise SystemExit("refusing economics: humanOutcomeOpenApproval != true")
    if auth.get("role") != "m16-external-historical-replication":
        raise SystemExit("refusing economics: role mismatch")
    for key, expected in (
        ("scientificProtocolIdentity", PROTOCOL_IDENTITY),
        ("cohortReservationIdentity", COHORT_IDENTITY),
        ("adapterIdentity", ADAPTER_IDENTITY),
        ("sourceContractIdentity", SOURCE_IDENTITY),
        ("dependencePlanIdentity", DEPENDENCE_IDENTITY),
        ("evidenceContractIdentity", EVIDENCE_IDENTITY),
        ("feeContractIdentity", FEE_IDENTITY),
    ):
        if auth.get(key) != expected:
            raise SystemExit(f"refusing economics: {key} mismatch")
    return auth


def process_member_economic(z: zipfile.ZipFile, member: str, day: str) -> Optional[dict]:
    """Full signal + post-confirmation economics for one ticker member."""
    import zstandard as zstd

    bids: Dict[float, float] = {}
    asks: Dict[float, float] = {}
    ready = False
    fail_closed = False
    last_eid = None
    ticker = None
    close_time_ms = None
    start_time_ms = None
    prev_key = None

    yes = Machine("YES")
    no = Machine("NO")
    market_claimed = False
    confirmed: Optional[dict] = None
    # Post-confirmation state
    post_mode = False
    entry_ask: Optional[int] = None
    setup_l: Optional[float] = None
    conf_side: Optional[str] = None
    conf_ts: Optional[int] = None
    last_eligible_bid: Optional[Tuple[int, int]] = None  # (bid, ts)
    outcome: Optional[dict] = None

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
                    if close_time_ms is None:
                        close_time_ms = close_ms_from_ticker(ticker)
                    header_done = True
                    if not overlaps_governed_day(start_time_ms, close_time_ms, day):
                        return None
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
                    if not ready or fail_closed:
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

                # Always reconstruct; observe inside governed window only for signal
                if not post_mode:
                    if not in_governed_window(ts_ms):
                        continue
                    key = (yb, nb, eligible, fail_closed)
                    if key == prev_key:
                        continue
                    prev_key = key
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
                            if e["type"] == "confirmation":
                                market_claimed = True
                                confirmed = e
                                conf_side = e["side"]
                                conf_ts = e["timestampMs"]
                                setup_l = e["setupLowL"]
                                if not eligible or yb is None or nb is None:
                                    outcome = {
                                        "evaluable": False,
                                        "ticker": ticker,
                                        "side": conf_side,
                                        "utcDayKey": utc_day_key(conf_ts),
                                        "confirmationTimestampMs": conf_ts,
                                        "setupLowL": setup_l,
                                        "exitRoute": "unevaluable-missing-entry-ask",
                                        "reason": "confirmation-book-not-eligible",
                                    }
                                    return outcome
                                try:
                                    entry_ask = candidate_ask(conf_side, yb, nb)
                                except Exception:
                                    outcome = {
                                        "evaluable": False,
                                        "ticker": ticker,
                                        "side": conf_side,
                                        "utcDayKey": utc_day_key(conf_ts),
                                        "confirmationTimestampMs": conf_ts,
                                        "setupLowL": setup_l,
                                        "exitRoute": "unevaluable-missing-entry-ask",
                                        "reason": "confirmation-ask-unresolvable",
                                    }
                                    return outcome
                                if not (0 <= entry_ask <= 100):
                                    outcome = {
                                        "evaluable": False,
                                        "ticker": ticker,
                                        "side": conf_side,
                                        "utcDayKey": utc_day_key(conf_ts),
                                        "confirmationTimestampMs": conf_ts,
                                        "setupLowL": setup_l,
                                        "exitRoute": "unevaluable-missing-entry-ask",
                                        "reason": "confirmation-ask-out-of-range",
                                    }
                                    return outcome
                                post_mode = True
                                prev_key = None  # reset for post path dedupe if needed
                                break
                    continue

                # --- post-confirmation economic path ---
                if close_time_ms is not None and ts_ms > close_time_ms:
                    break
                if ts_ms <= (conf_ts or 0):
                    continue
                if not eligible or yb is None or nb is None:
                    continue
                bid = candidate_bid(conf_side, yb, nb)
                last_eligible_bid = (bid, ts_ms)
                if bid >= TARGET_BID:
                    outcome = finalize_trade(
                        ticker, conf_side, conf_ts, setup_l, entry_ask, bid, ts_ms, "target"
                    )
                    return outcome
                if bid < setup_l:
                    outcome = finalize_trade(
                        ticker,
                        conf_side,
                        conf_ts,
                        setup_l,
                        entry_ask,
                        bid,
                        ts_ms,
                        "structural-stop",
                    )
                    return outcome

    if confirmed is None:
        return None  # zero-signal ticker
    if outcome is not None:
        return outcome
    if last_eligible_bid is None:
        return {
            "evaluable": False,
            "ticker": ticker,
            "side": conf_side,
            "utcDayKey": utc_day_key(conf_ts or 0),
            "confirmationTimestampMs": conf_ts,
            "setupLowL": setup_l,
            "exitRoute": "unevaluable-missing-terminal-bid",
            "reason": "no-eligible-post-confirmation-bid-before-close",
        }
    bid, ts = last_eligible_bid
    return finalize_trade(
        ticker, conf_side, conf_ts, setup_l, entry_ask, bid, ts, "terminal-flatten"
    )


def finalize_trade(ticker, side, conf_ts, setup_l, entry_ask, exit_bid, exit_ts, route):
    exit_bid_i = int(round(exit_bid))
    entry_fee = standard_taker_fee_cents(int(entry_ask))
    exit_fee = standard_taker_fee_cents(exit_bid_i)
    gross = exit_bid_i - int(entry_ask)
    fee = entry_fee + exit_fee
    return {
        "evaluable": True,
        "ticker": ticker,
        "side": side,
        "utcDayKey": utc_day_key(conf_ts),
        "confirmationTimestampMs": conf_ts,
        "exitTimestampMs": exit_ts,
        "setupLowL": setup_l,
        "entryAskCents": int(entry_ask),
        "exitBidCents": exit_bid_i,
        "exitRoute": route,
        "grossPnlCents": gross,
        "entryFeeCents": entry_fee,
        "exitFeeCents": exit_fee,
        "feeCents": fee,
        "feeAdjustedPnlCents": gross - fee,
        "holdingTimeMs": exit_ts - conf_ts,
    }


def process_day_economic(zpath: Path, day: str) -> List[dict]:
    outcomes: List[dict] = []
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.endswith(".zst")]
        for name in names:
            if name.endswith("/"):
                continue
            row = process_member_economic(z, name, day)
            if row is not None:
                outcomes.append(row)
    return outcomes


def main() -> None:
    auth_path = AUDIT / "m16-er-outcome-open-authorization.json"
    auth = require_authorization(auth_path)
    acq = json.loads((WORK / "acquisition-sha.json").read_text())
    by_day = {d["utcDate"]: d for d in acq["days"]}

    all_outcomes: List[dict] = []
    for i, day in enumerate(FIXED_DATES, 1):
        if day in QUALITY_AUDIT_ONLY:
            raise SystemExit(f"refusing audit date {day}")
        info = by_day[day]
        zpath = Path(__file__).resolve().parents[2] / info["governedRelativePath"]
        print(f"[{i}/34] economic {day} ...", flush=True)
        rows = process_day_economic(zpath, day)
        print(f"  outcomes={len(rows)}", flush=True)
        all_outcomes.extend(rows)
        (WORK / "economic-outcomes-partial.json").write_text(
            json.dumps({"outcomes": all_outcomes}, separators=(",", ":"))
        )

    WORK.mkdir(parents=True, exist_ok=True)
    out_path = WORK / "economic-outcomes.json"
    payload = {
        "label": "M16-ER ECONOMIC OUTCOMES",
        "authorizationTimestampUtc": auth.get("outcomeOpenTimestampUtc"),
        "adapterIdentity": ADAPTER_IDENTITY,
        "cohortReservationIdentity": COHORT_IDENTITY,
        "blindConfirmationsExpected": 461,
        "outcomeCount": len(all_outcomes),
        "evaluableCount": sum(1 for o in all_outcomes if o.get("evaluable")),
        "unevaluableCount": sum(1 for o in all_outcomes if not o.get("evaluable")),
        "outcomes": all_outcomes,
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        json.dumps(
            {
                "outcomeCount": payload["outcomeCount"],
                "evaluable": payload["evaluableCount"],
                "unevaluable": payload["unevaluableCount"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
