/** Parse display volume labels (e.g. `$503K`) into raw dollar amounts for features. */
export function parseVolumeLabelDollars(volumeLabel: string): number | null {
  const trimmed = volumeLabel.trim();
  if (!trimmed || trimmed === "—") {
    return null;
  }

  const match = /^\$([\d.]+)([KMB])?$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const suffix = match[2]?.toUpperCase();
  if (suffix === "K") return value * 1_000;
  if (suffix === "M") return value * 1_000_000;
  if (suffix === "B") return value * 1_000_000_000;
  return value;
}
