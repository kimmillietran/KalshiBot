import type { FullResearchStepDefinition } from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";
import type { ResearchArtifactIndex } from "@/lib/data/research/artifactIndex/researchArtifactIndexTypes";

import type {
  CacheOpportunity,
  CriticalPathAnalysis,
  CriticalPathStep,
  DuplicateArtifactLoad,
  DuplicateFilesystemScan,
  IncrementalRebuildOpportunity,
  MemoryObservation,
  NetworkBottleneck,
  OptimizationOpportunity,
  ParallelExecutionGroup,
  PerformanceAuditStepReport,
  PipelineStepResourceProfile,
} from "./performanceAuditTypes";

const LARGE_JSON_THRESHOLD_BYTES = 256 * 1024;
const INCREMENTAL_REBUILD_SAVINGS_SHARE = 0.7;
const DUPLICATE_LOAD_SAVINGS_SHARE = 0.6;
const DUPLICATE_SCAN_SAVINGS_SHARE = 0.5;
const DESERIALIZE_MS_PER_MB = 12;

type StepDurationMap = ReadonlyMap<string, number>;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function buildDownstreamDependents(
  stepIds: readonly string[],
  upstreamByStep: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  const dependents = new Map<string, Set<string>>();

  for (const stepId of stepIds) {
    for (const upstreamId of upstreamByStep.get(stepId) ?? []) {
      const existing = dependents.get(upstreamId) ?? new Set<string>();
      existing.add(stepId);
      dependents.set(upstreamId, existing);
    }
  }

  return new Map(
    [...dependents.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stepId, downstream]) => [stepId, [...downstream].sort()]),
  );
}

function computeSchedule(
  stepDefinitions: readonly FullResearchStepDefinition[],
  durations: StepDurationMap,
): {
  parallelRuntimeMs: number;
  finishTimes: ReadonlyMap<string, number>;
  startTimes: ReadonlyMap<string, number>;
} {
  const finishTimes = new Map<string, number>();
  const startTimes = new Map<string, number>();

  for (const step of stepDefinitions) {
    const upstreamFinish = step.upstreamStepIds.map((id) => finishTimes.get(id) ?? 0);
    const start = upstreamFinish.length > 0 ? Math.max(...upstreamFinish) : 0;
    const duration = durations.get(step.id) ?? 0;
    const finish = start + duration;
    startTimes.set(step.id, start);
    finishTimes.set(step.id, finish);
  }

  const parallelRuntimeMs = Math.max(0, ...finishTimes.values());
  return { parallelRuntimeMs, finishTimes, startTimes };
}

export function findParallelExecutionGroups(
  stepDefinitions: readonly FullResearchStepDefinition[],
  durations: StepDurationMap,
): readonly ParallelExecutionGroup[] {
  const { startTimes } = computeSchedule(stepDefinitions, durations);
  const groups = new Map<number, string[]>();

  for (const step of stepDefinitions) {
    const start = startTimes.get(step.id) ?? 0;
    const bucket = groups.get(start) ?? [];
    bucket.push(step.id);
    groups.set(start, bucket);
  }

  const opportunities: ParallelExecutionGroup[] = [];

  for (const [startMs, stepIds] of [...groups.entries()].sort(([left], [right]) => left - right)) {
    if (stepIds.length < 2) {
      continue;
    }

    const combinedDurationMs = stepIds.reduce(
      (sum, stepId) => sum + (durations.get(stepId) ?? 0),
      0,
    );
    const maxDurationMs = Math.max(...stepIds.map((stepId) => durations.get(stepId) ?? 0));
    const estimatedSavingsMs = Math.max(0, combinedDurationMs - maxDurationMs);

    opportunities.push({
      groupId: `wave-${startMs}`,
      stepIds,
      combinedDurationMs,
      estimatedSavingsMs,
      rationale:
        "Steps share the same earliest-start time and have no ordering dependency between them in the current orchestrator.",
    });
  }

  return opportunities.sort((left, right) => right.estimatedSavingsMs - left.estimatedSavingsMs);
}

export function findDuplicateArtifactLoads(
  stepReports: readonly PerformanceAuditStepReport[],
): readonly DuplicateArtifactLoad[] {
  const readers = new Map<string, string[]>();

  for (const step of stepReports) {
    for (const filePath of step.filesRead) {
      const normalized = normalizePath(filePath);
      const existing = readers.get(normalized) ?? [];
      existing.push(step.stepId);
      readers.set(normalized, existing);
    }
  }

  return [...readers.entries()]
    .filter(([, stepIds]) => stepIds.length > 1)
    .map(([artifactPath, readingStepIds]) => {
      const wastedMs = readingStepIds
        .slice(1)
        .reduce((sum, stepId) => {
          const report = stepReports.find((entry) => entry.stepId === stepId);
          const readShare = report
            ? report.ioBoundEstimateMs / Math.max(1, report.filesRead.length)
            : 0;
          return sum + readShare * DUPLICATE_LOAD_SAVINGS_SHARE;
        }, 0);

      return {
        artifactPath,
        readingStepIds,
        totalReadCount: readingStepIds.length,
        estimatedWastedMs: Math.round(wastedMs),
        recommendation:
          "Load once into a shared in-memory context and pass references to downstream reporting steps.",
      };
    })
    .sort((left, right) => right.estimatedWastedMs - left.estimatedWastedMs);
}

export function findDuplicateFilesystemScans(
  profiles: readonly PipelineStepResourceProfile[],
  durations: StepDurationMap,
): readonly DuplicateFilesystemScan[] {
  const scanners = new Map<string, string[]>();

  for (const profile of profiles) {
    for (const scan of profile.directoryScans) {
      const key = `${normalizePath(scan.rootPath)}::${scan.recursive ? "recursive" : "shallow"}`;
      const existing = scanners.get(key) ?? [];
      existing.push(profile.stepId);
      scanners.set(key, existing);
    }
  }

  return [...scanners.entries()]
    .filter(([, stepIds]) => stepIds.length > 1)
    .map(([key, scanningStepIds]) => {
      const [rootPath] = key.split("::");
      const wastedMs = scanningStepIds
        .slice(1)
        .reduce((sum, stepId) => {
          const duration = durations.get(stepId) ?? 0;
          const profile = profiles.find((entry) => entry.stepId === stepId);
          const scanShare = profile
            ? duration * profile.ioBoundShare / Math.max(1, profile.directoryScans.length)
            : 0;
          return sum + scanShare * DUPLICATE_SCAN_SAVINGS_SHARE;
        }, 0);

      return {
        rootPath,
        scanningStepIds,
        scanCount: scanningStepIds.length,
        estimatedWastedMs: Math.round(wastedMs),
        recommendation:
          "Cache directory listings and stat metadata between steps that scan the same tree.",
      };
    })
    .sort((left, right) => right.estimatedWastedMs - left.estimatedWastedMs);
}

export function findCacheOpportunities(
  stepDefinitions: readonly FullResearchStepDefinition[],
  profiles: readonly PipelineStepResourceProfile[],
  durations: StepDurationMap,
  artifactIndex: ResearchArtifactIndex | null,
): readonly CacheOpportunity[] {
  if (!artifactIndex) {
    return [];
  }

  const artifactByPath = new Map(
    artifactIndex.artifacts.map((artifact) => [normalizePath(artifact.path), artifact]),
  );

  const opportunities: CacheOpportunity[] = [];

  for (const step of stepDefinitions) {
    const profile = profiles.find((entry) => entry.stepId === step.id);
    if (!profile || profile.filesRead.length === 0) {
      continue;
    }

    const inputArtifacts = profile.filesRead.map(normalizePath);
    const allPresent = inputArtifacts.every((path) => {
      const artifact = artifactByPath.get(path);
      return artifact?.status === "present";
    });

    if (!allPresent) {
      continue;
    }

    const duration = durations.get(step.id) ?? 0;
    if (duration <= 0) {
      continue;
    }

    opportunities.push({
      stepId: step.id,
      inputArtifacts,
      outputArtifacts: profile.filesWritten.map(normalizePath),
      estimatedSavingsMs: Math.round(duration * 0.85),
      rationale:
        "All declared inputs are present and unchanged; step output could be skipped when input hashes match a prior run.",
    });
  }

  return opportunities.sort((left, right) => right.estimatedSavingsMs - left.estimatedSavingsMs);
}

export function findIncrementalRebuildOpportunities(
  profiles: readonly PipelineStepResourceProfile[],
  durations: StepDurationMap,
): readonly IncrementalRebuildOpportunity[] {
  return profiles
    .filter((profile) => profile.fullDirectoryRecompute)
    .map((profile) => {
      const duration = durations.get(profile.stepId) ?? 0;
      return {
        stepId: profile.stepId,
        scannedRoots: profile.directoryScans.map((scan) => scan.rootPath),
        estimatedSavingsMs: Math.round(duration * INCREMENTAL_REBUILD_SAVINGS_SHARE),
        rationale:
          "Step rescans entire directory trees; incremental processing of changed artifacts only would reduce I/O.",
      };
    })
    .filter((entry) => entry.estimatedSavingsMs > 0)
    .sort((left, right) => right.estimatedSavingsMs - left.estimatedSavingsMs);
}

export function findNetworkBottlenecks(
  profiles: readonly PipelineStepResourceProfile[],
  durations: StepDurationMap,
): readonly NetworkBottleneck[] {
  return profiles
    .filter((profile) => profile.networkOperations.length > 0)
    .map((profile) => {
      const duration = durations.get(profile.stepId) ?? 0;
      const networkShare = profile.networkOperations.reduce(
        (sum, operation) => sum + operation.estimatedShare,
        0,
      );
      const clampedShare = Math.min(1, networkShare);
      const estimatedNetworkMs = Math.round(duration * clampedShare);
      const estimatedLocalMs = Math.max(0, duration - estimatedNetworkMs);

      return {
        stepId: profile.stepId,
        operations: profile.networkOperations,
        estimatedNetworkMs,
        estimatedLocalMs,
        recommendation:
          "Separate remote API latency from local compute; batch or cache discovery responses where safe.",
      };
    })
    .sort((left, right) => right.estimatedNetworkMs - left.estimatedNetworkMs);
}

export function findMemoryObservations(
  profiles: readonly PipelineStepResourceProfile[],
  artifactIndex: ResearchArtifactIndex | null,
): readonly MemoryObservation[] {
  if (!artifactIndex) {
    return profiles.flatMap((profile) =>
      profile.largeJsonInputs.map((artifactPath) => ({
        stepId: profile.stepId,
        artifactPath,
        fileSizeBytes: null,
        estimatedDeserializeMs: 0,
        recommendation:
          "Large JSON artifact is deserialized per step; consider streaming or shared parsed cache.",
      })),
    );
  }

  const sizeByPath = new Map(
    artifactIndex.artifacts.map((artifact) => [normalizePath(artifact.path), artifact.fileSizeBytes]),
  );

  const observations: MemoryObservation[] = [];

  for (const profile of profiles) {
    for (const artifactPath of profile.largeJsonInputs) {
      const normalized = normalizePath(artifactPath);
      const fileSizeBytes = sizeByPath.get(normalized) ?? null;
      const estimatedDeserializeMs =
        fileSizeBytes !== null && fileSizeBytes >= LARGE_JSON_THRESHOLD_BYTES
          ? Math.round((fileSizeBytes / (1024 * 1024)) * DESERIALIZE_MS_PER_MB)
          : 0;

      observations.push({
        stepId: profile.stepId,
        artifactPath: normalized,
        fileSizeBytes,
        estimatedDeserializeMs,
        recommendation:
          fileSizeBytes !== null && fileSizeBytes >= LARGE_JSON_THRESHOLD_BYTES
            ? "Repeated deserialization of a large JSON artifact; retain parsed object in a shared session cache."
            : "Artifact size below large-json threshold; memory pressure is likely moderate.",
      });
    }
  }

  return observations.sort((left, right) => right.estimatedDeserializeMs - left.estimatedDeserializeMs);
}

export function computeCriticalPath(
  stepDefinitions: readonly FullResearchStepDefinition[],
  durations: StepDurationMap,
): CriticalPathAnalysis {
  const stepIds = stepDefinitions.map((step) => step.id);
  const upstreamByStep = new Map(
    stepDefinitions.map((step) => [step.id, step.upstreamStepIds]),
  );

  const memo = new Map<string, { totalMs: number; path: string[] }>();

  function longestFrom(stepId: string): { totalMs: number; path: string[] } {
    const cached = memo.get(stepId);
    if (cached) {
      return cached;
    }

    const duration = durations.get(stepId) ?? 0;
    const upstream = upstreamByStep.get(stepId) ?? [];

    if (upstream.length === 0) {
      const result = { totalMs: duration, path: [stepId] };
      memo.set(stepId, result);
      return result;
    }

    const bestUpstream = upstream
      .map((upstreamId) => longestFrom(upstreamId))
      .sort((left, right) => right.totalMs - left.totalMs)[0]!;

    const result = {
      totalMs: bestUpstream.totalMs + duration,
      path: [...bestUpstream.path, stepId],
    };
    memo.set(stepId, result);
    return result;
  }

  const candidates = stepIds.map((stepId) => longestFrom(stepId));
  const best = candidates.sort((left, right) => right.totalMs - left.totalMs)[0] ?? {
    totalMs: 0,
    path: [],
  };

  let cumulative = 0;
  const steps: CriticalPathStep[] = best.path.map((stepId) => {
    const durationMs = durations.get(stepId) ?? 0;
    cumulative += durationMs;
    return { stepId, durationMs, cumulativeMs: cumulative };
  });

  return {
    stepIds: best.path,
    totalDurationMs: best.totalMs,
    steps,
  };
}

export function buildDownstreamMap(
  stepDefinitions: readonly FullResearchStepDefinition[],
): ReadonlyMap<string, readonly string[]> {
  const upstreamByStep = new Map(
    stepDefinitions.map((step) => [step.id, step.upstreamStepIds]),
  );
  return buildDownstreamDependents(
    stepDefinitions.map((step) => step.id),
    upstreamByStep,
  );
}

export function rankOptimizationOpportunities(input: {
  parallelGroups: readonly ParallelExecutionGroup[];
  duplicateLoads: readonly DuplicateArtifactLoad[];
  duplicateScans: readonly DuplicateFilesystemScan[];
  cacheOpportunities: readonly CacheOpportunity[];
  incrementalRebuilds: readonly IncrementalRebuildOpportunity[];
  networkBottlenecks: readonly NetworkBottleneck[];
  memoryObservations: readonly MemoryObservation[];
  criticalPath: CriticalPathAnalysis;
}): readonly OptimizationOpportunity[] {
  const raw: Omit<OptimizationOpportunity, "rank">[] = [];

  for (const group of input.parallelGroups.slice(0, 5)) {
    raw.push({
      category: "parallel-execution",
      title: `Parallelize ${group.stepIds.join(", ")}`,
      description: group.rationale,
      estimatedSavingsMs: group.estimatedSavingsMs,
      affectedStepIds: group.stepIds,
    });
  }

  for (const entry of input.duplicateLoads.slice(0, 5)) {
    raw.push({
      category: "duplicate-loading",
      title: `Deduplicate reads of ${entry.artifactPath}`,
      description: entry.recommendation,
      estimatedSavingsMs: entry.estimatedWastedMs,
      affectedStepIds: entry.readingStepIds,
    });
  }

  for (const entry of input.duplicateScans.slice(0, 5)) {
    raw.push({
      category: "duplicate-scan",
      title: `Deduplicate scans of ${entry.rootPath}`,
      description: entry.recommendation,
      estimatedSavingsMs: entry.estimatedWastedMs,
      affectedStepIds: entry.scanningStepIds,
    });
  }

  for (const entry of input.cacheOpportunities.slice(0, 5)) {
    raw.push({
      category: "cache",
      title: `Skip ${entry.stepId} when inputs unchanged`,
      description: entry.rationale,
      estimatedSavingsMs: entry.estimatedSavingsMs,
      affectedStepIds: [entry.stepId],
    });
  }

  for (const entry of input.incrementalRebuilds.slice(0, 5)) {
    raw.push({
      category: "incremental-rebuild",
      title: `Incremental rebuild for ${entry.stepId}`,
      description: entry.rationale,
      estimatedSavingsMs: entry.estimatedSavingsMs,
      affectedStepIds: [entry.stepId],
    });
  }

  for (const entry of input.networkBottlenecks.slice(0, 3)) {
    raw.push({
      category: "network",
      title: `Reduce network time in ${entry.stepId}`,
      description: entry.recommendation,
      estimatedSavingsMs: Math.round(entry.estimatedNetworkMs * 0.3),
      affectedStepIds: [entry.stepId],
    });
  }

  for (const entry of input.memoryObservations.slice(0, 3)) {
    raw.push({
      category: "memory",
      title: `Cache parsed JSON for ${entry.artifactPath}`,
      description: entry.recommendation,
      estimatedSavingsMs: entry.estimatedDeserializeMs,
      affectedStepIds: [entry.stepId],
    });
  }

  if (input.criticalPath.stepIds.length > 0) {
    raw.push({
      category: "critical-path",
      title: `Optimize critical path (${input.criticalPath.stepIds.join(" → ")})`,
      description:
        "Longest dependency chain dominates minimum runtime even with perfect parallel scheduling elsewhere.",
      estimatedSavingsMs: 0,
      affectedStepIds: input.criticalPath.stepIds,
    });
  }

  return raw
    .sort((left, right) => right.estimatedSavingsMs - left.estimatedSavingsMs)
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function estimateParallelRuntimeMs(
  stepDefinitions: readonly FullResearchStepDefinition[],
  durations: StepDurationMap,
): number {
  return computeSchedule(stepDefinitions, durations).parallelRuntimeMs;
}

export function resolveArtifactSizeBytes(
  path: string,
  artifactIndex: ResearchArtifactIndex | null,
): number | null {
  if (!artifactIndex) {
    return null;
  }

  const normalized = normalizePath(path);
  const match = artifactIndex.artifacts.find((artifact) => normalizePath(artifact.path) === normalized);
  return match?.fileSizeBytes ?? null;
}
