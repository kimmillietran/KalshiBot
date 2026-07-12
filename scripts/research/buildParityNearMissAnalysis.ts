import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  buildParityNearMissAnalysisReport,
  createParityNearMissAnalysisIo,
  parseParityNearMissAnalysisArgv,
  serializeParityNearMissAnalysisHtml,
  serializeParityNearMissAnalysisReport,
} from "@/lib/data/research/parityNearMissAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

async function main(): Promise<void> {
  try {
    const { outputPath, htmlOutputPath, config } = parseParityNearMissAnalysisArgv(
      process.argv.slice(2),
    );
    const report = await buildParityNearMissAnalysisReport({
      generatedAt: new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      config,
      io: createParityNearMissAnalysisIo(),
    });

    mkdirSync(dirname(outputPath), { recursive: true });
    mkdirSync(dirname(htmlOutputPath), { recursive: true });
    writeFileSync(outputPath, serializeParityNearMissAnalysisReport(report));
    writeFileSync(htmlOutputPath, serializeParityNearMissAnalysisHtml(report));

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        analysisScope: report.analysisScope,
        selectedRunId: report.selectedRunId,
        recordsScanned: report.recordsScanned,
        interpretationClassification: report.summary.interpretationClassification,
        recommendedNextAction: report.summary.recommendedNextAction,
        candidateCount: report.summary.candidateCount,
        closestGrossNearMissCents: report.summary.closestGrossNearMissCents,
        ruleConfigurationHash: report.ruleConfigurationHash,
        warnings: report.warnings,
      })}\n`,
    );
    process.exitCode = 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Parity near-miss analysis failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.env.VITEST !== "true") {
  void main();
}
