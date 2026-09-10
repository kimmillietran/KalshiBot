#!/usr/bin/env npx tsx
/**
 * M13.0b-prep: emit candidate-agnostic microstructure evidence design contract.
 * Synthetic / design-only — does not read historical microstructure outcomes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildMicrostructureEvidenceDesignReport,
  parseMicrostructureEvidenceContractArgv,
  serializeMicrostructureEvidenceDesignHtml,
  serializeMicrostructureEvidenceDesignJson,
} from "@/lib/data/research/spreadLiquidityMicrostructureEvidenceContract";

async function main(): Promise<void> {
  const config = parseMicrostructureEvidenceContractArgv(process.argv.slice(2));
  const report = buildMicrostructureEvidenceDesignReport({ config });
  const json = serializeMicrostructureEvidenceDesignJson(report);
  const html = serializeMicrostructureEvidenceDesignHtml(report);

  await mkdir(dirname(report.outputPath), { recursive: true });
  await mkdir(dirname(report.htmlOutputPath), { recursive: true });
  await writeFile(report.outputPath, json, "utf8");
  await writeFile(report.htmlOutputPath, html, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        contractIdentityHash: report.contractIdentityHash,
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        familyDefinitionIdentity: report.familyDefinitionIdentity,
        materialEffectBound: report.materialEffectDecisionStatus.bound,
        quarantine: report.quarantine,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
