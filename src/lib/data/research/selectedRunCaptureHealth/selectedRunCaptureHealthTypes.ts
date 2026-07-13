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
  captureVerdict: string | null;
  recommendedNextAction: string | null;
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
};

export class SelectedRunCaptureHealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectedRunCaptureHealthError";
  }
}
