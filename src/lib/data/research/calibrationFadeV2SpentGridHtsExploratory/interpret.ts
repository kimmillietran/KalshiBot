import type {
  Cr2TwoSidedInference,
  ExploratoryInterpretation,
} from "./types";

export function interpretExploratoryResult(input: {
  dataIntegrityOk: boolean;
  dataIntegrityNote?: string;
  n: number;
  g: number;
  meanNetPnlCents: number;
  inference: Cr2TwoSidedInference | null;
}): { status: ExploratoryInterpretation; rationale: string } {
  if (!input.dataIntegrityOk) {
    return {
      status: "blocked-data-integrity",
      rationale: input.dataIntegrityNote
        ?? "Data-integrity checks failed before economic interpretation.",
    };
  }

  if (input.n < 50 || input.g < 10) {
    return {
      status: "insufficient-evidence",
      rationale:
        `N=${input.n}, G=${input.g}: below predeclared incidence floor (N≥50 and G≥10). `
        + "Insufficient evidence, not strategy rejection of continuous-first-crossing.",
    };
  }

  if (input.inference && input.inference.ci95UpperCents <= 0) {
    return {
      status: "evidence-against-positive-mean",
      rationale:
        `CI upper bound ${input.inference.ci95UpperCents.toFixed(4)}¢ ≤ 0 under CR2 `
        + "df=G−1 assumptions for this grid variant.",
    };
  }

  if (input.meanNetPnlCents <= 0) {
    const ciNote = input.inference
      ? ` Two-sided 95% CI [${input.inference.ci95LowerCents.toFixed(4)}, `
        + `${input.inference.ci95UpperCents.toFixed(4)}]¢`
        + (input.inference.ci95LowerCents < 0 && input.inference.ci95UpperCents > 0
          ? " spans zero — statistical uncertainty retained."
          : ".")
      : "";
    return {
      status: "observed-economics-do-not-support-proceeding",
      rationale:
        `Mean net P&L ${input.meanNetPnlCents.toFixed(4)}¢ ≤ 0 with N=${input.n}, G=${input.g}. `
        + "Observed economics do not support proceeding with this grid variant."
        + ciNote,
    };
  }

  if (
    input.meanNetPnlCents >= 1
    && input.g >= 15
    && input.inference
    && input.inference.ci95LowerCents > 0
  ) {
    return {
      status: "exploratory-promise",
      rationale:
        `Mean ${input.meanNetPnlCents.toFixed(4)}¢ ≥ +1¢, G=${input.g} ≥ 15, and CI lower `
        + `bound ${input.inference.ci95LowerCents.toFixed(4)}¢ > 0. Exploratory screening `
        + "promise only — not live fillability or independent confirmation.",
    };
  }

  return {
    status: "inconclusive-or-below-material-promise-bar",
    rationale:
      `Positive mean ${input.meanNetPnlCents.toFixed(4)}¢ but below exploratory-promise `
      + "bar (need mean≥+1¢, G≥15, and CI lower>0) or CI unavailable.",
  };
}
