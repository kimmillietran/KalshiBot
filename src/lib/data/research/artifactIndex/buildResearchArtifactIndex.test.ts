import { describe, expect, it } from "vitest";

import {
  buildResearchArtifactIndex,
  buildResearchArtifactCatalog,
  buildDownstreamConsumerMap,
  parseResearchArtifactIndexConfigFromArgv,
  serializeResearchArtifactIndex,
  serializeResearchArtifactIndexHtml,
} from "./index";
import type { ArtifactIndexIo } from "./researchArtifactIndexTypes";

const GENERATED_AT = "2026-07-03T20:00:00.000Z";
const DEFAULT_CONFIG = parseResearchArtifactIndexConfigFromArgv([]);

function createIo(
  overrides: Partial<ArtifactIndexIo> & {
    files?: Record<string, { content?: string; mtimeMs: number; size?: number }>;
    directories?: readonly string[];
    collections?: Record<string, Record<string, { mtimeMs: number; size: number }>>;
  } = {},
): ArtifactIndexIo {
  const files = overrides.files ?? {};
  const directories = new Set(overrides.directories ?? []);
  const collections = overrides.collections ?? {};

  return {
    readdir: () => [],
    readFile: (path) => files[path]?.content ?? "{}",
    fileExists: (path) => path in files,
    isDirectory: (path) => directories.has(path),
    getModifiedTimeMs: (path) => files[path]?.mtimeMs ?? null,
    getFileSizeBytes: (path) => files[path]?.size ?? null,
    countFilesNamedUnder: (root, fileName) => {
      const collection = collections[root];
      if (!collection) {
        return 0;
      }

      return Object.entries(collection).filter(([name]) =>
        fileName === "" || name === fileName,
      ).length;
    },
    sumFileSizesNamedUnder: (root, fileName) => {
      const collection = collections[root];
      if (!collection) {
        return 0;
      }

      return Object.entries(collection)
        .filter(([name]) => fileName === "" || name === fileName)
        .reduce((total, [, meta]) => total + meta.size, 0);
    },
    maxModifiedTimeMsNamedUnder: (root, fileName) => {
      const collection = collections[root];
      if (!collection) {
        return null;
      }

      const mtimes = Object.entries(collection)
        .filter(([name]) => fileName === "" || name === fileName)
        .map(([, meta]) => meta.mtimeMs);

      return mtimes.length > 0 ? Math.max(...mtimes) : null;
    },
    ...overrides,
  };
}

describe("buildResearchArtifactCatalog", () => {
  it("includes hypothesis dependencies and downstream consumers", () => {
    const catalog = buildResearchArtifactCatalog(DEFAULT_CONFIG);
    const downstream = buildDownstreamConsumerMap(catalog);
    const hypotheses = catalog.find((entry) => entry.artifactId === "hypothesis-candidates");

    expect(hypotheses?.upstreamArtifactIds).toEqual([
      "mispricing-atlas",
      "lead-lag-analysis",
      "statistical-significance",
    ]);
    expect(downstream.get("mispricing-atlas")).toContain("hypothesis-candidates");
  });
});

describe("buildResearchArtifactIndex", () => {
  it("marks missing artifacts as missing", () => {
    const index = buildResearchArtifactIndex({
      generatedAt: GENERATED_AT,
      config: DEFAULT_CONFIG,
      io: createIo(),
    });

    const mispricing = index.artifacts.find((artifact) => artifact.artifactId === "mispricing-atlas");
    expect(mispricing?.status).toBe("missing");
    expect(index.summary.missingCount).toBeGreaterThan(0);
  });

  it("marks present artifacts with generated timestamps from JSON", () => {
    const path = "data/research-results/mispricing-atlas.json";
    const index = buildResearchArtifactIndex({
      generatedAt: GENERATED_AT,
      config: DEFAULT_CONFIG,
      io: createIo({
        files: {
          [path]: {
            content: JSON.stringify({ generatedAt: "2026-07-03T18:00:00.000Z" }),
            mtimeMs: 100,
            size: 512,
          },
        },
        collections: {
          "data/research-results": {
            "research-output.json": { mtimeMs: 50, size: 100 },
          },
        },
      }),
    });

    const mispricing = index.artifacts.find((artifact) => artifact.artifactId === "mispricing-atlas");
    expect(mispricing?.status).toBe("present");
    expect(mispricing?.generatedTimestamp).toBe("2026-07-03T18:00:00.000Z");
    expect(mispricing?.fileSizeBytes).toBe(512);
  });

  it("marks stale artifacts when upstream inputs are newer", () => {
    const mispricingPath = "data/research-results/mispricing-atlas.json";
    const leadLagPath = "data/research-results/lead-lag-analysis.json";
    const significancePath = "data/research-results/statistical-significance.json";
    const hypothesesPath = "data/research-results/hypothesis-candidates.json";

    const index = buildResearchArtifactIndex({
      generatedAt: GENERATED_AT,
      config: DEFAULT_CONFIG,
      io: createIo({
        files: {
          [mispricingPath]: {
            content: JSON.stringify({ generatedAt: "2026-07-03T20:00:00.000Z" }),
            mtimeMs: 3000,
            size: 100,
          },
          [leadLagPath]: {
            content: JSON.stringify({ generatedAt: "2026-07-03T19:00:00.000Z" }),
            mtimeMs: 2000,
            size: 100,
          },
          [significancePath]: {
            content: JSON.stringify({ generatedAt: "2026-07-03T19:00:00.000Z" }),
            mtimeMs: 2000,
            size: 100,
          },
          [hypothesesPath]: {
            content: JSON.stringify({ generatedAt: "2026-07-03T18:00:00.000Z" }),
            mtimeMs: 1000,
            size: 100,
          },
        },
        collections: {
          "data/research-results": {
            "research-output.json": { mtimeMs: 500, size: 100 },
            "aggregate-summary.json": { mtimeMs: 500, size: 100 },
          },
        },
      }),
    });

    const hypotheses = index.artifacts.find((artifact) => artifact.artifactId === "hypothesis-candidates");
    expect(hypotheses?.status).toBe("stale");
    expect(hypotheses?.downstreamConsumers).toContain("hypothesis-evidence-html");
  });

  it("serializes deterministically and renders HTML", () => {
    const index = buildResearchArtifactIndex({
      generatedAt: GENERATED_AT,
      config: DEFAULT_CONFIG,
      io: createIo(),
    });

    const first = serializeResearchArtifactIndex(index);
    const second = serializeResearchArtifactIndex(index);
    const html = serializeResearchArtifactIndexHtml(index);

    expect(first).toBe(second);
    expect(html).toContain("Research Artifact Index");
    expect(html).toContain("mispricing-atlas");
  });
});
