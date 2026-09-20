import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { M15StudyDefinition } from "./buildM15StudyDefinition";
import type { M15CostFloorReport } from "./m15CostFloorTypes";

export function serializeM15StudyDefinitionJson(definition: M15StudyDefinition): string {
  return `${stableStringify(definition)}\n`;
}

export function serializeM15CostFloorReportJson(report: M15CostFloorReport): string {
  return `${stableStringify(report)}\n`;
}
