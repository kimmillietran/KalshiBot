import {
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
  LeadLagEvidenceContractError,
} from "./leadLagEvidenceContractTypes";

const FORBIDDEN_OUTCOME_PATH_MARKERS = [
  "lead-lag-analysis",
  "lead-lag-events",
  "btc-kalshi-lead-lag-analysis",
] as const;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isForbiddenLeadLagOutcomePath(path: string): boolean {
  const normalized = normalizePath(path);
  const touchesValidation = normalized.includes(KNOWN_LEAD_LAG_VALIDATION_RUN_ID);
  const touchesHoldout = normalized.includes(KNOWN_LEAD_LAG_HOLDOUT_RUN_ID);
  if (!touchesValidation && !touchesHoldout) {
    return false;
  }
  // Identity/split metadata paths that only name the run id are allowed when they are
  // not lead-lag outcome artifacts. Outcome markers under those run trees are forbidden.
  return FORBIDDEN_OUTCOME_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

export function assertLeadLagOutcomePathAllowed(path: string): void {
  if (isForbiddenLeadLagOutcomePath(path)) {
    throw new LeadLagEvidenceContractError(
      `M12.8c-prep forbids reading validation/holdout lead-lag outcomes: ${path}`,
    );
  }
}

/**
 * Wrap IO so Run 2 / Run 3 lead-lag outcome artifacts cannot be read.
 * Capture identity probes that do not include lead-lag outcome markers remain allowed.
 */
export function createOutcomeQuarantinedEvidenceIo<T extends {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  iterateJsonl?: (path: string, options?: unknown) => Promise<unknown>;
  streamJsonl?: (path: string, options?: unknown) => Promise<unknown>;
}>(baseIo: T): T {
  return {
    ...baseIo,
    readFile: (path: string) => {
      assertLeadLagOutcomePathAllowed(path);
      return baseIo.readFile(path);
    },
    fileExists: (path: string) => {
      assertLeadLagOutcomePathAllowed(path);
      return baseIo.fileExists(path);
    },
    ...(baseIo.iterateJsonl
      ? {
          iterateJsonl: async (path: string, options?: unknown) => {
            assertLeadLagOutcomePathAllowed(path);
            return baseIo.iterateJsonl!(path, options);
          },
        }
      : {}),
    ...(baseIo.streamJsonl
      ? {
          streamJsonl: async (path: string, options?: unknown) => {
            assertLeadLagOutcomePathAllowed(path);
            return baseIo.streamJsonl!(path, options);
          },
        }
      : {}),
  };
}

/** Explicit non-invocation guards for analyzer entrypoints. */
export function assertAnalyzerNotInvokedOnValidationOrHoldout(captureRunDir: string): void {
  const normalized = normalizePath(captureRunDir);
  if (normalized.includes(KNOWN_LEAD_LAG_VALIDATION_RUN_ID)) {
    throw new LeadLagEvidenceContractError(
      "M12.8c-prep must not invoke the per-run lead-lag analyzer on validation Run 2",
    );
  }
  if (normalized.includes(KNOWN_LEAD_LAG_HOLDOUT_RUN_ID)) {
    throw new LeadLagEvidenceContractError(
      "M12.8c-prep must not invoke the per-run lead-lag analyzer on holdout Run 3",
    );
  }
}
