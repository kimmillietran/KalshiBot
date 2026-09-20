import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { M16FamilyDefinition } from "./buildM16FamilyDefinition";
import type { M16IncidencePlan } from "./buildM16IncidencePlan";
import type { M16BlindIncidenceReport } from "./streamM16BlindIncidence";

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
