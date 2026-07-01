import {
  historicalResearchCliInputSchema,
  type HistoricalResearchCliInputDocument,
} from "@/lib/data/fixtures";

import {
  ResearchDatasetRegistryError,
  ResearchDatasetRegistryErrorCode,
  type ParsedResearchFixture,
} from "./researchDatasetRegistryTypes";

/** Parses and validates a research fixture JSON document. */
export function parseResearchFixtureJson(
  json: string,
  marketTicker?: string,
): ParsedResearchFixture {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ResearchDatasetRegistryError(
      "fixture.json contains invalid JSON",
      ResearchDatasetRegistryErrorCode.INVALID_FIXTURE_SCHEMA,
      marketTicker,
    );
  }

  const result = historicalResearchCliInputSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ResearchDatasetRegistryError(
      issue?.message ?? "fixture.json failed validation",
      ResearchDatasetRegistryErrorCode.INVALID_FIXTURE_SCHEMA,
      marketTicker,
    );
  }

  return result.data as HistoricalResearchCliInputDocument;
}
