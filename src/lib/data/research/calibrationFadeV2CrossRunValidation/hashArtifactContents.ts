import { fnv1a32 } from "@/lib/trading/config/hashConfig";

import { CalibrationFadeV2CrossRunValidationError } from "./calibrationFadeV2CrossRunValidationTypes";

/** Content hash of artifact bytes. Does not use mtime, ctime, or path freshness. */
export function hashArtifactContents(content: string): string {
  if (typeof content !== "string") {
    throw new CalibrationFadeV2CrossRunValidationError("Unable to hash artifact contents");
  }
  return fnv1a32(content.replace(/^\uFEFF/, ""));
}
