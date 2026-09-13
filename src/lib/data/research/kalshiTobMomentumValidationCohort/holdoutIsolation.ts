import { MomentumValidationCohortError } from "./momentumValidationCohortTypes";

/**
 * Admitted validation segments are forever VALIDATION-role data.
 * They can never become untouched holdout / prospective confirmation / pristine holdout.
 */
export function assertAdmittedValidationSegmentCannotBecomeHoldout(input: {
  runId: string;
  admittedToValidationCohort: boolean;
  proposedRole:
    | "validation"
    | "holdout"
    | "untouched-momentum-holdout"
    | "prospective-confirmation"
    | "another-family-pristine-holdout"
    | string;
}): void {
  if (!input.admittedToValidationCohort) {
    return;
  }
  if (input.proposedRole === "validation") {
    return;
  }
  throw new MomentumValidationCohortError(
    `admitted validation segment ${input.runId} cannot become ${input.proposedRole}; `
      + "validation→holdout reuse is forever forbidden (fail closed)",
  );
}

export function buildValidationHoldoutIsolationPolicy(): {
  validationToHoldoutForeverForbidden: true;
  validationToProspectiveConfirmationForbidden: true;
  validationToOtherFamilyPristineHoldoutForbidden: true;
  futureHoldoutRequiresSeparateFreshData: true;
} {
  return {
    validationToHoldoutForeverForbidden: true,
    validationToProspectiveConfirmationForbidden: true,
    validationToOtherFamilyPristineHoldoutForbidden: true,
    futureHoldoutRequiresSeparateFreshData: true,
  };
}
