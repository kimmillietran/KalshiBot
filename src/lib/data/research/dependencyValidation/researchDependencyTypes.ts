import type { ResearchPipelineConfig } from "@/lib/data/research/pipeline/researchPipelineTypes";

export type DependencyRequirement = "required" | "optional";

export type DependencyArtifactKind =
  | "file"
  | "directory-non-empty"
  | "file-named-under";

export type DependencyArtifactSpec = {
  id: string;
  label: string;
  path: string;
  requirement: DependencyRequirement;
  kind: DependencyArtifactKind;
  fileName?: string;
  minCount?: number;
};

export type ResearchStepDependencySpec = {
  stepId: string;
  requiredArtifacts: readonly DependencyArtifactSpec[];
  optionalArtifacts: readonly DependencyArtifactSpec[];
  outputArtifactPath?: string;
  stalenessInputPaths?: readonly string[];
};

export type DependencyValidationStatus = "passed" | "warning" | "failed";

export type DependencyValidationResult = {
  dependencyStatus: DependencyValidationStatus;
  missingDependencies: readonly string[];
  staleDependencies: readonly string[];
  warnings: readonly string[];
};

export type ResearchDependencyIo = {
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  getModifiedTimeMs: (path: string) => number | null;
  countFilesNamedUnder: (root: string, fileName: string) => number;
};

export type ValidateResearchStepDependenciesInput = {
  spec: ResearchStepDependencySpec;
  io: ResearchDependencyIo;
  strictDependencies: boolean;
};

export type BuildResearchStepDependencySpecsInput = Pick<
  ResearchPipelineConfig,
  "discoveryOutputPath"
>;
