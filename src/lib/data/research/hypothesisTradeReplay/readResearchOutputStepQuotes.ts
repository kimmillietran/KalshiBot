function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export type ResearchOutputStepQuote = {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents: number;
  noAskCents: number;
};

function resolveNoQuotes(input: {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents?: number;
  noAskCents?: number;
}): { noBidCents: number; noAskCents: number } {
  return {
    noBidCents: input.noBidCents ?? 100 - input.yesAskCents,
    noAskCents: input.noAskCents ?? 100 - input.yesBidCents,
  };
}

/** Reads per-step bid/ask quotes from a serialized research output payload. */
export function readResearchOutputStepQuotes(
  outputJson: string,
): Map<number, ResearchOutputStepQuote> {
  const quotes = new Map<number, ResearchOutputStepQuote>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputJson);
  } catch {
    return quotes;
  }

  if (!isRecord(parsed)) {
    return quotes;
  }

  try {
    const researchRun = parseJsonValue(parsed.researchRun);
    if (!isRecord(researchRun)) {
      return quotes;
    }

    const backtestResult = parseJsonValue(researchRun.backtestResult);
    if (!isRecord(backtestResult)) {
      return quotes;
    }

    const replayResult = backtestResult.replayResult;
    const replay = isRecord(replayResult)
      ? replayResult
      : parseJsonValue(replayResult);

    if (!isRecord(replay) || !Array.isArray(replay.results)) {
      return quotes;
    }

    replay.results.forEach((step, stepIndex) => {
      if (!isRecord(step) || !isRecord(step.engineInput)) {
        return;
      }

      const pricing = isRecord(step.engineInput.pricing)
        ? step.engineInput.pricing
        : null;
      if (!pricing) {
        return;
      }

      const yesBidCents = readFiniteNumber(pricing, "yesBidCents");
      const yesAskCents = readFiniteNumber(pricing, "yesAskCents");
      if (yesBidCents === undefined || yesAskCents === undefined) {
        return;
      }

      const noBidCents = readFiniteNumber(pricing, "noBidCents");
      const noAskCents = readFiniteNumber(pricing, "noAskCents");
      const resolvedNo = resolveNoQuotes({
        yesBidCents,
        yesAskCents,
        noBidCents,
        noAskCents,
      });

      quotes.set(stepIndex, {
        yesBidCents,
        yesAskCents,
        noBidCents: resolvedNo.noBidCents,
        noAskCents: resolvedNo.noAskCents,
      });
    });
  } catch {
    return quotes;
  }

  return quotes;
}
