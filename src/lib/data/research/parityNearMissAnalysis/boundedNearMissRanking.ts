import type { ParityNearMissRankedEntry, ParityNearMissRejectionGate } from "./parityNearMissAnalysisTypes";

export type NearMissCandidate = Omit<ParityNearMissRankedEntry, "rank">;

export type NearMissCandidateInput = {
  recordIndex: number;
  marketTicker: string;
  timestamp: string;
  timeRemainingMs: number | null;
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  observedEdgeCents: number | null;
  requiredEdgeCents: number;
  shortfallCents: number;
  distance: number | null;
  bookValid: boolean;
  bookSynchronized: boolean;
  quoteAgeMs: number | null;
  firstRejectingGate: ParityNearMissRejectionGate | null;
  allRejectingGates: readonly ParityNearMissRejectionGate[];
  integrityCaveat: string | null;
};

function compareCandidates(left: NearMissCandidate, right: NearMissCandidate): number {
  if (left.shortfallCents !== right.shortfallCents) {
    return left.shortfallCents - right.shortfallCents;
  }
  if (left.timestamp !== right.timestamp) {
    return left.timestamp.localeCompare(right.timestamp);
  }
  if (left.marketTicker !== right.marketTicker) {
    return left.marketTicker.localeCompare(right.marketTicker);
  }
  return 0;
}

/** Bounded ranking: keeps closest positive shortfalls with deterministic tie-breaking. */
export class BoundedNearMissRanking {
  private readonly entries: NearMissCandidate[] = [];

  constructor(
    private readonly limit: number,
    private readonly distanceKind: NearMissCandidate["distanceKind"],
  ) {}

  consider(candidate: NearMissCandidateInput): void {
    if (candidate.distance === null || candidate.distance <= 0) {
      return;
    }

    const entry: NearMissCandidate = {
      marketTicker: candidate.marketTicker,
      timestamp: candidate.timestamp,
      timeRemainingMs: candidate.timeRemainingMs,
      yesBidCents: candidate.yesBidCents,
      noBidCents: candidate.noBidCents,
      yesBidSize: candidate.yesBidSize,
      noBidSize: candidate.noBidSize,
      observedEdgeCents: candidate.observedEdgeCents,
      requiredEdgeCents: candidate.requiredEdgeCents,
      shortfallCents: candidate.shortfallCents,
      distance: candidate.distance,
      distanceKind: this.distanceKind,
      bookValid: candidate.bookValid,
      bookSynchronized: candidate.bookSynchronized,
      quoteAgeMs: candidate.quoteAgeMs,
      firstRejectingGate: candidate.firstRejectingGate,
      allRejectingGates: candidate.allRejectingGates,
      integrityCaveat: candidate.integrityCaveat,
    };

    if (this.entries.length < this.limit) {
      this.entries.push(entry);
      this.entries.sort(compareCandidates);
      return;
    }

    const worst = this.entries[this.entries.length - 1]!;
    if (compareCandidates(entry, worst) >= 0) {
      return;
    }

    this.entries[this.entries.length - 1] = entry;
    this.entries.sort(compareCandidates);
  }

  toRankedEntries(): ParityNearMissRankedEntry[] {
    return this.entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }
}

export function dedupeNearMissKey(
  entry: Pick<NearMissCandidate, "marketTicker" | "timestamp" | "distanceKind">,
): string {
  return `${entry.marketTicker}|${entry.timestamp}|${entry.distanceKind}`;
}
