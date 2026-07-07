import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { getResearchAxisGroup } from "@/lib/data/research/dimensions";
import type { ResearchMatcherAxisId } from "@/lib/data/research/dimensions/types";

import type { ResearchRoiDimensionId } from "./researchRoiAnalysisTypes";

const MATCHER_AXIS_TO_ROI_DIMENSION: Record<
  ResearchMatcherAxisId,
  ResearchRoiDimensionId
> = {
  probability: "probability",
  time: "time",
  moneyness: "moneyness",
  volatility: "volatility",
  momentum: "momentum",
  hour: "time",
  dayOfWeek: "time",
  session: "time",
  weekend: "time",
};

function uniqueDimensions(
  dimensions: readonly ResearchRoiDimensionId[],
): readonly ResearchRoiDimensionId[] {
  return [...new Set(dimensions)];
}

export function resolveResearchDimensionsFromGroupId(
  groupId: HypothesisAtlasGroupId,
): readonly ResearchRoiDimensionId[] {
  const group = getResearchAxisGroup(groupId);

  if (groupId === "probabilityRegime") {
    return ["probability", "regime"];
  }

  return uniqueDimensions(
    group.matcherAxes.map((axis) => MATCHER_AXIS_TO_ROI_DIMENSION[axis]),
  );
}

export function researchDimensionLabel(dimensionId: ResearchRoiDimensionId): string {
  switch (dimensionId) {
    case "probability":
      return "Probability";
    case "time":
      return "Time remaining";
    case "moneyness":
      return "Moneyness";
    case "volatility":
      return "Volatility";
    case "momentum":
      return "BTC momentum";
    case "regime":
      return "Volatility regime";
    case "leadLag":
      return "Lead-lag";
    default:
      return dimensionId;
  }
}

export function axisGroupLabel(groupId: HypothesisAtlasGroupId): string {
  return groupId.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
