export type ImbalanceComputation =
  | { ok: true; imbalance: number; sign: -1 | 0 | 1 }
  | { ok: false; reason: string };

export function computeTobSizeImbalance(input: {
  yesBestBidSize: number | null;
  noBestBidSize: number | null;
}): ImbalanceComputation {
  const yes = input.yesBestBidSize;
  const no = input.noBestBidSize;
  if (yes == null || no == null || !Number.isFinite(yes) || !Number.isFinite(no)) {
    return { ok: false, reason: "sizes must be finite numbers" };
  }
  if (yes < 0 || no < 0) {
    return { ok: false, reason: "sizes must be non-negative" };
  }
  const denominator = yes + no;
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    return { ok: false, reason: "denominator must be finite and positive" };
  }
  const imbalance = (yes - no) / denominator;
  if (!Number.isFinite(imbalance)) {
    return { ok: false, reason: "imbalance must be finite" };
  }
  const sign: -1 | 0 | 1 = imbalance > 0 ? 1 : imbalance < 0 ? -1 : 0;
  return { ok: true, imbalance, sign };
}

/**
 * Fixed same-direction convention:
 * predicted YES repricing sign equals sign(imbalance).
 */
export function predictedYesRepricingSign(imbalanceSign: -1 | 0 | 1): -1 | 0 | 1 {
  return imbalanceSign;
}
