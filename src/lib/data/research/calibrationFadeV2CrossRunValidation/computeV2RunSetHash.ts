import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import {
  CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION,
  type V2CrossRunHashPayload,
  type V2CrossRunPerRunIdentity,
} from "./calibrationFadeV2CrossRunValidationTypes";

export function computeV2RunSetHash(input: {
  hypothesisId: string;
  configurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: string;
  selectedRunIds: readonly string[];
  perRun: readonly V2CrossRunPerRunIdentity[];
}): { runSetHash: string; payload: V2CrossRunHashPayload } {
  const selectedRunIds = [...input.selectedRunIds].sort((left, right) => left.localeCompare(right));
  const perRun = [...input.perRun].sort((left, right) => left.runId.localeCompare(right.runId));
  const payload: V2CrossRunHashPayload = {
    analysisVersion: CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION,
    evidenceMode: "confirmatory",
    hypothesisId: input.hypothesisId,
    hypothesisVersion: "v2",
    configurationHash: input.configurationHash,
    freezeCommitSha: input.freezeCommitSha,
    sourceRecordType: input.sourceRecordType,
    selectedRunIds,
    perRun,
  };
  return {
    runSetHash: fnv1a32(stableStringify(payload)),
    payload,
  };
}
