import type { StrategySweepSynthesizedMetadata } from "./strategySweepTypes";

/** Embeds synthesized sweep metadata into a validated research-output.json payload. */
export function augmentResearchOutputWithSynthesizedMetadata(
  serializedJson: string,
  input: {
    sweepStrategyId: string;
    synthesized: StrategySweepSynthesizedMetadata;
  },
): string {
  const parsed = JSON.parse(serializedJson) as Record<string, unknown>;

  parsed.synthesized = {
    sweepStrategyId: input.sweepStrategyId,
    synthesizedStrategyId: input.synthesized.synthesizedStrategyId,
    hypothesisId: input.synthesized.hypothesisId,
    strategyFamily: input.synthesized.strategyFamily,
    pluginStrategyId: input.synthesized.pluginStrategyId,
  };

  const metadata = parsed.metadata;
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    const metadataRecord = metadata as Record<string, unknown>;
    metadataRecord.sweepStrategyId = input.sweepStrategyId;
    metadataRecord.synthesizedStrategyId = input.synthesized.synthesizedStrategyId;
    metadataRecord.hypothesisId = input.synthesized.hypothesisId;
  }

  return JSON.stringify(parsed);
}
