import { MomentumValidationCohortError } from "./momentumValidationCohortTypes";

/**
 * Fail closed if any validation outcome access has occurred before the
 * operational segmentation amendment. Justification must be operator
 * convenience / capture scheduling only.
 */
export function assertNoValidationOutcomesOpenedBeforeSegmentationAmendment(input: {
  validationExecutablePnlComputed?: boolean;
  midpointContinuationComputed?: boolean;
  responseDirectionInspected?: boolean;
  validationEffectEstimateInspected?: boolean;
  pValueCalculated?: boolean;
}): void {
  const violations: string[] = [];
  if (input.validationExecutablePnlComputed) {
    violations.push("validation executable P&L has been computed");
  }
  if (input.midpointContinuationComputed) {
    violations.push("midpoint continuation has been computed");
  }
  if (input.responseDirectionInspected) {
    violations.push("response direction has been inspected");
  }
  if (input.validationEffectEstimateInspected) {
    violations.push("validation effect estimate has been inspected");
  }
  if (input.pValueCalculated) {
    violations.push("p-value has been calculated");
  }
  if (violations.length > 0) {
    throw new MomentumValidationCohortError(
      "FAIL CLOSED: cannot amend validation segmentation after outcome access — "
        + violations.join("; "),
    );
  }
}
