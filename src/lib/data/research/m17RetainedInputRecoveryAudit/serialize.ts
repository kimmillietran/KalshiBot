import type { M17RetainedInputRecoveryReport } from "./types";

export function serializeM17RetainedInputRecoveryMarkdown(
  report: M17RetainedInputRecoveryReport,
): string {
  const lines: string[] = [
    `# M17 retained-input recovery audit — \`${report.studyId}\``,
    "",
    `Generated: ${report.generatedAtUtc}`,
    `Analysis version: \`${report.analysisVersion}\``,
    `Code SHA: \`${report.codeAuthoritySha ?? "null"}\``,
    `Final status: **${report.finalStatus}**`,
    "",
    report.disclaimer,
    "",
    "## Executive answers",
    "",
    `- Purchase made: **${report.purchaseMade}**`,
    `- Network requests: **${report.networkRequestsMade}**`,
    `- Strategy rule modified: **${report.strategyRuleModified}**`,
    `- Strategy P&L computed: **${report.strategyPnlComputed}**`,
    `- Exploratory eval executable without purchase: **${report.exploratoryEvalExecutableWithoutPurchase}**`,
    "",
    report.confirmatoryNote,
    "",
    "## Classification counts",
    "",
    "| Class | Count |",
    "| --- | ---: |",
  ];
  for (const [k, v] of Object.entries(report.classificationCounts)) {
    lines.push(`| \`${k}\` | ${v} |`);
  }
  lines.push(
    "",
    "## Required inputs",
    "",
    "| Input | Class | Summary |",
    "| --- | --- | --- |",
  );
  for (const c of report.classifications) {
    lines.push(
      `| \`${c.inputId}\` | \`${c.classification}\` | ${c.summary.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push(
    "",
    "## Remaining blockers",
    "",
  );
  for (const b of report.remainingBlockers) {
    lines.push(`- \`${b}\``);
  }
  lines.push(
    "",
    "## Available artifacts",
    "",
    "| Path | Role | Present | SHA-256 | Notes |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const a of report.availableArtifacts) {
    lines.push(
      `| \`${a.path}\` | ${a.role} | ${a.present} | \`${a.sha256 ?? "null"}\` | ${a.notes.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push(
    "",
    "## Offline derivers implemented (minimal)",
    "",
  );
  for (const d of report.offlineDerivationImplemented) {
    lines.push(`- \`${d}\``);
  }
  lines.push(
    "",
    "## Input identities",
    "",
    "| Key | Value |",
    "| --- | --- |",
  );
  for (const [k, v] of Object.entries(report.inputIdentities).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }
  return `${lines.join("\n")}\n`;
}
