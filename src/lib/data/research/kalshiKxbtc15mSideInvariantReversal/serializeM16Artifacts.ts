import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { M16FamilyDefinition } from "./buildM16FamilyDefinition";
import type { M16IncidencePlan } from "./buildM16IncidencePlan";
import type { M16AuthoritativeFeeContract } from "./m16AuthoritativeFeeContract";
import type { M16DependencePlan } from "./m16DependencePlan";
import type { M16EvidenceContract } from "./m16EvidenceContract";
import type { M16ProspectiveCohortPlan } from "./m16ProspectiveCohortPlan";
import type { M16BlindIncidenceReport } from "./streamM16BlindIncidence";
import type { M16OutcomeOpenAuthorization } from "./m16OutcomeOpenGate";

export function serializeM16FamilyDefinitionJson(definition: M16FamilyDefinition): string {
  return `${stableStringify(definition)}\n`;
}

export function serializeM16IncidencePlanJson(plan: M16IncidencePlan): string {
  return `${stableStringify(plan)}\n`;
}

export function serializeM16BlindIncidenceReportJson(
  report: M16BlindIncidenceReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeM16EvidenceContractJson(
  contract: M16EvidenceContract,
): string {
  return `${stableStringify(contract)}\n`;
}

export function serializeM16DependencePlanJson(plan: M16DependencePlan): string {
  return `${stableStringify(plan)}\n`;
}

export function serializeM16AuthoritativeFeeContractJson(
  contract: M16AuthoritativeFeeContract,
): string {
  return `${stableStringify(contract)}\n`;
}

export function serializeM16ProspectiveCohortPlanJson(
  plan: M16ProspectiveCohortPlan,
): string {
  return `${stableStringify(plan)}\n`;
}

export function serializeM16OutcomeOpenStatusJson(
  status: M16OutcomeOpenAuthorization,
): string {
  return `${stableStringify(status)}\n`;
}
