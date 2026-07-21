export const SELECTED_RUN_CAPTURE_HEALTH_ANALYSIS_VERSION = "selected-run-capture-health-v1";

export const GLOBAL_CAPTURE_HEALTH_AUDIT_PATH = "data/research-results/capture-health-audit.json";

export const RESEARCH_READY_CAPTURE_VERDICT = "capture-research-ready";

export type SelectedRunCaptureHealthSource =
  | "native-capture-health"
  | "run-scoped-capture-health-audit"
  | "matching-global-capture-health-audit";

export type ResolvedSelectedRunCaptureHealth = {
  selectedRunId: string;
  captureRunDir: string;
  healthSource: SelectedRunCaptureHealthSource;
  /** Derived research-audit verdict (e.g. capture-research-ready, capture-gappy) when a matching audit exists. */
  captureVerdict: string | null;
  recommendedNextAction: string | null;
  /** Top-level verdict written by the capture process itself (e.g. capture-mvp-success). */
  nativeCaptureVerdict: string | null;
  nativeRecommendedNextAction: string | null;
  /** connection.captureEndReason from native capture-health.json. */
  captureEndReason: string | null;
  /** connection.terminalFailureReason from native capture-health.json. */
  terminalFailureReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /**
   * Whether the matching audit's source-artifact fingerprints were positively
   * revalidated against the current files. Null when no matching audit exists.
   */
  auditFingerprintsVerified: boolean | null;
  /**
   * True only when a strictly matching, schema-valid capture-health audit
   * carries a capture-research-ready verdict AND its freshness fingerprints
   * were positively verified. Unverifiable freshness fails closed to false.
   */
  researchReadyVerified: boolean;
  runDurationSeconds: number | null;
  topOfBookCount: number | null;
  btcSpotCount: number | null;
  validBookShare: number | null;
  btcJoinCoverageShare: number | null;
  p90TopOfBookGapMs: number | null;
  reconnectCount: number | null;
  sequenceGapCount: number | null;
  suspectedSystemSleepSeconds: number | null;
  completedNormally: boolean | null;
  nativeHealthPath: string | null;
  runScopedAuditPath: string | null;
  globalAuditPath: string | null;
  warnings: string[];
};

export type SelectedRunCaptureHealthIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  fileSizeBytes?: (path: string) => number | null;
  fileMtimeMs?: (path: string) => number | null;
};

export class SelectedRunCaptureHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectedRunCaptureHealthError";
  }
}
