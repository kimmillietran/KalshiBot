export const RESEARCH_ARTIFACT_INDEX_FILENAME = "research-artifact-index.json";
export const DEFAULT_RESEARCH_ARTIFACT_INDEX_OUTPUT_PATH =
  "data/research-results/research-artifact-index.json";
export const DEFAULT_RESEARCH_ARTIFACT_INDEX_HTML_PATH =
  "data/reports/research-artifact-index.html";

export const DEFAULT_DISCOVERY_RESULT_PATH = "discovery-result.json";
export const DEFAULT_IMPORTS_DIR = "data/imports";
export const DEFAULT_IMPORT_CONFIGS_DIR = "data/import-configs";
export const DEFAULT_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_RESEARCH_RESULTS_DIR = "data/research-results";
export const DEFAULT_LEADERBOARD_PATH = "data/leaderboards/strategy-leaderboard.json";
export const DEFAULT_REPORT_HTML_PATH = "data/reports/research-report.html";

export type ResearchArtifactStatus = "present" | "stale" | "missing";

export type ResearchArtifactCatalogKind = "file" | "directory" | "file-collection";

export type ResearchArtifactCatalogEntry = {
  artifactId: string;
  name: string;
  path: string;
  kind: ResearchArtifactCatalogKind;
  fileName?: string;
  producingPipelineStep: string;
  upstreamArtifactIds: readonly string[];
};

export type ResearchArtifactIndexEntry = {
  artifactId: string;
  name: string;
  path: string;
  generatedTimestamp: string | null;
  producingPipelineStep: string;
  upstreamDependencies: readonly string[];
  downstreamConsumers: readonly string[];
  fileSizeBytes: number | null;
  itemCount: number | null;
  status: ResearchArtifactStatus;
};

export type ResearchArtifactIndexSummary = {
  totalArtifacts: number;
  presentCount: number;
  staleCount: number;
  missingCount: number;
};

export type ResearchArtifactIndex = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: ResearchArtifactIndexConfig;
  summary: ResearchArtifactIndexSummary;
  artifacts: readonly ResearchArtifactIndexEntry[];
};

export type ResearchArtifactIndexConfig = {
  discoveryResultPath: string;
  importsDir: string;
  importConfigsDir: string;
  fixturesDir: string;
  registryDir: string;
  researchResultsDir: string;
  leaderboardPath: string;
  reportHtmlPath: string;
  outputPath: string;
  htmlOutputPath: string;
};

export type ArtifactIndexIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  getModifiedTimeMs: (path: string) => number | null;
  getFileSizeBytes: (path: string) => number | null;
  countFilesNamedUnder: (root: string, fileName: string) => number;
  sumFileSizesNamedUnder: (root: string, fileName: string) => number;
  maxModifiedTimeMsNamedUnder: (root: string, fileName: string) => number | null;
};

export type BuildResearchArtifactIndexInput = {
  generatedAt: string;
  config: ResearchArtifactIndexConfig;
  io: ArtifactIndexIo;
};
