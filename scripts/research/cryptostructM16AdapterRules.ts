/**
 * Pure CryptoStruct → M16 observation adapter rules (source-equivalence only).
 * Mirrors scripts/research/emitCryptostructM16Observations.py — no economics.
 */

export type CsObsRow = {
  timestampMs: number;
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
  yesMidCents: number | null;
  bookEligible: boolean;
  structuralGap: boolean;
  crossed?: boolean;
  locked?: boolean;
};

export type BboCents = {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents: number;
  crossed: boolean;
  locked: boolean;
};

/** Complement BBO in cents from YES bid/ask prices in [0,1]. */
export function bboCentsFromYesBook(
  yesBid: number,
  yesAsk: number,
): BboCents {
  const yesBidCents = Math.round(yesBid * 100);
  const yesAskCents = Math.round(yesAsk * 100);
  const noBidCents = Math.round((1 - yesAsk) * 100);
  return {
    yesBidCents,
    yesAskCents,
    noBidCents,
    crossed: yesBid > yesAsk,
    locked: yesBid === yesAsk,
  };
}

/** Canonical KB/M16 midpoint: 50 + (yesBid - noBid) / 2. */
export function yesMidFromBids(
  yesBestBidCents: number,
  noBestBidCents: number,
): number {
  return 50 + (yesBestBidCents - noBestBidCents) / 2;
}

export function bookEligibleFromBbo(
  crossed: boolean,
  locked: boolean,
  failClosed: boolean,
): boolean {
  return !crossed && !locked && !failClosed;
}

/**
 * Continuity: unexplained prevEventId break → fail-closed until next snapshot.
 * Returns whether the chain remains open after this event.
 */
export function applyContinuityBreak(input: {
  lastEventId: string | null;
  prevEventId: string | null | undefined;
  isSnapshot: boolean;
  failClosed: boolean;
}): { failClosed: boolean; chainBreak: boolean } {
  let { failClosed } = input;
  let chainBreak = false;
  if (
    input.lastEventId !== null &&
    input.prevEventId != null &&
    input.prevEventId !== "" &&
    input.prevEventId !== "0" &&
    String(input.prevEventId) !== String(input.lastEventId)
  ) {
    failClosed = true;
    chainBreak = true;
  }
  if (input.isSnapshot) {
    failClosed = false;
  }
  return { failClosed, chainBreak };
}

function obsKey(r: CsObsRow): string {
  return JSON.stringify([
    r.yesBestBidCents,
    r.noBestBidCents,
    r.bookEligible,
    r.structuralGap,
  ]);
}

/** RAW-BBO-CHANGE: emit when (yesBid, noBid, eligible, gap) changes; file order. */
export function adaptRawBboChange(rawRows: CsObsRow[]): CsObsRow[] {
  const out: CsObsRow[] = [];
  let prev: string | null = null;
  for (const r of rawRows) {
    const key = obsKey(r);
    if (key === prev) continue;
    prev = key;
    out.push(r);
  }
  return out;
}

/**
 * KALSHIBOT-MIRROR: collapse same timestampMs to last causal state, then BBO-change.
 * First-seen timestamp order preserved.
 */
export function adaptKalshiBotMirror(rawRows: CsObsRow[]): CsObsRow[] {
  const byTs = new Map<number, CsObsRow>();
  const order: number[] = [];
  for (const r of rawRows) {
    if (!byTs.has(r.timestampMs)) order.push(r.timestampMs);
    byTs.set(r.timestampMs, r);
  }
  const collapsed = order.map((ts) => byTs.get(ts)!);
  return adaptRawBboChange(collapsed);
}
