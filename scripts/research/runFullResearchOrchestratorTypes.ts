import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export class FullResearchOrchestratorCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FullResearchOrchestratorCommandError";
  }
}

export type FullResearchOrchestratorCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
  runner?: import("@/lib/data/research/pipeline").ResearchPipelineRunner;
  registeredNpmScripts?: ReadonlySet<string>;
};

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof FullResearchOrchestratorCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Full research orchestrator failed";
}

export function loadRegisteredNpmScriptsFromPackageJson(): ReadonlySet<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(moduleDir, "..", "..", "package.json");
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  return new Set(Object.keys(parsed.scripts ?? {}));
}
