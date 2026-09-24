import { describe, expect, it } from "vitest";

import { quoteAsOf } from "./alignQuotes";
import { analyzeSynchronizedSession, computeFutureQuoteLeakage } from "./analyzeSynchronizedSession";
import { extractCloseBoundaryChronology, observationsAvailableAt } from "./extractCloseBoundaryChronology";
import { inferAddedSampleFromCountAverage, type VenueAverageUpdate } from "./inferVenueAverageMapping";
import { selectCompletedWindowAverage } from "./selectCompletedWindowAverage";
import type { SynchronizedCaptureResult } from "./runSynchronizedCapture";

const CLOSE_MS = 1_790_223_300_000;
const WINDOW_START = CLOSE_MS - 60_000;

function quote(input: { wall: number; mono: number; bid?: number }) {
  return {
    receivedAtMs: input.wall,
    receivedAtMonoMs: input.mono,
    exchangeTimestampMs: null,
    bookState: "valid" as const,
    yesBidCents: input.bid ?? 40,
    yesBidSize: 2,
    yesAskCents: 60,
    yesAskSize: 3,
    noBidCents: 40,
    noBidSize: 3,
    noAskCents: 60,
    noAskSize: 2,
    sequence: 1,
    sequenceGap: false,
    reconnectsBefore: 0,
  };
}

function update(input: Partial<VenueAverageUpdate> & Pick<VenueAverageUpdate, "fieldName" | "valueRaw" | "count">): VenueAverageUpdate {
  return {
    fieldKind: input.fieldName === "last_60s_windowed_average_15min" ? "settlement-window" : "trailing-60s",
    sumRaw: null,
    windowStartTsMs: WINDOW_START,
    windowEndTsExclusive: CLOSE_MS,
    providerTimestampMs: CLOSE_MS,
    localReceivedAtMs: CLOSE_MS + 120,
    localReceivedAtMonoMs: 1_000,
    ...input,
  };
}

describe("completed-window selection binds count and close window", () => {
  it("does not treat the last count-60 update as complete when its window is not the target close", () => {
    const selected = selectCompletedWindowAverage({
      closeMs: CLOSE_MS,
      updates: [
        update({
          fieldName: "last_60s_windowed_average_15min",
          valueRaw: "83817.61766667",
          count: 60,
          windowStartTsMs: WINDOW_START + 1_000,
          windowEndTsExclusive: CLOSE_MS + 1_000,
        }),
      ],
    });
    expect(selected.status).toBe("missing");
    expect(selected.selected).toBeNull();
  });

  it("does not label an incomplete fallback as a completed average", () => {
    const selected = selectCompletedWindowAverage({
      closeMs: CLOSE_MS,
      updates: [
        update({
          fieldName: "last_60s_windowed_average_15min",
          valueRaw: "83817.60372881",
          count: 59,
          windowStartTsMs: WINDOW_START,
          windowEndTsExclusive: CLOSE_MS,
        }),
      ],
    });
    expect(selected.status).toBe("incomplete");
    expect(selected.selected).toBeNull();
  });

  it("selects the first complete target-window update and counts later repeats", () => {
    const first = update({
      fieldName: "last_60s_windowed_average_15min",
      valueRaw: "83817.61766667",
      count: 60,
      localReceivedAtMonoMs: 1_000,
    });
    const repeat = update({
      fieldName: "last_60s_windowed_average_15min",
      valueRaw: "99999.00",
      count: 60,
      localReceivedAtMs: CLOSE_MS + 200,
      localReceivedAtMonoMs: 1_100,
    });
    const selected = selectCompletedWindowAverage({
      closeMs: CLOSE_MS,
      updates: [first, repeat],
    });
    expect(selected.status).toBe("ambiguous");
    expect(selected.selected?.valueRaw).toBe("83817.61766667");
    expect(selected.laterRepeatsWithSameWindow).toBe(1);
  });
});

describe("count/average inference does not cross windows or future ticks", () => {
  it("refuses to compare successive averages from different windows", () => {
    const inference = inferAddedSampleFromCountAverage({
      previous: {
        fieldName: "avg_60s_data",
        valueRaw: "83817.70733333",
        count: 60,
        windowStartTsMs: WINDOW_START,
      },
      next: {
        fieldName: "avg_60s_data",
        valueRaw: "83817.61766667",
        count: 60,
        windowStartTsMs: WINDOW_START + 1_000,
      },
    });
    expect(inference.reason).toBe("previous-update-has-different-window-identity");
    expect(inference.mappingStatus).toBe("unresolved");
  });

  it("does not use observations received after the update", () => {
    const available = observationsAvailableAt({
      receivedAtMs: CLOSE_MS + 120,
      receivedAtMonoMs: 1_000,
      observations: [
        {
          timeMs: CLOSE_MS - 200,
          valueRaw: "10.00",
          value: 10,
          localReceivedAtMs: CLOSE_MS + 50,
          localReceivedAtMonoMs: 900,
        },
        {
          timeMs: CLOSE_MS - 100,
          valueRaw: "11.00",
          value: 11,
          localReceivedAtMs: CLOSE_MS + 200,
          localReceivedAtMonoMs: 1_100,
        },
      ],
    });
    expect(available.map((item) => item.valueRaw)).toEqual(["10.00"]);
  });
});

describe("quote ordering at identical wall-clock timestamps", () => {
  it("uses monotonic receipt when wall clocks tie and never a later quote", () => {
    const aligned = quoteAsOf({
      observationReceivedAtMs: 1_000,
      observationReceivedAtMonoMs: 11,
      quotes: [
        quote({ wall: 1_000, mono: 10, bid: 40 }),
        quote({ wall: 1_000, mono: 12, bid: 41 }),
      ],
    });
    expect(aligned.quote?.yesBidCents).toBe(40);
    expect(aligned.usedFutureQuote).toBe(false);
  });
});

describe("futureQuoteLeakage is computed", () => {
  it("is true when a selected quote is after the observation", () => {
    const leaked = computeFutureQuoteLeakage([{
      update: update({
        fieldName: "last_60s_windowed_average_15min",
        valueRaw: "1",
        count: 60,
        localReceivedAtMs: 1_000,
        localReceivedAtMonoMs: 10,
      }),
      fieldKind: "settlement-window",
      labeledAsSettlementAverage: true,
      labeledAsTrailingAverage: false,
      rawObservationsInDeclaredWindow: 0,
      inference: inferAddedSampleFromCountAverage({
        previous: null,
        next: update({ fieldName: "last_60s_windowed_average_15min", valueRaw: "1", count: 60 }),
      }),
      quote: {
        available: true,
        reason: null,
        bookAgeMs: 0,
        usedFutureQuote: true,
        quote: quote({ wall: 1_100, mono: 20 }),
        missingSize: false,
        stale: false,
      },
    }]);
    expect(leaked).toBe(true);
  });
});

describe("close-boundary chronology replay", () => {
  it("keeps settlement and trailing fields associated with the original message", () => {
    const jsonl = [
      JSON.stringify({
        receivedAtMs: CLOSE_MS + 120,
        receivedAtMonoMs: 718_029.709259,
        bytes: 10,
        payload: JSON.stringify({
          type: "cfbenchmarks_value",
          msg: {
            received_at: CLOSE_MS + 75,
            last_60s_windowed_average_15min: {
              value: "83817.61766667",
              window_size: 60,
              window_start_ts_ms: WINDOW_START,
              window_end_ts_exclusive: CLOSE_MS,
            },
            avg_60s_data: {
              value: "83817.70733333",
              window_size: 60,
              window_start_ts_ms: WINDOW_START,
              window_end_ts_exclusive: CLOSE_MS,
            },
          },
        }),
      }),
      JSON.stringify({
        receivedAtMs: CLOSE_MS + 1_098,
        receivedAtMonoMs: 719_007.601556,
        bytes: 10,
        payload: JSON.stringify({
          type: "cfbenchmarks_value",
          msg: {
            received_at: CLOSE_MS + 1_056,
            avg_60s_data: {
              value: "83817.61766667",
              window_size: 60,
              window_start_ts_ms: WINDOW_START + 1_000,
              window_end_ts_exclusive: CLOSE_MS + 1_000,
            },
          },
        }),
      }),
    ].join("\n");
    const chronology = extractCloseBoundaryChronology({ jsonl, closeMs: CLOSE_MS });
    expect(chronology.rows).toHaveLength(3);
    expect(chronology.rows[0]?.fieldName).toBe("last_60s_windowed_average_15min");
    expect(chronology.rows[0]?.valueRaw).toBe("83817.61766667");
    expect(chronology.rows[1]?.fieldName).toBe("avg_60s_data");
    expect(chronology.rows[1]?.valueRaw).toBe("83817.70733333");
    expect(chronology.rows[0]?.jsonlLine).toBe(chronology.rows[1]?.jsonlLine);
    expect(chronology.rows[2]?.valueRaw).toBe("83817.61766667");
    expect(chronology.rows[2]?.windowStartTsMs).toBe(WINDOW_START + 1_000);
  });
});

describe("analyzer uses bound completed settlement, not trailing or incomplete", () => {
  it("compares official expiration to the bound settlement field only", () => {
    const capture = {
      attempted: true,
      connected: true,
      connectionAttempts: 1,
      subscriptionAttempts: 1,
      channels: ["cfbenchmarks_value"],
      planned: {
        closeMs: CLOSE_MS,
        plannedStartMs: CLOSE_MS - 90_000,
        actualStartMs: CLOSE_MS - 90_000,
        stopMs: CLOSE_MS + 30_000,
        durationMs: 120_000,
        lateStart: false,
        closeIso: new Date(CLOSE_MS).toISOString(),
        plannedStartIso: new Date(CLOSE_MS - 90_000).toISOString(),
        actualStartIso: new Date(CLOSE_MS - 90_000).toISOString(),
        stopIso: new Date(CLOSE_MS + 30_000).toISOString(),
      },
      actualStartMs: CLOSE_MS - 90_000,
      actualStopMs: CLOSE_MS + 30_000,
      connectedBeforeWindow: false,
      limits: {
        messagesReceived: 2,
        rawBytes: 10,
        connectionAttemptsByStream: { "multiplexed-ws": 1 },
        startedAtMs: CLOSE_MS - 90_000,
        stopAtMs: CLOSE_MS + 30_000,
        shutdownRequested: true,
        stopReason: "planned-stop",
      },
      handshakeErrorCategory: null,
      events: [],
      cfbSummaries: [],
      venueAverages: [
        update({
          fieldName: "last_60s_windowed_average_15min",
          valueRaw: "83817.61766667",
          count: 60,
        }),
        update({
          fieldName: "avg_60s_data",
          valueRaw: "83817.70733333",
          count: 60,
        }),
      ],
      rawBrti: [],
      rawBrti1Hz: [],
      rawBrti5Hz: [],
      quotes: [],
      bookDiagnostics: { snapshots: 0, deltas: 0, gaps: 0, invalid: 0, reconnects: 0 },
      flushed: true,
      closedCleanly: true,
    } satisfies SynchronizedCaptureResult;
    const analysis = analyzeSynchronizedSession({
      capture,
      market: {
        ticker: "KXBTC15M-26SEP240015-15",
        eventTicker: "KXBTC15M-26SEP240015",
        seriesTicker: "KXBTC15M",
        closeTimeUtc: "2026-09-24T04:15:00.000Z",
        floorStrike: 83903.22,
        status: "active",
        openTimeUtc: "2026-09-24T04:00:00Z",
      },
      officialBody: {
        market: {
          ticker: "KXBTC15M-26SEP240015-15",
          event_ticker: "KXBTC15M-26SEP240015",
          series_ticker: "KXBTC15M",
          status: "active",
          open_time: "2026-09-24T04:00:00Z",
          close_time: "2026-09-24T04:15:00Z",
          floor_strike: 83903.22,
          expiration_value: "83817.71",
        },
      },
    });
    expect(analysis.completedSettlementAverage?.valueRaw).toBe("83817.61766667");
    expect(analysis.exploratoryTrailingAtClose?.valueRaw).toBe("83817.70733333");
    expect(analysis.officialComparison?.status).toBe("disagree");
    expect(analysis.officialComparison?.venueAverageRaw).toBe("83817.61766667");
    expect(analysis.futureQuoteLeakage).toBe(false);
    expect(analysis.completedSettlementSelection?.status).toBe("completed");
  });
});
