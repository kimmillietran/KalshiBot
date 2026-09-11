export {
  MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  MOMENTUM_DISCOVERY_RESEARCH_SPLIT_VERSION,
  MOMENTUM_DISCOVERY_DISCLAIMER,
  BOUND_MATERIAL_EFFECT_CENTS,
  BOUND_ALPHA,
  BOUND_TARGET_POWER,
  BOUND_OUTCOME_SD_CENTS,
  DEFAULT_MOMENTUM_TRAIN_RUN_ID,
  DEFAULT_MOMENTUM_VALIDATION_RUN_ID,
  DEFAULT_MOMENTUM_HOLDOUT_RUN_ID,
  MomentumGovernedDiscoveryError,
} from "./momentumDiscoveryTypes";
export type {
  MomentumGovernedDiscoveryReport,
  MomentumDiscoveryCandidateResult,
  MomentumResearchSplitManifest,
  MomentumDiscoveryIo,
} from "./momentumDiscoveryTypes";

export {
  buildMomentumResearchSplitManifest,
  hashLargeJsonlIdentity,
  sha256Hex,
} from "./buildMomentumResearchSplitManifest";
export { createTrainOnlyMomentumDiscoveryIo } from "./createTrainOnlyDiscoveryIo";
export {
  createFilesystemMomentumDiscoveryIo,
  createMemoryMomentumDiscoveryIo,
} from "./createMomentumDiscoveryIo";
export {
  sealMomentumPreOpenBundle,
  isDirectionConsistentWithFamily,
  printMomentumPreOpenSummary,
  STRUCTURAL_SIMPLICITY_ORDERING_RULE,
} from "./preOpenGate";
export {
  streamTrainMomentumDiscovery,
  summarizeCellMetrics,
  loadCloseTimeByMarket,
  median,
} from "./streamTrainMomentumDiscovery";
export {
  buildMomentumGovernedDiscoveryReport,
  resolveMomentumDiscoveryOutputPaths,
} from "./buildMomentumGovernedDiscoveryReport";
export { parseMomentumDiscoveryArgv } from "./parseMomentumDiscoveryArgv";
export {
  serializeMomentumDiscoveryJson,
  serializeMomentumDiscoveryHtml,
} from "./serializeMomentumDiscovery";
