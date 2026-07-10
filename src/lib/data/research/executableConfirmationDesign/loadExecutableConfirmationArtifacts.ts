import { z } from "zod";

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
    || classification.includes("candidate")
    || episode.requiresExecutableConfirmation === true;

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
}): {
  artifacts: LoadedExecutableConfirmationArtifacts;
  staticParityScanPresent: boolean;
  bidOnlyCandidateLifecyclePresent: boolean;
} {
  const config = input.config ?? DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG;
  const staticParityCandidates: AssessedConfirmationCandidate[] = [];
  const lifecycleCandidates: AssessedConfirmationCandidate[] = [];

  let staticParityScanPresent = false;
  let bidOnlyCandidateLifecyclePresent = false;
  let forwardCaptureReadinessPresent = false;

  if (input.io.fileExists(input.inputPaths.staticParityScanPath)) {
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

  if (input.io.fileExists(input.inputPaths.bidOnlyCandidateLifecyclePath)) {
    bidOnlyCandidateLifecyclePresent = true;
    const lifecycle = safeParseJson(
      input.io.readFile(input.inputPaths.bidOnlyCandidateLifecyclePath),
      lifecycleReportSchema,
    );

    if (lifecycle) {
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
      forwardCaptureReadinessPresent,
    },
    staticParityScanPresent,
    bidOnlyCandidateLifecyclePresent,
  };
}
