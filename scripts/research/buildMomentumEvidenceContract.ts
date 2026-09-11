#!/usr/bin/env npx tsx
/**
 * M14.0b-prep: emit candidate-agnostic momentum evidence + data-isolation contract.
 * Metadata/design only — does not read historical momentum outcomes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildMomentumEvidenceDesignReport,
  parseMomentumEvidenceContractArgv,
  serializeMomentumEvidenceDesignHtml,
  serializeMomentumEvidenceDesignJson,
} from "@/lib/data/research/momentumEvidenceContract";

async function main(): Promise<void> {
  const config = parseMomentumEvidenceContractArgv(process.argv.slice(2));
  const report = buildMomentumEvidenceDesignReport({ config });
  const json = serializeMomentumEvidenceDesignJson(report);
  const html = serializeMomentumEvidenceDesignHtml(report);

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
        feeContractStatus: report.feeContract.feeContractStatus,
        netEdgePromotionAuthorized: report.feeContract.netEdgePromotionAuthorized,
        requiredEffectiveNWhenBound: report.powerMethodology.requiredEffectiveNWhenBound,
        freshCaptureRequiredBeforeValidation:
          report.captureInventory.freshCaptureRequiredBeforeValidation,
        freshCaptureRequiredBeforeUntouchedHoldout:
          report.captureInventory.freshCaptureRequiredBeforeUntouchedHoldout,
        contaminatedExploratoryTrainCandidates:
          report.captureInventory.contaminatedExploratoryTrainCandidates,
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
