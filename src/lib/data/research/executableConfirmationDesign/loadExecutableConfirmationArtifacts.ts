import { z } from "zod";

import { validateInputArtifacts } from "../downstreamAnalysisScope/validateInputArtifacts";
import type { StaticParityScanReport } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

import {
  mapStaticParityCandidate,
  type AssessedConfirmationCandidate,
  type LoadedExecutableConfirmationArtifacts,
} from "./evaluateExecutableConfirmationReadiness";
import {
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG,
  type ExecutableConfirmationDesignConfig,
  type ExecutableConfirmationDesignInputPaths,
  type ExecutableConfirmationDesignIo,
} from "./executableConfirmationDesignTypes";

const lifecycleEpisodeSchema = z
  .object({
    episodeId: z.string().optional(),
    runId: z.string().optional(),
    marketTicker: z.string(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    episodeClassification: z.string().optional(),
    minBidSizeContracts: z.number().nullable().optional(),
    maxBidOnlyEdgeCents: z.number().nullable().optional(),
    firstBidSumCents: z.number().nullable().optional(),
    requiresExecutableConfirmation: z.boolean().optional(),
  })
  .passthrough();

const lifecycleReportSchema = z
  .object({
    episodes: z.array(lifecycleEpisodeSchema).optional(),
    config: z
      .object({
        feeBufferCents: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function safeParseJson<T>(
  content: string,
  schema: z.ZodType<T>,
): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseStaticParityScanReport(content: string): StaticParityScanReport | null {
  try {
    return JSON.parse(content) as StaticParityScanReport;
  } catch {
    return null;
  }
}

function mapLifecycleEpisode(
  episode: z.infer<typeof lifecycleEpisodeSchema>,
  index: number,
  feeBufferCents: number,
): AssessedConfirmationCandidate | null {
  const classification = episode.episodeClassification ?? "";
  const isCandidate =
    classification === "needs-executable-confirmation"
    || classification === "gross-candidate-episode"
    || classification === "buffer-adjusted-candidate-episode"
    || classification === "persistent-candidate-episode"
    || (
      episode.requiresExecutableConfirmation === true
      && classification !== "no-candidate"
      && classification !== "too-brief"
      && classification !== "insufficient-depth"
    );

  if (!isCandidate) {
    return null;
  }

  const timestamp = episode.startedAt ?? episode.endedAt ?? "";
  const bidSum = episode.firstBidSumCents ?? null;

  return {
    candidateId: episode.episodeId ?? `${episode.runId ?? "lifecycle"}:${episode.marketTicker}:${index}`,
    timestamp,
    marketTicker: episode.marketTicker,
    sourceArtifact: "bid-only-candidate-lifecycle",
    yesBidCents: null,
    noBidCents: null,
    yesBidSize: episode.minBidSizeContracts ?? null,
    noBidSize: episode.minBidSizeContracts ?? null,
    bidSumCents: bidSum,
    bidOnlyEdgeCents: episode.maxBidOnlyEdgeCents ?? null,
    minBidSizeContracts: episode.minBidSizeContracts ?? null,
    feeBufferCents,
    receivedAtMs: timestamp ? Date.parse(timestamp) : null,
    requiresExecutableConfirmation: episode.requiresExecutableConfirmation ?? true,
  };
}

/** Loads optional upstream artifacts without failing when files are absent. */
export function loadExecutableConfirmationArtifacts(input: {
  inputPaths: ExecutableConfirmationDesignInputPaths;
  config?: ExecutableConfirmationDesignConfig;
  io: ExecutableConfirmationDesignIo;
  evaluatedAt?: string;
}): {
  artifacts: LoadedExecutableConfirmationArtifacts;
  staticParityScanPresent: boolean;
  bidOnlyCandidateLifecyclePresent: boolean;
} {
  const config = input.config ?? DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG;
  const staticParityCandidates: AssessedConfirmationCandidate[] = [];
  const lifecycleCandidates: AssessedConfirmationCandidate[] = [];
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const selection = {
    analysisScope: input.inputPaths.captureRunDir ? "selected-run" as const : "aggregate" as const,
    forwardQuotesDir: "data/live-capture/forward-quotes",
    captureRunDir: input.inputPaths.captureRunDir,
    selectedRunId: input.inputPaths.captureRunDir
      ? input.inputPaths.captureRunDir.split("/").pop() ?? null
      : null,
  };

  let staticParityScanPresent = false;
  let bidOnlyCandidateLifecyclePresent = false;
  let forwardCaptureReadinessPresent = false;
  let lifecycleEpisodeCount = 0;

  const artifactValidation = selection.analysisScope === "selected-run"
    ? validateInputArtifacts({
      io: input.io,
      selection,
      artifactPaths: [
        input.inputPaths.staticParityScanPath,
        input.inputPaths.bidOnlyCandidateLifecyclePath,
      ].filter((path) => input.io.fileExists(path)),
      evaluatedAt,
      requireIdentityInSelectedRun: true,
    })
    : null;

  if (
    input.io.fileExists(input.inputPaths.staticParityScanPath)
    && (
      !artifactValidation
      || artifactValidation.usablePaths.includes(input.inputPaths.staticParityScanPath)
    )
  ) {
    staticParityScanPresent = true;
    const report = parseStaticParityScanReport(
      input.io.readFile(input.inputPaths.staticParityScanPath),
    );

    if (report) {
      const feeBuffer = report.friction?.feeBufferCents ?? config.feeBufferCents;
      report.candidateSamples.forEach((sample, index) => {
        const mapped = mapStaticParityCandidate(sample, index, feeBuffer);
        if (mapped) {
          staticParityCandidates.push(mapped);
        }
      });
    }
  }

  if (
    input.io.fileExists(input.inputPaths.bidOnlyCandidateLifecyclePath)
    && (
      !artifactValidation
      || artifactValidation.usablePaths.includes(input.inputPaths.bidOnlyCandidateLifecyclePath)
    )
  ) {
    bidOnlyCandidateLifecyclePresent = true;
    const lifecycle = safeParseJson(
      input.io.readFile(input.inputPaths.bidOnlyCandidateLifecyclePath),
      lifecycleReportSchema,
    );

    if (lifecycle) {
      lifecycleEpisodeCount = lifecycle.episodes?.length ?? 0;
      const feeBuffer = lifecycle.config?.feeBufferCents ?? config.feeBufferCents;
      lifecycle.episodes?.forEach((episode, index) => {
        const mapped = mapLifecycleEpisode(episode, index, feeBuffer);
        if (mapped) {
          lifecycleCandidates.push(mapped);
        }
      });
    }
  }

  if (input.io.fileExists(input.inputPaths.forwardCaptureReadinessPath)) {
    forwardCaptureReadinessPresent = true;
  }

  return {
    artifacts: {
      staticParityCandidates,
      lifecycleCandidates,
      lifecycleEpisodeCount,
      forwardCaptureReadinessPresent,
      artifactValidation,
    },
    staticParityScanPresent,
    bidOnlyCandidateLifecyclePresent,
  };
}
