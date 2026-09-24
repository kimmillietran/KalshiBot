import { compareOfficialSettlementToObservedWindow } from "@/lib/data/research/kalshiBrtiAccessProbe";

import { quoteAsOf, detectClockAdjustment, type AlignedQuote } from "./alignQuotes";
import type { LiveMarketIdentity } from "./bindLiveMarket";
import {
  inferAddedSampleFromCountAverage,
  isSettlementWindowAverage,
  isTrailingAverage,
  type ImpliedSampleInference,
  type VenueAverageUpdate,
} from "./inferVenueAverageMapping";
import type { SynchronizedCaptureResult } from "./runSynchronizedCapture";
import { observationInWindow, selectWindowObservations } from "./windowBoundaries";
import type { TimedObservation } from "./types";

export type VenueAverageAlignment = {
  update: VenueAverageUpdate;
  fieldKind: VenueAverageUpdate["fieldKind"];
  labeledAsSettlementAverage: boolean;
  labeledAsTrailingAverage: boolean;
  rawObservationsInDeclaredWindow: number;
  inference: ImpliedSampleInference;
  quote: AlignedQuote;
};

export type SynchronizedSessionAnalysis = {
  usableBrti: boolean;
  usableVenueAverage: boolean;
  usableQuotes: boolean;
  clockAdjustment: ReturnType<typeof detectClockAdjustment> | null;
  futureQuoteLeakage: false;
  venueAlignments: VenueAverageAlignment[];
  completedSettlementAverage: VenueAverageUpdate | null;
  officialComparison: ReturnType<typeof compareOfficialSettlementToObservedWindow> | null;
  coverage: {
    cfb1HzEvents: number;
    cfb5HzEvents: number;
    orderbookEvents: number;
    rawBrtiCount: number;
    validQuotes: number;
    settlementAverageUpdates: number;
    trailingAverageUpdates: number;
  };
};

export function analyzeSynchronizedSession(input: {
  capture: SynchronizedCaptureResult;
  market: LiveMarketIdentity | null;
  officialBody?: unknown;
}): SynchronizedSessionAnalysis {
  const capture = input.capture;
  const clockAdjustment = capture.events.length >= 2
    ? detectClockAdjustment({
      firstWallMs: capture.events[0]!.localReceivedAtMs,
      lastWallMs: capture.events.at(-1)!.localReceivedAtMs,
      firstMonoMs: capture.events[0]!.localReceivedAtMonoMs,
      lastMonoMs: capture.events.at(-1)!.localReceivedAtMonoMs,
    })
    : null;

  const rawAsObservations: TimedObservation[] = capture.rawBrti.map((item) => ({
    timeRaw: item.sourceTsMs,
    timeMs: item.sourceTsMs,
    valueRaw: item.valueRaw,
    value: item.valueRaw != null ? Number(item.valueRaw) : null,
  }));

  const venueAlignments: VenueAverageAlignment[] = capture.venueAverages.map((update, index) => {
    const previous = capture.venueAverages
      .slice(0, index)
      .reverse()
      .find((item) => item.fieldName === update.fieldName) ?? null;
    const declaredWindowClose = update.windowEndTsExclusive
      ?? (update.windowStartTsMs != null ? update.windowStartTsMs + 60_000 : null);
    const inDeclaredWindow = declaredWindowClose == null || update.windowStartTsMs == null
      ? []
      : rawAsObservations.filter((observation) => (
        observation.timeMs != null
        && observation.timeMs >= update.windowStartTsMs!
        && observation.timeMs < declaredWindowClose
        && observationInWindow(observation.timeMs, declaredWindowClose, "payload-start-inclusive-end-exclusive")
      ));
    return {
      update,
      fieldKind: update.fieldKind,
      labeledAsSettlementAverage: isSettlementWindowAverage(update.fieldName),
      labeledAsTrailingAverage: isTrailingAverage(update.fieldName),
      rawObservationsInDeclaredWindow: inDeclaredWindow.length,
      inference: inferAddedSampleFromCountAverage({
        previous,
        next: update,
        candidateObservations: selectWindowObservations(
          rawAsObservations,
          declaredWindowClose ?? 0,
          "payload-start-inclusive-end-exclusive",
        ),
      }),
      quote: quoteAsOf({
        quotes: capture.quotes,
        observationReceivedAtMs: update.localReceivedAtMs,
      }),
    };
  });

  const settlementUpdates = capture.venueAverages.filter((item) => isSettlementWindowAverage(item.fieldName));
  const completedSettlementAverage = [...settlementUpdates]
    .reverse()
    .find((item) => item.count === 60)
    ?? settlementUpdates.at(-1)
    ?? null;

  const officialComparison = input.officialBody != null && input.market != null
    ? compareOfficialSettlementToObservedWindow({
      body: input.officialBody,
      venueAverageRaw: completedSettlementAverage?.valueRaw ?? null,
      observedCloseIso: input.market.closeTimeUtc,
      expectedEventTicker: input.market.eventTicker,
    })
    : null;

  return {
    usableBrti: capture.rawBrti.some((item) => item.valueRaw != null && item.sourceTsMs != null),
    usableVenueAverage: completedSettlementAverage != null,
    usableQuotes: capture.quotes.some((quote) => quote.bookState === "valid"),
    clockAdjustment,
    futureQuoteLeakage: false,
    venueAlignments,
    completedSettlementAverage,
    officialComparison,
    coverage: {
      cfb1HzEvents: capture.events.filter((event) => event.stream === "cfb-1hz").length,
      cfb5HzEvents: capture.events.filter((event) => event.stream === "cfb-5hz").length,
      orderbookEvents: capture.events.filter((event) => event.stream === "orderbook").length,
      rawBrtiCount: capture.rawBrti.length,
      validQuotes: capture.quotes.filter((quote) => quote.bookState === "valid").length,
      settlementAverageUpdates: settlementUpdates.length,
      trailingAverageUpdates: capture.venueAverages.filter((item) => isTrailingAverage(item.fieldName)).length,
    },
  };
}
