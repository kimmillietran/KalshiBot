import type { JsonlIo } from "@/lib/data/research/jsonl";

export const CAPTURE_HEALTH_RECONCILIATION_VERSION = "m12.15.0";
export const DEFAULT_CAPTURE_HEALTH_RECONCILIATION_OUTPUT_PATH =
  "data/research-results/capture-health-reconciliation.json";
export const DEFAULT_CAPTURE_HEALTH_RECONCILIATION_HTML_PATH =
  "data/reports/capture-health-reconciliation.html";
export const DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_OUTPUT_PATH =
  "data/research-results/capture-timeline-attribution.json";
export const DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_HTML_PATH =
  "data/reports/capture-timeline-attribution.html";

export const CAPTURE_HEALTH_RECONCILIATION_DISCLAIMER =
  "Capture health reconciliation is offline capture-quality analysis only. It does not place orders, perform live trading, or emit trade recommendations.";

export type CaptureHealthReconciliationIo = JsonlIo & {
  isDirectory: (path: string) => boolean;
};

export type AnalysisScope = "selected-run" | "aggregate";

export type CaptureHealthReconciliationConfig = {
  captureRunDir: string;
  expectedBtcHeartbeatMs: number;
  heartbeatWarningGapMs: number;
  probableSuspensionGapMs: number;
  timelineBucketMs: number;
  artifactStaleAfterHours: number;
};

export type DurationMetricDefinitions = {
  configuredDurationSeconds: string;
  processWallClockSeconds: string;
  eventWallClockSpanSeconds: string;
  activeObservationSeconds: string;
  usableObservationSeconds: string;
  suspectedHostSuspensionSeconds: string;
  webSocketDisconnectedSeconds: string;
  resynchronizationSeconds: string;
  unknownBlindSeconds: string;
};

export type DurationMetrics = {
  configuredDurationSeconds: number | null;
  processWallClockSeconds: number | null;
  eventWallClockSpanSeconds: number | null;
  activeObservationSeconds: number | null;
  usableObservationSeconds: number | null;
  suspectedHostSuspensionSeconds: number | null;
  webSocketDisconnectedSeconds: number | null;
  resynchronizationSeconds: number | null;
  unknownBlindSeconds: number | null;
  definitions: DurationMetricDefinitions;
  warnings: string[];
};

export type ValidBookMetricReconciliation = {
  metricId: string;
  label: string;
  value: number | null;
  numerator: number;
  denominator: number;
  population: string;
  filters: readonly string[];
  excludedRecordCount: number;
  exclusionReasons: readonly string[];
  sourceArtifact: string;
  sourceModule: string;
  replacesAmbiguousField: string | null;
};

export type CounterSemanticDefinition = {
  fieldName: string;
  reportedValue: number | null;
  semanticDefinition: string;
  incrementRule: string;
  sourcePath: string;
  notes: readonly string[];
};

export type SuspensionInterval = {
  startedAt: string;
  endedAt: string;
  gapDurationMs: number;
  previousHeartbeatAt: string;
  nextHeartbeatAt: string;
  classification: "ordinary-delay" | "network-outage" | "probable-host-suspension" | "unknown-long-gap";
  confidence: "low" | "medium" | "high";
  corroboratingStreams: readonly string[];
  notes: readonly string[];
};

export type SuspensionDetectionSummary = {
  suspectedSystemSleepEventCount: number;
  suspectedSystemSleepSeconds: number;
  longestHeartbeatGapMs: number | null;
  heartbeatGapCount: number;
  intervals: readonly SuspensionInterval[];
  warnings: readonly string[];
};

export type TimelineBucketCounters = {
  bucketStart: string;
  bucketEnd: string;
  btcHeartbeatCount: number;
  topOfBookCount: number;
  rawWsMessageCount: number;
  gapDetectedTopOfBookCount: number;
  validTopOfBookCount: number;
  sequenceGapTopOfBookProxyCount: number;
  suspectedSuspension: boolean;
  classification: "usable" | "degraded" | "blind" | "unknown";
};

export type ConnectionAttributionSummary = {
  reconnectCount: number | null;
  sequenceGapCount: number | null;
  sequenceGapEpisodeCount: number | null;
  eventsInsideSuspensionWindows: number;
  eventsOutsideSuspensionWindows: number;
  timelineBuckets: readonly TimelineBucketCounters[];
  counterSemantics: readonly CounterSemanticDefinition[];
};

export type ResearchSuitabilityVerdict =
  | "ready"
  | "ready-with-warnings"
  | "degraded-but-usable"
  | "not-ready"
  | "unknown";

export type ResearchSuitabilityAssessment = {
  descriptiveAnalysisSuitability: ResearchSuitabilityVerdict;
  continuousMicrostructureSuitability: ResearchSuitabilityVerdict;
  transientEventDetectionSuitability: ResearchSuitabilityVerdict;
  forwardPathSuitability: ResearchSuitabilityVerdict;
  zeroCandidateInterpretation:
    | "zero-candidates-on-clean-observation"
    | "zero-candidates-with-material-blind-windows"
    | "zero-candidates-on-mixed-scope-inputs"
    | "candidate-result-not-interpretable";
  rationale: readonly string[];
};

export type DownstreamArtifactScopeCheck = {
  artifactPath: string;
  present: boolean;
  analysisScope: AnalysisScope | null;
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
  artifactGeneratedAt: string | null;
  matchesSelectedRun: boolean;
  stale: boolean;
  warnings: readonly string[];
};

export type SamplingSemantics = {
  topOfBookThrottleMs: number | null;
  rawUpdateCadence: string;
  emittedTopOfBookCadence: string;
  candidateScanInputSource: string;
  minimumObservableEventDurationMs: number | null;
  subSecondParityDetectable: boolean;
  notes: readonly string[];
};

export type CaptureHealthReconciliationSummary = {
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  recordsScanned: number;
  comparisonMode: "full" | "sampled";
  overallVerdict: string;
  recommendedNextAction: string;
  warnings: readonly string[];
};

export type CaptureHealthReconciliationReport = {
  generatedAt: string;
  analysisVersion: string;
  disclaimer: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CaptureHealthReconciliationConfig;
  captureConfig: Record<string, unknown>;
  summary: CaptureHealthReconciliationSummary;
  durations: DurationMetrics;
  validBookMetrics: readonly ValidBookMetricReconciliation[];
  suspension: SuspensionDetectionSummary;
  connectionAttribution: ConnectionAttributionSummary;
  sampling: SamplingSemantics;
  downstreamArtifacts: readonly DownstreamArtifactScopeCheck[];
  researchSuitability: ResearchSuitabilityAssessment;
};

export type CaptureTimelineAttributionReport = {
  generatedAt: string;
  analysisVersion: string;
  disclaimer: string;
  outputPath: string;
  htmlOutputPath: string;
  summary: CaptureHealthReconciliationSummary;
  suspension: SuspensionDetectionSummary;
  connectionAttribution: ConnectionAttributionSummary;
  durations: DurationMetrics;
  researchSuitability: ResearchSuitabilityAssessment;
};

export class CaptureHealthReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureHealthReconciliationError";
  }
}
