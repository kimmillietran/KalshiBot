import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildDownstreamConsumerMap,
  buildResearchArtifactCatalog,
} from "./researchArtifactCatalog";
import type {
  ArtifactIndexIo,
  BuildResearchArtifactIndexInput,
  ResearchArtifactCatalogEntry,
  ResearchArtifactIndex,
  ResearchArtifactIndexEntry,
  ResearchArtifactIndexSummary,
  ResearchArtifactStatus,
} from "./researchArtifactIndexTypes";

type ScannedArtifact = {
  present: boolean;
  generatedTimestamp: string | null;
  referenceTimeMs: number | null;
  fileSizeBytes: number | null;
  itemCount: number | null;
};

function readGeneratedTimestamp(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === "string" && parsed.generatedAt.trim().length > 0
      ? parsed.generatedAt
      : null;
  } catch {
    return null;
  }
}

function toIsoTimestamp(timeMs: number | null): string | null {
  if (timeMs === null) {
    return null;
  }

  return new Date(timeMs).toISOString();
}

function scanFileArtifact(path: string, io: ArtifactIndexIo): ScannedArtifact {
  if (!io.fileExists(path)) {
    return {
      present: false,
      generatedTimestamp: null,
      referenceTimeMs: null,
      fileSizeBytes: null,
      itemCount: null,
    };
  }

  const modifiedTimeMs = io.getModifiedTimeMs(path);
  const generatedTimestamp = path.endsWith(".json")
    ? readGeneratedTimestamp(io.readFile(path))
    : null;

  return {
    present: true,
    generatedTimestamp: generatedTimestamp ?? toIsoTimestamp(modifiedTimeMs),
    referenceTimeMs: generatedTimestamp
      ? Date.parse(generatedTimestamp)
      : modifiedTimeMs,
    fileSizeBytes: io.getFileSizeBytes(path),
    itemCount: null,
  };
}

function scanDirectoryArtifact(path: string, io: ArtifactIndexIo): ScannedArtifact {
  if (!io.isDirectory(path)) {
    return {
      present: false,
      generatedTimestamp: null,
      referenceTimeMs: null,
      fileSizeBytes: null,
      itemCount: 0,
    };
  }

  const itemCount = io.countFilesNamedUnder(path, "");
  const referenceTimeMs = io.maxModifiedTimeMsNamedUnder(path, "");

  return {
    present: itemCount > 0,
    generatedTimestamp: toIsoTimestamp(referenceTimeMs),
    referenceTimeMs,
    fileSizeBytes: null,
    itemCount,
  };
}

function scanCollectionArtifact(
  entry: ResearchArtifactCatalogEntry,
  io: ArtifactIndexIo,
): ScannedArtifact {
  const fileName = entry.fileName ?? "";
  const itemCount = io.countFilesNamedUnder(entry.path, fileName);

  if (itemCount === 0) {
    return {
      present: false,
      generatedTimestamp: null,
      referenceTimeMs: null,
      fileSizeBytes: null,
      itemCount: 0,
    };
  }

  const referenceTimeMs = io.maxModifiedTimeMsNamedUnder(entry.path, fileName);

  return {
    present: true,
    generatedTimestamp: toIsoTimestamp(referenceTimeMs),
    referenceTimeMs,
    fileSizeBytes: io.sumFileSizesNamedUnder(entry.path, fileName),
    itemCount,
  };
}

function scanCatalogEntry(
  entry: ResearchArtifactCatalogEntry,
  io: ArtifactIndexIo,
): ScannedArtifact {
  switch (entry.kind) {
    case "file":
      return scanFileArtifact(entry.path, io);
    case "directory":
      return scanDirectoryArtifact(entry.path, io);
    case "file-collection":
      return scanCollectionArtifact(entry, io);
    default:
      return {
        present: false,
        generatedTimestamp: null,
        referenceTimeMs: null,
        fileSizeBytes: null,
        itemCount: null,
      };
  }
}

function deriveStatus(
  scanned: ScannedArtifact,
  upstreamReferenceTimesMs: readonly number[],
): ResearchArtifactStatus {
  if (!scanned.present) {
    return "missing";
  }

  if (scanned.referenceTimeMs === null) {
    return "present";
  }

  const isStale = upstreamReferenceTimesMs.some(
    (upstreamTime) => upstreamTime > scanned.referenceTimeMs!,
  );

  return isStale ? "stale" : "present";
}

function buildSummary(
  artifacts: readonly ResearchArtifactIndexEntry[],
): ResearchArtifactIndexSummary {
  return {
    totalArtifacts: artifacts.length,
    presentCount: artifacts.filter((artifact) => artifact.status === "present").length,
    staleCount: artifacts.filter((artifact) => artifact.status === "stale").length,
    missingCount: artifacts.filter((artifact) => artifact.status === "missing").length,
  };
}

/** Builds a deterministic research artifact index from existing outputs. */
export function buildResearchArtifactIndex(
  input: BuildResearchArtifactIndexInput,
): ResearchArtifactIndex {
  const catalog = buildResearchArtifactCatalog(input.config);
  const downstreamMap = buildDownstreamConsumerMap(catalog);
  const scannedById = new Map<string, ScannedArtifact>();

  for (const entry of catalog) {
    scannedById.set(entry.artifactId, scanCatalogEntry(entry, input.io));
  }

  const artifacts: ResearchArtifactIndexEntry[] = catalog.map((entry) => {
    const scanned = scannedById.get(entry.artifactId)!;
    const upstreamReferenceTimesMs = entry.upstreamArtifactIds
      .map((artifactId) => scannedById.get(artifactId))
      .filter((value): value is ScannedArtifact => value !== undefined && value.present)
      .map((value) => value.referenceTimeMs)
      .filter((value): value is number => value !== null);

    return {
      artifactId: entry.artifactId,
      name: entry.name,
      path: entry.path,
      generatedTimestamp: scanned.generatedTimestamp,
      producingPipelineStep: entry.producingPipelineStep,
      upstreamDependencies: [...entry.upstreamArtifactIds],
      downstreamConsumers: downstreamMap.get(entry.artifactId) ?? [],
      fileSizeBytes: scanned.fileSizeBytes,
      itemCount: scanned.itemCount,
      status: deriveStatus(scanned, upstreamReferenceTimesMs),
    };
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    config: input.config,
    summary: buildSummary(artifacts),
    artifacts,
  };
}

export function serializeResearchArtifactIndex(index: ResearchArtifactIndex): string {
  return stableStringify(index);
}
