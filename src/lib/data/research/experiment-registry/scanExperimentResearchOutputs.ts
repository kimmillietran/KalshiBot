import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";

import type {
  ExperimentRegistryIo,
  ScannedExperimentResearchOutput,
} from "./experimentRegistryTypes";

/** Scans strategy-aware and legacy research outputs for experiment registration. */
export function scanExperimentResearchOutputs(
  researchRoot: string,
  io: ExperimentRegistryIo,
): readonly ScannedExperimentResearchOutput[] {
  return scanCalibrationResearchOutputs(researchRoot, io);
}
