export const DEFAULT_WALK_FORWARD_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_WALK_FORWARD_OUTPUT_DIR = "data/walk-forward";
export const WALK_FORWARD_SUMMARY_FILENAME = "walk-forward-summary.json";
export const WALK_FORWARD_FOLDS_DIR = "folds";

export type WalkForwardSplitDefinition = {
  splitId: string;
  trainingWindowSize: number;
  validationWindowSize: number;
  stepSize: number;
  embargoMarketCount: number;
  allowOverlappingValidationWindows: boolean;
};

export type WalkForwardRegistryMarket = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  marketCloseTime: string;
  registryPath: string;
};

export type WalkForwardMarketRef = {
  seriesTicker: string;
  marketTicker: string;
  marketCloseTime: string;
  fixturePath: string;
  registryPath: string;
  orderedIndex: number;
};

export type WalkForwardFoldMetadata = {
  trainingWindowSize: number;
  validationWindowSize: number;
  stepSize: number;
  embargoMarketCount: number;
  trainingStartIndex: number;
  trainingEndIndex: number;
  validationStartIndex: number;
  validationEndIndex: number;
  trainingStartCloseTime: string;
  trainingEndCloseTime: string;
  validationStartCloseTime: string;
  validationEndCloseTime: string;
};

export type WalkForwardFold = {
  foldIndex: number;
  splitId: string;
  trainingMarkets: readonly WalkForwardMarketRef[];
  validationMarkets: readonly WalkForwardMarketRef[];
  metadata: WalkForwardFoldMetadata;
};

export type WalkForwardSplitSummary = {
  splitId: string;
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  generatedAt: string;
  config: WalkForwardSplitDefinition;
  orderedMarketCount: number;
  foldCount: number;
  folds: readonly {
    foldIndex: number;
    outputPath: string;
  }[];
};

export type WalkForwardSplitFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  listRegistryPaths: (registryDir: string) => readonly string[];
};

export type RunWalkForwardSplitInput = {
  registryDir: string;
  outputDir: string;
  config: WalkForwardSplitDefinition;
  generatedAt: string;
};

export type WalkForwardSplitRunnerDeps = {
  filesystem: WalkForwardSplitFilesystem;
};
