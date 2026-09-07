import { stableStringify } from "@/lib/trading/config/hashConfig";

import { V2_REQUIRED_SOURCE_RECORD_TYPE } from "../calibrationFadeV2Preregistration";

import {
  CalibrationFadeV2ForwardValidationError,
  type CalibrationFadeV2EvidenceIdentity,
  type CalibrationFadeV2ForwardValidationReport,
} from "./calibrationFadeV2ForwardValidationTypes";

const REQUIRED_IDENTITY_KEYS: Array<keyof CalibrationFadeV2EvidenceIdentity> = [
  "hypothesisId",
  "hypothesisVersion",
  "configurationHash",
  "freezeCommitSha",
  "sourceRecordType",
  "sourceContractId",
  "captureRunId",
  "captureStartedAt",
  "evidenceMode",
  "confirmatoryEligibility",
];

export function assertCompleteV2EvidenceIdentity(
  identity: CalibrationFadeV2EvidenceIdentity,
): void {
  for (const key of REQUIRED_IDENTITY_KEYS) {
    const value = identity[key];
    if (key === "confirmatoryEligibility") {
      if (typeof value !== "boolean") {
        throw new CalibrationFadeV2ForwardValidationError(
          `v2 evidence identity is missing required field ${key}`,
        );
      }
      continue;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new CalibrationFadeV2ForwardValidationError(
        `v2 evidence identity is missing required field ${key}`,
      );
    }
  }
  if (identity.hypothesisVersion !== "v2") {
    throw new CalibrationFadeV2ForwardValidationError("v2 evidence identity hypothesisVersion must be v2");
  }
  if (identity.sourceRecordType !== V2_REQUIRED_SOURCE_RECORD_TYPE) {
    throw new CalibrationFadeV2ForwardValidationError(
      `v2 evidence identity sourceRecordType must be ${V2_REQUIRED_SOURCE_RECORD_TYPE}`,
    );
  }
  if (identity.evidenceMode !== "diagnostic" && identity.evidenceMode !== "confirmatory") {
    throw new CalibrationFadeV2ForwardValidationError(
      "v2 evidence identity evidenceMode must be diagnostic or confirmatory",
    );
  }
}

export function serializeCalibrationFadeV2ForwardValidationJson(
  report: CalibrationFadeV2ForwardValidationReport,
): string {
  assertCompleteV2EvidenceIdentity(report.evidenceIdentity);
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeV2ForwardEventsJsonl(
  eventLines: readonly string[],
): string {
  if (eventLines.length === 0) {
    return "";
  }
  return `${eventLines.join("\n")}\n`;
}

export function serializeCalibrationFadeV2ForwardMarketsJsonl(
  marketLines: readonly string[],
): string {
  if (marketLines.length === 0) {
    return "";
  }
  return `${marketLines.join("\n")}\n`;
}

export function serializeCalibrationFadeV2ForwardValidationHtml(
  report: CalibrationFadeV2ForwardValidationReport,
): string {
  assertCompleteV2EvidenceIdentity(report.evidenceIdentity);
  const identity = report.evidenceIdentity;
  const funnelRows = report.funnel
    .map((stage) => `<tr><td>${stage.label}</td><td>${stage.count}</td></tr>`)
    .join("");
  const gateRows = Object.entries(report.gatePassCounts)
    .map(([gate, count]) => `<tr><td>${gate}</td><td>${count}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration-fade v2 forward validation</title>
</head>
<body>
  <h1>Calibration-fade v2 forward validation</h1>
  <p>${report.disclaimer}</p>
  <h2>Evidence identity</h2>
  <ul>
    <li>hypothesisId: ${identity.hypothesisId}</li>
    <li>hypothesisVersion: ${identity.hypothesisVersion}</li>
    <li>configurationHash: ${identity.configurationHash}</li>
    <li>freezeCommitSha: ${identity.freezeCommitSha}</li>
    <li>sourceRecordType: ${identity.sourceRecordType}</li>
    <li>sourceContractId: ${identity.sourceContractId}</li>
    <li>captureRunId: ${identity.captureRunId}</li>
    <li>captureStartedAt: ${identity.captureStartedAt}</li>
    <li>evidenceMode: ${identity.evidenceMode}</li>
    <li>confirmatoryEligibility: ${String(identity.confirmatoryEligibility)}</li>
    <li>confirmatoryIneligibilityReason: ${identity.confirmatoryIneligibilityReason ?? "none"}</li>
  </ul>
  <h2>Executive result</h2>
  <p><strong>${report.summary.interpretationClassification}</strong> — ${report.summary.rationale}</p>
  <p>Recommended next action: <strong>${report.summary.recommendedNextAction}</strong></p>
  <h2>Selected run</h2>
  <p>${report.selectedRunId} — ${report.recordsScanned} records, ${report.candidateMarketCount} candidate markets</p>
  <h2>Sequential candidate funnel</h2>
  <table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>${funnelRows}</tbody></table>
  <h2>Independent gate pass counts</h2>
  <table><thead><tr><th>Gate</th><th>Count</th></tr></thead><tbody>${gateRows}</tbody></table>
  <h2>Volatility window rejections</h2>
  <pre>${stableStringify(report.volatilityWindowRejections)}</pre>
  <h2>Forward benchmark</h2>
  <pre>${stableStringify(report.forwardBenchmark)}</pre>
</body>
</html>`;
}
