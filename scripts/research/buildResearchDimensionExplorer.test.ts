import { describe, expect, it } from "vitest";

import { runResearchDimensionExplorerCommand } from "./buildResearchDimensionExplorer";
import { DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS } from "@/lib/data/research/researchDimensionExplorer";
import {
  listResearchAxisGroups,
  RESEARCH_DIMENSIONS,
} from "@/lib/data/research/dimensions";

const GENERATED_AT = "2026-07-07T21:00:00.000Z";
const OUTPUT_PATH = "data/research-results/research-dimension-explorer.json";
const HTML_PATH = "data/reports/research-dimension-explorer.html";

describe("runResearchDimensionExplorerCommand", () => {
  it("writes explorer json and html outputs", () => {
    const files: Record<string, string> = {};
    let stdout = "";

    const exitCode = runResearchDimensionExplorerCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => undefined,
        writeFile: (path, data) => {
          files[path] = data;
        },
        mkdirSync: () => undefined,
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(files[OUTPUT_PATH]).toBeDefined();
    expect(files[HTML_PATH]).toContain("Research Dimension Explorer");
    const stdoutPayload = JSON.parse(stdout);
    expect(stdoutPayload.dimensionCount).toBe(RESEARCH_DIMENSIONS.length);
    expect(stdoutPayload.axisGroupCount).toBe(listResearchAxisGroups().length);
    expect(DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.mispricingAtlasPath).toContain(
      "mispricing-atlas.json",
    );
  });
});
