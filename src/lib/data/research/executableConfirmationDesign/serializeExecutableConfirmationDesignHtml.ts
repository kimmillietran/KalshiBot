import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ExecutableConfirmationDesignReport } from "./executableConfirmationDesignTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return `<p class="muted">None</p>`;
  }

  return `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>`;
}

function renderRecordRows(report: ExecutableConfirmationDesignReport): string {
  if (report.confirmationRecords.length === 0) {
    return `<tr><td colspan="5" class="muted">No candidates assessed.</td></tr>`;
  }

  return report.confirmationRecords
    .slice(0, 50)
    .map(
      (record) => `
      <tr>
        <td><code>${escapeHtml(record.candidateId)}</code></td>
        <td><code>${escapeHtml(record.marketTicker)}</code></td>
        <td>${escapeHtml(record.confirmationStatus)}</td>
        <td>${escapeHtml(record.confirmationSource)}</td>
        <td class="muted">${escapeHtml(record.reason)}</td>
      </tr>`,
    )
    .join("");
}

export function serializeExecutableConfirmationDesignHtml(
  report: ExecutableConfirmationDesignReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Executable Confirmation Design Harness</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; margin: 0; padding: 24px; }
    main { max-width: 1100px; margin: 0 auto; display: grid; gap: 20px; }
    section { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
    h1, h2 { margin: 0 0 12px; }
    .verdict { font-size: 1.25rem; font-weight: 700; color: ${theme.info}; }
    .muted { color: ${theme.textMuted}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    pre { overflow-x: auto; background: ${theme.panelInset}; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Executable Confirmation Design Harness</h1>
      <p class="muted">${escapeHtml(report.disclaimer)}</p>
      <div class="verdict">${escapeHtml(report.summary.confirmationStatus)}</div>
      <p>Recommended next fix: <strong>${escapeHtml(report.summary.recommendedNextFix)}</strong></p>
      <p>Confirmation supported: <strong>${report.summary.confirmationSupported ? "yes" : "no"}</strong></p>
    </section>

    <section>
      <h2>Current Data Assessment</h2>
      <div class="grid-2">
        <div class="metric"><div class="muted">Candidates assessed</div><div>${report.summary.candidateCountAssessed}</div></div>
        <div class="metric"><div class="muted">Executable-looking (research only)</div><div>${report.summary.confirmedExecutableCandidateCount}</div></div>
        <div class="metric"><div class="muted">Unsupported</div><div>${report.summary.unsupportedCandidateCount}</div></div>
        <div class="metric"><div class="muted">Static parity scan present</div><div>${report.dataAssessment.staticParityScanPresent ? "yes" : "no"}</div></div>
        <div class="metric"><div class="muted">Lifecycle artifact present</div><div>${report.dataAssessment.bidOnlyCandidateLifecyclePresent ? "yes" : "no"}</div></div>
        <div class="metric"><div class="muted">Forward capture readiness present</div><div>${report.dataAssessment.forwardCaptureReadinessPresent ? "yes" : "no"}</div></div>
      </div>
    </section>

    <section>
      <h2>Required vs Available Fields</h2>
      <div class="grid-2">
        <div>
          <h3>Available</h3>
          ${renderList(report.summary.availableDataFields)}
        </div>
        <div>
          <h3>Missing</h3>
          ${renderList(report.summary.missingDataFields)}
        </div>
      </div>
    </section>

    <section>
      <h2>Candidate Confirmation Records</h2>
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Market</th>
            <th>Status</th>
            <th>Source</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${renderRecordRows(report)}</tbody>
      </table>
    </section>

    <section>
      <h2>Example Future Confirmation Record</h2>
      <pre>${escapeHtml(JSON.stringify(report.exampleConfirmationRecord, null, 2))}</pre>
    </section>

    <section>
      <h2>Actionability Blockers</h2>
      ${renderList(report.summary.actionabilityBlockers)}
    </section>

    <section>
      <h2>Caveats</h2>
      <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
    </section>
  </main>
</body>
</html>`;
}
