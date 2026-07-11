import type { ParityNearMissRankedEntry, ParityNearMissRejectionGate } from "./parityNearMissAnalysisTypes";

export type NearMissCandidate = Omit<ParityNearMissRankedEntry, "rank">;

export type NearMissCandidateInput = {
  marketTicker: string;
  timestamp: string;
  timeRemainingMs: number | null;
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  distance: number | null;
  firstRejectingGate: ParityNearMissRejectionGate | null;
  allRejectingGates: readonly ParityNearMissRejectionGate[];
  integrityCaveat: string | null;
};

/** Bounded min-heap style ranking: keeps the closest near misses (smallest positive distance). */
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
      ...candidate,
      distance: candidate.distance,
      distanceKind: this.distanceKind,
    };

    if (this.entries.length < this.limit) {
      this.entries.push(entry);
      this.entries.sort((left, right) => left.distance - right.distance);
      return;
    }

    const worstIndex = this.entries.length - 1;
    const worst = this.entries[worstIndex]!;
    if (entry.distance >= worst.distance) {
      return;
    }

    this.entries[worstIndex] = entry;
    this.entries.sort((left, right) => left.distance - right.distance);
  }

  toRankedEntries(): ParityNearMissRankedEntry[] {
    return this.entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }
}

export function dedupeNearMissKey(entry: Pick<NearMissCandidate, "marketTicker" | "timestamp" | "distanceKind">): string {
  return `${entry.marketTicker}|${entry.timestamp}|${entry.distanceKind}`;
}
