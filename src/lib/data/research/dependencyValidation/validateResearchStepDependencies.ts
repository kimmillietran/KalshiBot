import type {
  DependencyArtifactSpec,
  DependencyValidationResult,
  DependencyValidationStatus,
  ResearchDependencyIo,
  ValidateResearchStepDependenciesInput,
} from "./researchDependencyTypes";

function artifactSatisfied(
  artifact: DependencyArtifactSpec,
  io: ResearchDependencyIo,
): boolean {
  switch (artifact.kind) {
    case "file":
      return io.fileExists(artifact.path);
    case "directory-non-empty": {
      if (!io.isDirectory(artifact.path)) {
        return false;
      }

      return io.countFilesNamedUnder(artifact.path, "") > 0;
    }
    case "file-named-under":
      return io.countFilesNamedUnder(
        artifact.path,
        artifact.fileName ?? "",
      ) >= (artifact.minCount ?? 1);
    default:
      return false;
  }
}

function evaluateArtifacts(
  artifacts: readonly DependencyArtifactSpec[],
  io: ResearchDependencyIo,
): {
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const artifact of artifacts) {
    if (artifactSatisfied(artifact, io)) {
      continue;
    }

    const message = `Missing ${artifact.label} (${artifact.path})`;
    if (artifact.requirement === "required") {
      missing.push(message);
    } else {
      warnings.push(message);
    }
  }

  return { missing, warnings };
}

function evaluateStaleness(
  outputPath: string,
  inputPaths: readonly string[],
  io: ResearchDependencyIo,
): string[] {
  const outputMtime = io.getModifiedTimeMs(outputPath);
  if (outputMtime === null) {
    return [];
  }

  const stale: string[] = [];

  for (const inputPath of inputPaths) {
    const inputMtime = io.getModifiedTimeMs(inputPath);
    if (inputMtime !== null && inputMtime > outputMtime) {
      stale.push(`${outputPath} is older than ${inputPath}`);
    }
  }

  return stale;
}

function deriveDependencyStatus(options: {
  missing: readonly string[];
  stale: readonly string[];
  warnings: readonly string[];
  strictDependencies: boolean;
}): DependencyValidationStatus {
  if (options.missing.length > 0) {
    return "failed";
  }

  if (options.strictDependencies && options.stale.length > 0) {
    return "failed";
  }

  if (options.warnings.length > 0 || options.stale.length > 0) {
    return "warning";
  }

  return "passed";
}

/** Validates prerequisites for one pipeline step without mutating artifacts. */
export function validateResearchStepDependencies(
  input: ValidateResearchStepDependenciesInput,
): DependencyValidationResult {
  const required = evaluateArtifacts(input.spec.requiredArtifacts, input.io);
  const optional = evaluateArtifacts(input.spec.optionalArtifacts, input.io);

  const staleDependencies =
    input.spec.outputArtifactPath && input.spec.stalenessInputPaths
      ? evaluateStaleness(
          input.spec.outputArtifactPath,
          input.spec.stalenessInputPaths,
          input.io,
        )
      : [];

  const staleWarnings = staleDependencies.map(
    (entry) => `Stale artifact detected: ${entry}`,
  );

  const warnings = [...required.warnings, ...optional.warnings, ...staleWarnings];

  const dependencyStatus = deriveDependencyStatus({
    missing: required.missing,
    stale: staleDependencies,
    warnings,
    strictDependencies: input.strictDependencies,
  });

  return {
    dependencyStatus,
    missingDependencies: required.missing,
    staleDependencies,
    warnings,
  };
}

export function formatDependencyFailureMessage(
  stepLabel: string,
  validation: DependencyValidationResult,
): string {
  const parts = [`Dependency validation failed for ${stepLabel}.`];

  if (validation.missingDependencies.length > 0) {
    parts.push(`Missing: ${validation.missingDependencies.join("; ")}`);
  }

  if (validation.staleDependencies.length > 0) {
    parts.push(`Stale: ${validation.staleDependencies.join("; ")}`);
  }

  if (validation.warnings.length > 0) {
    parts.push(`Warnings: ${validation.warnings.join("; ")}`);
  }

  return parts.join(" ");
}
