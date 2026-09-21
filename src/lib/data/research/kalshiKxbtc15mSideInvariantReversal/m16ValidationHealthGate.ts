/**
 * M16.2a research health gate — maps capture-health-audit → segment health.
 * Outcome-blind: never inspects P&L / target / stop / settlement.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  buildCaptureHealthAuditReport,
  createCaptureHealthAuditConfig,
  type CaptureHealthAuditIo,
  type CaptureHealthAuditReport,
} from "@/lib/data/research/captureHealthAudit";
import { createFilesystemJsonlIo } from "@/lib/data/research/jsonl";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { M16_STANDARD_SEGMENT_DURATION_MINUTES } from "./m16ProspectiveCohortPlan";
import type { M16ValidationSegmentHealth } from "./m16ValidationCohortTypes";

/** Require ≥90% of the sealed 240m window for research-ready. */
export const M16_VALIDATION_HEALTH_MIN_DURATION_SECONDS = Math.floor(
  M16_STANDARD_SEGMENT_DURATION_MINUTES * 60 * 0.9,
);

export function createFilesystemCaptureHealthAuditIo(): CaptureHealthAuditIo {
  const jsonl = createFilesystemJsonlIo();
  return {
    ...jsonl,
    isDirectory: (path) => {
      try {
        return existsSync(path) && statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    fileMtimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
  };
}

export async function auditM16ValidationCaptureHealth(input: {
  captureRunDir: string;
  runId: string;
  generatedAtIso?: string;
  io?: CaptureHealthAuditIo;
  buildReport?: typeof buildCaptureHealthAuditReport;
}): Promise<{
  health: M16ValidationSegmentHealth;
  report: CaptureHealthAuditReport;
}> {
  const io = input.io ?? createFilesystemCaptureHealthAuditIo();
  const buildReport = input.buildReport ?? buildCaptureHealthAuditReport;
  const generatedAt = input.generatedAtIso ?? new Date().toISOString();
  const outputPath = join(input.captureRunDir, "m16-validation-capture-health-audit.json");
  const htmlOutputPath = join(
    input.captureRunDir,
    "m16-validation-capture-health-audit.html",
  );
  mkdirSync(input.captureRunDir, { recursive: true });

  const report = await buildReport({
    generatedAt,
    outputPath,
    htmlOutputPath,
    captureRunDir: input.captureRunDir,
    config: createCaptureHealthAuditConfig({
      minDurationSeconds: M16_VALIDATION_HEALTH_MIN_DURATION_SECONDS,
    }),
    io,
  });

  const passed = report.summary.verdict === "capture-research-ready";
  const failureReasons = passed
    ? []
    : [
        `verdict=${report.summary.verdict}`,
        ...report.warnings.filter((w) => w.length > 0).slice(0, 8),
      ];

  const healthArtifactIdentity = createHash("sha256")
    .update(
      stableStringify({
        kind: "m16-validation-segment-health-v1",
        runId: input.runId,
        captureRunDir: input.captureRunDir.replaceAll("\\", "/"),
        verdict: report.summary.verdict,
        topOfBookCount: report.summary.topOfBookCount,
        runDurationSeconds: report.summary.runDurationSeconds,
        analysisVersion: report.analysisVersion,
      }),
    )
    .digest("hex");

  return {
    health: {
      passed,
      verdict: report.summary.verdict,
      healthArtifactIdentity,
      failureReasons,
    },
    report,
  };
}
