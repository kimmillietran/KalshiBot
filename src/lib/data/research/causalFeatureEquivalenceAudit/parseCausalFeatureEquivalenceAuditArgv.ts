import { CausalFeatureEquivalenceAuditError } from "./causalFeatureEquivalenceAuditTypes";
import {
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_HTML_PATH,
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_OUTPUT_PATH,
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_PATH,
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_HYPOTHESIS_CONFIG_PATH,
} from "./causalFeatureEquivalenceAuditTypes";

export type ParsedCausalFeatureEquivalenceAuditArgv = {
  captureRunDir: string;
  outputPath: string;
  htmlOutputPath: string;
  evidencePath: string;
  hypothesisConfigPath: string;
};

/**
 * Requires explicit --capture-run-dir. No latest / mtime / newest-directory fallback.
 */
export function parseCausalFeatureEquivalenceAuditArgv(
  argv: readonly string[],
): ParsedCausalFeatureEquivalenceAuditArgv {
  let captureRunDir: string | null = null;
  let outputPath = DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_OUTPUT_PATH;
  let htmlOutputPath = DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_HTML_PATH;
  let evidencePath = DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_PATH;
  let hypothesisConfigPath = DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_HYPOTHESIS_CONFIG_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === "--capture-run-dir") {
      if (!next || next.startsWith("--")) {
        throw new CausalFeatureEquivalenceAuditError("--capture-run-dir requires a path");
      }
      captureRunDir = next;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!next || next.startsWith("--")) {
        throw new CausalFeatureEquivalenceAuditError("--output requires a path");
      }
      outputPath = next;
      index += 1;
      continue;
    }
    if (arg === "--html-output") {
      if (!next || next.startsWith("--")) {
        throw new CausalFeatureEquivalenceAuditError("--html-output requires a path");
      }
      htmlOutputPath = next;
      index += 1;
      continue;
    }
    if (arg === "--evidence") {
      if (!next || next.startsWith("--")) {
        throw new CausalFeatureEquivalenceAuditError("--evidence requires a path");
      }
      evidencePath = next;
      index += 1;
      continue;
    }
    if (arg === "--hypothesis-config") {
      if (!next || next.startsWith("--")) {
        throw new CausalFeatureEquivalenceAuditError("--hypothesis-config requires a path");
      }
      hypothesisConfigPath = next;
      index += 1;
      continue;
    }
    if (arg === "--latest" || arg === "--newest" || arg === "--mtime") {
      throw new CausalFeatureEquivalenceAuditError(
        `Unsupported fallback flag ${arg}: --capture-run-dir is required`,
      );
    }
    throw new CausalFeatureEquivalenceAuditError(`Unknown argument: ${arg}`);
  }

  if (!captureRunDir) {
    throw new CausalFeatureEquivalenceAuditError(
      "Missing required --capture-run-dir <EXPLICIT_PATH> (no latest fallback)",
    );
  }

  return {
    captureRunDir,
    outputPath,
    htmlOutputPath,
    evidencePath,
    hypothesisConfigPath,
  };
}
