/**
 * Class B reconstruction-uncertainty proxy from half-spread mismatch fields.
 * Mirrors the offline diagnostic: retained half not reproducible from regenerated
 * YES bid/ask cents under the friction mid formula (float-derived NO bid).
 * Does not claim "Class B resolved" merely because noAsk exists.
 */

export function isClassBReconstructionUncertain(input: {
  yesBidCents: number;
  yesAskCents: number;
  halfSpreadMismatch: {
    retainedHalfSpreadCents: number;
    regeneratedHalfSpreadCents: number;
  } | null | undefined;
}): boolean {
  if (!input.halfSpreadMismatch) return false;
  const retained = input.halfSpreadMismatch.retainedHalfSpreadCents;
  if (!Number.isFinite(retained)) return true;
  return !retainedHalfReproducibleFromRegenCents({
    yesBidCents: input.yesBidCents,
    yesAskCents: input.yesAskCents,
    retainedHalfSpreadCents: retained,
  });
}

export function retainedHalfReproducibleFromRegenCents(input: {
  yesBidCents: number;
  yesAskCents: number;
  retainedHalfSpreadCents: number;
}): boolean {
  const { yesBidCents: yb, yesAskCents: ya, retainedHalfSpreadCents } = input;
  // Scan floats that round to ya and check friction mid half.
  for (let i = ya * 1000 - 1000; i <= ya * 1000 + 1000; i += 1) {
    const yaF = i / 100_000;
    if (Math.round(yaF * 100) !== ya) continue;
    const nb = Math.round((1 - yaF) * 100);
    const mid = 50 + (yb - nb) / 2;
    const half = ya - mid;
    if (Math.abs(half - retainedHalfSpreadCents) <= 1e-9) {
      return true;
    }
  }
  return false;
}
