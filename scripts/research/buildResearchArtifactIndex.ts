import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  buildResearchArtifactIndex,
  createNodeArtifactIndexIo,
  parseResearchArtifactIndexConfigFromArgv,
  serializeResearchArtifactIndex,
  serializeResearchArtifactIndexHtml,
} from "@/lib/data/research/artifactIndex";

import { normalizeResearchArtifactIndexArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildResearchArtifactIndexTypes";
import type { ResearchArtifactIndexCommandIo } from "./buildResearchArtifactIndexTypes";

export function runResearchArtifactIndexCommand(
  argv: readonly string[],
  io: ResearchArtifactIndexCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchArtifactIndexArgv(argv);
    const config = parseResearchArtifactIndexConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const artifactIo = io.artifactIo ?? createNodeArtifactIndexIo();

    const index = buildResearchArtifactIndex({
      generatedAt,
      config,
      io: artifactIo,
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeResearchArtifactIndex(index));
    io.writeFile(config.htmlOutputPath, serializeResearchArtifactIndexHtml(index));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: config.outputPath,
          htmlOutputPath: config.htmlOutputPath,
          totalArtifacts: index.summary.totalArtifacts,
          presentCount: index.summary.presentCount,
          staleCount: index.summary.staleCount,
          missingCount: index.summary.missingCount,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runResearchArtifactIndexCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  mapCommandError,
  ResearchArtifactIndexCommandError,
} from "./buildResearchArtifactIndexTypes";
