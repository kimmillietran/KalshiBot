import {
  collectMispricingAtlasBucketGroups,
} from "@/lib/data/research/mispricingAtlas/computeMispricingAtlasCoverage";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

const TEMPORAL_HEATMAP_GROUPS = [
  "probabilityHour",
  "probabilityWeekday",
  "momentumHour",
  "timeRemainingHour",
  "hourUtc",
  "dayOfWeekUtc",
  "sessionBucket",
  "weekendFlag",
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function calibrationColor(error: number | null): string {
  if (error === null) {
    return theme.textMuted;
  }

  if (Math.abs(error) >= 0.05) {
    return error > 0 ? theme.bullish : theme.bearish;
  }

  return theme.warning;
}

function renderHeatmapSection(
  title: string,
  buckets: readonly {
    bucketId: string;
    bucketLabel: string;
    observations: number;
    calibrationError: number | null;
  }[],
): string {
  const cells = buckets
    .map((bucket) => {
      const color = calibrationColor(bucket.calibrationError);
      const value =
        bucket.calibrationError === null
          ? "—"
          : `${bucket.calibrationError >= 0 ? "+" : ""}${(bucket.calibrationError * 100).toFixed(1)}%`;

      return `
        <td class="heatmap-cell" style="background:${color}22;color:${color};border-color:${color}55" title="${escapeHtml(bucket.bucketLabel)} · ${bucket.observations} obs">
          ${escapeHtml(value)}
        </td>`;
    })
    .join("");

  return `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      <table class="heatmap-table">
        <thead><tr>${buckets.map((bucket) => `<th>${escapeHtml(bucket.bucketId)}</th>`).join("")}</tr></thead>
        <tbody><tr>${cells || "<td>No buckets</td>"}</tr></tbody>
      </table>
    </section>`;
}

/** Serializes temporal calibration heatmaps for atlas HTML reports. */
export function serializeTemporalCalibrationHeatmapHtml(atlas: MispricingAtlas): string {
  const groups = collectMispricingAtlasBucketGroups({
    probabilityBuckets: atlas.probabilityBuckets,
    timeRemainingBuckets: atlas.timeRemainingBuckets,
    moneynessBuckets: atlas.moneynessBuckets,
    volatilityBuckets: atlas.volatilityBuckets,
    momentumBuckets: atlas.momentumBuckets,
    hourUtcBuckets: atlas.hourUtcBuckets,
    dayOfWeekUtcBuckets: atlas.dayOfWeekUtcBuckets,
    sessionBucketBuckets: atlas.sessionBucketBuckets,
    weekendFlagBuckets: atlas.weekendFlagBuckets,
    coarseBuckets: atlas.coarseBuckets,
  }).filter((group) =>
    (TEMPORAL_HEATMAP_GROUPS as readonly string[]).includes(group.dimension)
    && group.buckets.some((bucket) => bucket.observations > 0),
  );

  const sections = groups
    .map((group) => renderHeatmapSection(group.dimension, group.buckets))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Temporal Calibration Heatmaps</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-top: 16px; overflow-x: auto; }
    .heatmap-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: center; }
    .heatmap-cell { min-width: 72px; border: 1px solid ${theme.panelBorder}; }
  </style>
</head>
<body>
  <header>
    <h1>Temporal calibration heatmaps</h1>
    <p>Generated ${escapeHtml(atlas.generatedAt)} · registry-driven temporal dimensions</p>
  </header>
  ${sections || "<section class=\"panel\"><p>No temporal bucket groups available.</p></section>"}
</body>
</html>`;
}
