import type {
  ExpansionImportCheckpointIo,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";
import { parseExpansionImportCheckpointJson } from "./parseExpansionImportCheckpointJson";

/** Loads an existing checkpoint document when present. */
export function loadExpansionImportCheckpoint(
  checkpointPath: string,
  io: ExpansionImportCheckpointIo,
): HistoricalExpansionImportCheckpoint | null {
  if (!io.fileExists(checkpointPath)) {
    return null;
  }

  return parseExpansionImportCheckpointJson(
    checkpointPath,
    io.readFile(checkpointPath),
  );
}
