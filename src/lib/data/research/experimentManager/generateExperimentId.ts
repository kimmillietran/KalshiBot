import { RESEARCH_EXPERIMENT_ID_PREFIX } from "./experimentManagerTypes";

function compactTimestamp(isoTimestamp: string): string {
  return isoTimestamp
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "T");
}

function shortSuffix(isoTimestamp: string, gitCommit: string | null): string {
  const seed = `${isoTimestamp}:${gitCommit ?? "nogit"}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).slice(0, 6).padStart(6, "0");
}

export function buildResearchExperimentId(
  timestamp: string,
  gitCommit: string | null,
): string {
  return `${RESEARCH_EXPERIMENT_ID_PREFIX}-${compactTimestamp(timestamp)}-${shortSuffix(timestamp, gitCommit)}`;
}

export function buildResearchExperimentRecordPath(
  experimentsDir: string,
  experimentId: string,
): string {
  return `${experimentsDir}/${experimentId}/experiment.json`;
}
