import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import {
  buildExpansionBatchPlan,
  serializeExpansionBatchPlan,
  serializeExpansionBatchPlanHtml,
} from "@/lib/data/research/expansionBatchPlanner";

import { normalizePlanExpansionBatchArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parsePlanExpansionBatchConfigFromArgv,
} from "./planExpansionBatchTypes";
import type { PlanExpansionBatchCommandIo } from "./planExpansionBatchTypes";

export function runPlanExpansionBatchCommand(
  argv: readonly string[],
  io: PlanExpansionBatchCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizePlanExpansionBatchArgv(argv);
    const config = parsePlanExpansionBatchConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const plan = buildExpansionBatchPlan({
      generatedAt,
      config,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
        listDir: io.listDir,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeExpansionBatchPlan(plan));
    io.writeFile(config.htmlOutputPath, serializeExpansionBatchPlanHtml(plan));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: plan.outputPath,
          htmlOutputPath: plan.htmlOutputPath,
          maxMarkets: plan.maxMarkets,
          totalAllocatedMarkets: plan.summary.totalAllocatedMarkets,
          allocationCount: plan.summary.allocationCount,
          scheduledJobCount: plan.summary.scheduledJobCount,
          selectionStrategy: plan.selectionStrategy,
          rejectedUnsupportedHeavyAllocationCount:
            plan.summary.rejectedUnsupportedHeavyAllocationCount,
          rejectedZeroPriorityAllocationCount:
            plan.summary.rejectedZeroPriorityAllocationCount,
          rejectedAlreadyCoveredAllocationCount:
            plan.summary.rejectedAlreadyCoveredAllocationCount,
          knownCandidateMonths: plan.discoveryUniverse.knownCandidateMonths.length,
          discoveredEmptyMonths: plan.discoveryUniverse.discoveredEmptyMonths.length,
          emptyDiscoveryCount: plan.discoveryUniverse.emptyDiscoveryCount,
          undiscoveredCandidateMonths: plan.discoveryUniverse.undiscoveredCandidateMonths.length,
          discoveryFrontierMonths: plan.discoveryUniverse.discoveryFrontierMonths.length,
          staleDiscoveryMonths: plan.discoveryUniverse.staleDiscoveryMonths.length,
          plannerExhausted: plan.discoveryUniverse.plannerExhausted,
          universeComplete: plan.discoveryUniverse.universeComplete,
          universeIncomplete: plan.discoveryUniverse.universeIncomplete,
          exhaustionReason: plan.discoveryUniverse.exhaustionReason,
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
  const exitCode = runPlanExpansionBatchCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    listDir: (path) => readdirSync(path),
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
