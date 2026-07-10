export const ORDERBOOK_RECONSTRUCTION_AUDIT_FILENAME =
  "orderbook-reconstruction-audit.json";
export const DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH =
  "data/research-results/orderbook-reconstruction-audit.json";
export const DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH =
  "data/reports/orderbook-reconstruction-audit.html";

export const ORDERBOOK_RECONSTRUCTION_AUDIT_DISCLAIMER =
  "Reconstruction audit only. No trading decisions are made. No orders are placed. Findings inform capture reconstruction fixes only.";

export const ORDERBOOK_RECONSTRUCTION_AUDIT_CAVEATS = [
  "Replay uses the same bid-ladder + complement-ask assumptions as forward capture unless noted.",
  "Absolute vs relative delta detection is heuristic and validated against subsequent snapshots.",
  "Crossed implied books may be real microstructure or reconstruction artifacts; evidence is reported separately.",
] as const;

export const RECONSTRUCTION_ROOT_CAUSE_CLASSIFICATIONS = [
  "price-transform-bug",
  "delta-absolute-vs-relative-bug",
  "side-mapping-bug",
  "stale-opposite-side-ladder",
  "snapshot-incomplete-or-misread",
  "rollover-subscription-artifact",
  "real-crossed-market-state",
  "throttle-sampling-artifact",
  "unknown",
] as const;

export type ReconstructionRootCauseClassification =
  (typeof RECONSTRUCTION_ROOT_CAUSE_CLASSIFICATIONS)[number];

export type OrderbookReconstructionAuditConfig = {
  captureRunDir: string;
  maxRawMessages: number;
  marketTicker: string | null;
  sampleLimit: number;
};

export const DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG: OrderbookReconstructionAuditConfig =
  {
    captureRunDir: "data/live-capture/forward-quotes",
    maxRawMessages: Number.POSITIVE_INFINITY,
    marketTicker: null,
    sampleLimit: 25,
  };

export type OrderbookReconstructionAuditIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type RawMessageInventory = {
  messagesScanned: number;
  malformedLineCount: number;
  messageTypeCounts: Record<string, number>;
  channelsSeen: string[];
  marketTickersSeen: string[];
  snapshotCount: number;
  deltaCount: number;
  subscribedOkErrorCount: number;
  snapshotFieldsPresent: string[];
  deltaFieldsPresent: string[];
  sequenceFieldPresentCount: number;
  sideValuesSeen: string[];
  priceFieldFormats: string[];
  quantityFieldFormats: string[];
  notes: string[];
};

export type SnapshotSemanticsFinding = {
  yesBidLevelsPresent: boolean;
  noBidLevelsPresent: boolean;
  yesAskLevelsPresent: boolean;
  noAskLevelsPresent: boolean;
  bothSidesPresentInSnapshot: boolean;
  pricesInDollarsFp: boolean;
  sampleYesBestBidCents: number | null;
  sampleNoBestBidCents: number | null;
  asksDerivedFromOppositeBids: boolean;
  evidence: string[];
};

export type DeltaSemanticsFinding = {
  deltaFieldName: string;
  sideFieldValues: string[];
  treatsQuantityAsRelativeChange: boolean;
  treatsZeroQuantityAsRemove: boolean;
  relativeReplayMatchesSnapshots: number;
  absoluteReplayMatchesSnapshots: number;
  preferredSemantics: "relative" | "absolute" | "inconclusive";
  evidence: string[];
};

export type OppositeSideAskDerivationFinding = {
  recordsCompared: number;
  yesBidGreaterThanDerivedYesAskCount: number;
  noBidGreaterThanDerivedNoAskCount: number;
  yesAskMatchesComplementOfNoBidCount: number;
  noAskMatchesComplementOfYesBidCount: number;
  crossedFromDerivationAloneCount: number;
  crossedShare: number | null;
  evidence: string[];
};

export type StalenessFinding = {
  marketsWithCrossedStates: number;
  crossedStatesWithStaleOppositeSide: number;
  medianOppositeSideUpdateGapMs: number | null;
  p90OppositeSideUpdateGapMs: number | null;
  crossedAfterOneSidedBurstCount: number;
  crossedNearRolloverCount: number;
  crossedNearMarketCloseCount: number;
  evidence: string[];
};

export type TopOfBookComparisonSample = {
  marketTicker: string;
  sequence: number | null;
  receivedAtLocal: string;
  capturedYesBid: number | null;
  capturedYesAsk: number | null;
  capturedNoBid: number | null;
  capturedNoAsk: number | null;
  replayedYesBid: number | null;
  replayedYesAsk: number | null;
  replayedNoBid: number | null;
  replayedNoAsk: number | null;
  capturedEconomicBookState: string;
  replayedEconomicBookState: string;
  mismatch: boolean;
  mismatchReason: string | null;
};

export type MarketReconstructionFinding = {
  marketTicker: string;
  rawSnapshotCount: number;
  rawDeltaCount: number;
  topOfBookEmittedCount: number;
  economicallyValidCount: number;
  crossedCount: number;
  firstCrossedTimestamp: string | null;
  lastCrossedTimestamp: string | null;
  dominantCrossedSide: "yes" | "no" | "both" | null;
  candidateReconstructionIssue: ReconstructionRootCauseClassification;
};

export type OrderbookReconstructionAuditSummary = {
  captureRunDir: string;
  runId: string | null;
  messagesScanned: number;
  marketsAudited: number;
  snapshotCount: number;
  deltaCount: number;
  topOfBookRecordsCompared: number;
  matchedTopOfBookRecords: number;
  mismatchedTopOfBookRecords: number;
  crossedRecordsExplained: number;
  rootCauseClassification: ReconstructionRootCauseClassification;
  secondaryContributors: ReconstructionRootCauseClassification[];
  recommendedNextFix: string;
};

export type OrderbookReconstructionAuditResult = {
  summary: OrderbookReconstructionAuditSummary;
  rawMessageInventory: RawMessageInventory;
  snapshotSemantics: SnapshotSemanticsFinding;
  deltaSemantics: DeltaSemanticsFinding;
  oppositeSideAskDerivation: OppositeSideAskDerivationFinding;
  staleness: StalenessFinding;
  comparisonSamples: TopOfBookComparisonSample[];
  marketFindings: MarketReconstructionFinding[];
  warnings: string[];
};

export type OrderbookReconstructionAuditReport = OrderbookReconstructionAuditResult & {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: OrderbookReconstructionAuditConfig;
};

export class OrderbookReconstructionAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderbookReconstructionAuditError";
  }
}
