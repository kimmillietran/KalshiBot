import type { ExpansionExecutionSummary, ShellCommandRunner } from "./officialMonthExpansionRefreshTypes";

export function createEmptyExpansionExecution(): ExpansionExecutionSummary {
  return {
    attempted: false,
    succeeded: true,
    importExecuted: false,
    rebuildExecuted: false,
    evidenceChainExecuted: false,
    monthsAdded: [],
    monthsDeepened: [],
    commandsRun: [],
    errors: [],
  };
}

export async function runExpansionPipeline(input: {
  researchResultsDir: string;
  executeImport: boolean;
  rerunEvidenceChain: boolean;
  runCommand: ShellCommandRunner;
}): Promise<ExpansionExecutionSummary> {
  const summary = createEmptyExpansionExecution();
  const researchFlag = `--research-results-dir ${input.researchResultsDir}`;

  const coverageCommand = `npm run research:coverage-plan -- ${researchFlag}`;
  summary.commandsRun = [...summary.commandsRun, coverageCommand];
  const coverageResult = await input.runCommand(coverageCommand);
  if (coverageResult.exitCode !== 0) {
    summary.errors = [...summary.errors, coverageResult.stderr || "coverage-plan failed"];
    summary.succeeded = false;
    return summary;
  }

  const configCommand = `npm run research:generate-expansion-import-config -- --input ${input.researchResultsDir}/historical-coverage-plan.json`;
  summary.commandsRun = [...summary.commandsRun, configCommand];
  const configResult = await input.runCommand(configCommand);
  if (configResult.exitCode !== 0) {
    summary.errors = [...summary.errors, configResult.stderr || "generate-expansion-import-config failed"];
    summary.succeeded = false;
    return summary;
  }

  if (!input.executeImport) {
    return summary;
  }

  summary.attempted = true;
  const importCommand =
    `npm run research:execute-expansion-import -- --execute ${researchFlag} --max-markets 200`;
  summary.commandsRun = [...summary.commandsRun, importCommand];
  const importResult = await input.runCommand(importCommand);
  if (importResult.exitCode !== 0) {
    summary.errors = [...summary.errors, importResult.stderr || "execute-expansion-import failed"];
    summary.succeeded = false;
    return summary;
  }

  summary.importExecuted = true;
  const rebuildCommand = `npm run research:rebuild-after-expansion -- ${researchFlag}`;
  summary.commandsRun = [...summary.commandsRun, rebuildCommand];
  const rebuildResult = await input.runCommand(rebuildCommand);
  if (rebuildResult.exitCode !== 0) {
    summary.errors = [...summary.errors, rebuildResult.stderr || "rebuild-after-expansion failed"];
    summary.succeeded = false;
    return summary;
  }

  summary.rebuildExecuted = true;

  if (input.rerunEvidenceChain || input.executeImport) {
    const chainCommands = [
      `npm run research:hypotheses -- ${researchFlag}`,
      `npm run research:hypothesis-validation -- ${researchFlag}`,
      `npm run research:cost-aware-atlas -- ${researchFlag}`,
      `npm run research:hypothesis-trade-replay -- ${researchFlag}`,
      `npm run research:oos-power-correction -- ${researchFlag}`,
      `npm run research:family-verdict -- ${researchFlag}`,
      `npm run research:pnl-forensics -- ${researchFlag}`,
      `npm run research:derived-month-pnl-sensitivity -- ${researchFlag}`,
    ];

    for (const command of chainCommands) {
      summary.commandsRun = [...summary.commandsRun, command];
      const result = await input.runCommand(command);
      if (result.exitCode !== 0) {
        summary.errors = [...summary.errors, result.stderr || `${command} failed`];
        summary.succeeded = false;
        return summary;
      }
    }

    summary.evidenceChainExecuted = true;
  }

  return summary;
}

export function resolveMonthsAddedAndDeepened(input: {
  beforeCalendarMonths: readonly string[];
  afterCalendarMonths: readonly string[];
  beforeMarketCountByMonth: ReadonlyMap<string, number>;
  afterMarketCountByMonth: ReadonlyMap<string, number>;
}): { monthsAdded: string[]; monthsDeepened: string[] } {
  const beforeSet = new Set(input.beforeCalendarMonths);
  const monthsAdded = input.afterCalendarMonths
    .filter((month) => !beforeSet.has(month))
    .sort();
  const monthsDeepened = input.afterCalendarMonths
    .filter((month) => {
      const beforeCount = input.beforeMarketCountByMonth.get(month) ?? 0;
      const afterCount = input.afterMarketCountByMonth.get(month) ?? 0;
      return beforeCount > 0 && afterCount > beforeCount;
    })
    .sort();

  return { monthsAdded, monthsDeepened };
}
