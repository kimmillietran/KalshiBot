#!/usr/bin/env python3
"""Emit CryptoStruct M16 observation JSONL for source-equivalence (no economics).

Writes gitignored work files consumed by the TS M16 equivalence runner.
"""
from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import zstandard as zstd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/external-samples/cryptostruct/overlap/raw"
WORK = ROOT / "data/external-samples/cryptostruct/overlap/work/m16-obs"
DAYS = ["2026-09-08", "2026-09-09", "2026-09-14", "2026-09-18", "2026-09-20"]


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


def bbo_cents(bids: Dict[float, float], asks: Dict[float, float]) -> Optional[Tuple[int, int, int, bool, bool]]:
    if not bids or not asks:
        return None
    yb = max(bids)
    ya = min(asks)
    crossed = yb > ya
    locked = yb == ya
    yb_c = int(round(yb * 100))
    ya_c = int(round(ya * 100))
    nb_c = int(round((1.0 - ya) * 100))  # complement NO bid
    return yb_c, ya_c, nb_c, crossed, locked


def emit_member(zpath: Path, member: str, out_path: Path) -> Dict[str, Any]:
    bids: Dict[float, float] = {}
    asks: Dict[float, float] = {}
    ready = False
    fail_closed = False
    last_eid = None
    chain_breaks = 0
    ticker = None
    close_time_ms = None
    start_time_ms = None

    # Collect raw ordered events then collapse same-timestamp for mirror
    raw_rows: List[dict] = []

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
                    ticker = inst.get("code")
                    # start/expiry like "2026-09-18 12:00:00" — treat as UTC naive → Z
                    for key, dest in (("expiry", "close"), ("start", "start")):
                        s = inst.get(key)
                        if isinstance(s, str) and len(s) >= 19:
                            iso = s.replace(" ", "T") + "Z"
                            try:
                                from datetime import datetime, timezone

                                ms = int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
                                if dest == "close":
                                    close_time_ms = ms
                                else:
                                    start_time_ms = ms
                            except Exception:
                                pass
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
                else:
                    if not ready or fail_closed:
                        continue
                    levels = data[0] if data else []
                    if isinstance(levels, list):
                        apply_levels(bids, asks, levels, False)
                bb = bbo_cents(bids, asks)
                ts_ms = ad_ts // 1_000_000
                if bb is None:
                    raw_rows.append(
                        {
                            "timestampMs": ts_ms,
                            "yesBestBidCents": None,
                            "noBestBidCents": None,
                            "yesMidCents": None,
                            "bookEligible": False,
                            "structuralGap": fail_closed,
                            "crossed": False,
                            "locked": False,
                        }
                    )
                    continue
                yb, ya, nb, crossed, locked = bb
                yes_mid = 50 + (yb - nb) / 2.0
                eligible = (not crossed) and (not locked) and (not fail_closed)
                raw_rows.append(
                    {
                        "timestampMs": ts_ms,
                        "yesBestBidCents": yb,
                        "noBestBidCents": nb,
                        "yesMidCents": yes_mid,
                        "bookEligible": eligible,
                        "structuralGap": fail_closed,
                        "crossed": crossed,
                        "locked": locked,
                    }
                )

    # Adapter A: RAW-BBO-CHANGE — emit when (yb, nb, eligible, gap) changes
    a_rows: List[dict] = []
    prev_key = None
    for r in raw_rows:
        key = (r["yesBestBidCents"], r["noBestBidCents"], r["bookEligible"], r["structuralGap"])
        if key == prev_key:
            continue
        prev_key = key
        a_rows.append(r)

    # Adapter B: KALSHIBOT-MIRROR — collapse same timestampMs to last state, then BBO-change dedupe
    by_ts: Dict[int, dict] = {}
    order: List[int] = []
    for r in raw_rows:
        ts = r["timestampMs"]
        if ts not in by_ts:
            order.append(ts)
        by_ts[ts] = r
    b_rows: List[dict] = []
    prev_key = None
    for ts in order:
        r = by_ts[ts]
        key = (r["yesBestBidCents"], r["noBestBidCents"], r["bookEligible"], r["structuralGap"])
        if key == prev_key:
            continue
        prev_key = key
        b_rows.append(r)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ticker": ticker,
        "member": member,
        "closeTimeMs": close_time_ms,
        "startTimeMs": start_time_ms,
        "chainBreaks": chain_breaks,
        "adapters": {
            "RAW-BBO-CHANGE": a_rows,
            "KALSHIBOT-MIRROR": b_rows,
        },
        "rawEventCount": len(raw_rows),
    }
    out_path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    return {
        "ticker": ticker,
        "a": len(a_rows),
        "b": len(b_rows),
        "raw": len(raw_rows),
        "chainBreaks": chain_breaks,
        "closeTimeMs": close_time_ms,
    }


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    index = {"days": {}}
    for day in DAYS:
        zpath = RAW / f"kalshi-btc-15m_{day}.zip"
        day_dir = WORK / day
        day_dir.mkdir(parents=True, exist_ok=True)
        day_index = []
        with zipfile.ZipFile(zpath) as z:
            members = [n for n in z.namelist() if n.endswith(".zst") and "KXBTC15M" in n]
        for member in members:
            # filename kalshi-KXBTC15M-...txt.zst
            base = Path(member).name.replace(".txt.zst", "").replace("kalshi-", "")
            # base like KXBTC15M-26SEP180800-00-2026-09-18
            ticker = "-".join(base.split("-")[:3]) if base.count("-") >= 2 else base
            # safer parse
            import re

            m = re.search(r"(KXBTC15M-26[A-Z]{3}\d{2}\d{4}-\d{2})", member)
            ticker = m.group(1) if m else ticker
            out = day_dir / f"{ticker}.json"
            meta = emit_member(zpath, member, out)
            day_index.append({"ticker": ticker, "file": str(out.relative_to(ROOT)), **{k: v for k, v in meta.items() if k != "ticker"}})
            print(day, ticker, meta["a"], meta["b"], flush=True)
        index["days"][day] = day_index
    (WORK / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    print("done", WORK)


if __name__ == "__main__":
    main()
