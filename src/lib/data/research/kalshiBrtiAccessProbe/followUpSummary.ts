import { HISTORICAL_PARAMETER_SEMANTICS } from "./historicalSemantics";
import type { OfficialTargetBindResult } from "./bindOfficialTargetMetadata";
import type { OfficialComparisonRecord } from "./compareOfficialSettlement";
import type { HistoryPayloadInspection } from "./inspectHistoryPayload";
import {
  BRTI_ACCESS_PROBE_STUDY_ID,
  type ProbeClassification,
} from "./types";
import { V0_CAMPAIGN_ID } from "./campaignBudget";

export type FollowUpCredentialsSummary = {
  status: string;
  keyIdPresent: boolean;
  privateKeyLoaded: boolean;
  privateKeySource: string;
};

export type FollowUpHttpBudgetSummary = {
  campaignId: string;
  limit: number;
  consumed: number;
  entries: Array<{
    id: string;
    purpose: string;
    status: string;
    httpStatus: number | null;
    category: string | null;
  }>;
};

export type FollowUpSummary = {
  studyId: string;
  artifactKind: "v1-reliability-supplement";
  generatedAtUtc: string;
  classification: ProbeClassification;
  httpRequestCount: number;
  campaignId: string;
  preservedV0: {
    campaignId: typeof V0_CAMPAIGN_ID;
    consumed: 13;
    limit: 10;
    overrun: true;
    furtherRequestsForbidden: true;
  };
  originalSnapshots: {
    v0Summary: string;
    v1Summary: string;
    note: string;
  };
  historicalSemantics: typeof HISTORICAL_PARAMETER_SEMANTICS;
  targetSelection: Record<string, unknown>;
  officialMetadataBind: OfficialTargetBindResult;
  layers: {
    endpointDocumented: boolean;
    codeImplemented: boolean;
    credentialsAvailable: boolean;
    accessExercised: boolean;
    historicalCoverageDemonstrated: boolean;
    causalSuitabilityEstablished: false;
  };
  credentials: FollowUpCredentialsSummary;
  httpBudget: FollowUpHttpBudgetSummary;
  thisTaskHttpAttempts: number;
  history: Record<string, unknown>;
  historyPayload: HistoryPayloadInspection | { kind: "not-attempted" };
  live: Record<string, unknown>;
  officialComparison: OfficialComparisonRecord;
  causalLimitations: string[];
  nextPrerequisite: string;
  reproducibility: {
    originalObservationsPreserved: true;
    timestampsNeedNotBeByteIdentical: true;
    codeIdentity: string;
  };
};

export function classifyFollowUpCampaign(input: {
  credentialsStatus: string;
  historyCategory: string | null;
  payloadKind: HistoryPayloadInspection["kind"] | "not-attempted";
  inHourCount: number;
  liveConnected: boolean;
  budgetBlockedNetwork: boolean;
}): ProbeClassification {
  if (input.historyCategory === "authentication-failure" || input.historyCategory === "entitlement-denial") {
    return "blocked-by-entitlement-credentials-retention-or-semantics";
  }
  if (input.payloadKind === "response-error-in-200") {
    return "blocked-by-entitlement-credentials-retention-or-semantics";
  }
  if (input.credentialsStatus !== "available" && input.payloadKind === "not-attempted" && !input.liveConnected) {
    return input.budgetBlockedNetwork
      ? "inconclusive-within-bounded-probe"
      : "blocked-by-entitlement-credentials-retention-or-semantics";
  }
  if (input.payloadKind === "unsupported-schema" || input.payloadKind === "ambiguous-schema") {
    return "inconclusive-within-bounded-probe";
  }
  if (input.inHourCount > 0 || input.liveConnected || input.payloadKind === "valid-empty-history" || input.payloadKind === "out-of-hour-only" || input.payloadKind === "observations-unrecognized" || input.historyCategory === "success" || input.historyCategory === "empty-success") {
    return "access-available-with-identified-limitations";
  }
  return "inconclusive-within-bounded-probe";
}

export function serializeFollowUpSummary(summary: FollowUpSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function cliFollowUpPreview(summary: Pick<FollowUpSummary, "classification" | "httpRequestCount" | "credentials">): {
  classification: ProbeClassification;
  httpRequestCount: number;
  credentials: FollowUpCredentialsSummary;
} {
  return {
    classification: summary.classification,
    httpRequestCount: summary.httpRequestCount,
    credentials: summary.credentials,
  };
}

export function followUpStudyId(): string {
  return `${BRTI_ACCESS_PROBE_STUDY_ID}-follow-up`;
}

export const ORIGINAL_SNAPSHOT_NOTE =
  "v0 and original v1 summaries are original campaign snapshots. Do not treat later supplement fields as if the original runner serialized them." as const;
