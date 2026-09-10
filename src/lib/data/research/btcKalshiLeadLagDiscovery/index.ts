export {
  LEAD_LAG_RESEARCH_SPLIT_VERSION,
  LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  LEAD_LAG_DISCOVERY_RANKING_VERSION,
  LEAD_LAG_STRUCTURAL_CELL_COUNT,
  LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT,
  LEAD_LAG_RESPONSE_DIRECTIONS,
  DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG,
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  LEAD_LAG_DISCOVERY_DISCLAIMER,
  LeadLagGovernedDiscoveryError,
} from "./leadLagDiscoveryTypes";
export type {
  LeadLagResearchSplitManifest,
  LeadLagGovernedDiscoveryReport,
  LeadLagDiscoveryCandidate,
  LeadLagDiscoveryCellMetrics,
  LeadLagDiscoveryIo,
  LeadLagContaminationClassification,
  LeadLagDiscoveryStatus,
} from "./leadLagDiscoveryTypes";

export {
  buildLeadLagResearchSplitManifest,
  buildCaptureArtifactIdentity,
  classifyLeadLagContamination,
  resolveRunIdFromCaptureDir,
  sha256Hex,
} from "./buildLeadLagResearchSplitManifest";

export {
  createTrainOnlyDiscoveryIo,
  createFilesystemLeadLagDiscoveryIo,
  assertPathIsUnderTrainOnly,
} from "./createTrainOnlyDiscoveryIo";

export {
  declareLeadLagSearchUniverse,
  aggregateLeadLagDiscoveryCells,
  computeTrainIncidenceFromEvents,
} from "./aggregateLeadLagDiscoveryCells";

export {
  rankLeadLagDiscoveryCandidates,
  CANDIDATE_RANKING_METHODOLOGY,
} from "./rankLeadLagDiscoveryCandidates";

export {
  buildLeadLagGovernedDiscoveryReport,
  resolveLeadLagDiscoveryOutputPaths,
  serializeLeadLagGovernedDiscoveryHtml,
  serializeLeadLagGovernedDiscoveryReport,
} from "./buildLeadLagGovernedDiscoveryReport";

export { parseLeadLagGovernedDiscoveryArgv } from "./parseLeadLagGovernedDiscoveryArgv";
