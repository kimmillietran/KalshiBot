import { describe, expect, it } from "vitest";

import {
  assignStepToEventWindow,
  buildEventStudyReport,
  computeEventStudyEventResult,
  filterStepsForEventWindow,
  marketOverlapsEventStudySpan,
  parseEventsJson,
  resolveEventStudyWindowConfig,
  serializeEventStudyReport,
} from "./index";

const GENERATED_AT = "2026-06-27T23:00:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = "data/research-results/event-study.json";
const EVENTS_PATH = "data/events/events.json";
const EVENT_TIME = "2026-06-27T12:30:00.000Z";
const EVENT_TIME_MS = Date.parse(EVENT_TIME);
const WINDOW_CONFIG = resolveEventStudyWindowConfig({
  beforeWindowMs: 10 * 60 * 1_000,
  duringWindowMs: 5 * 60 * 1_000,
  afterWindowMs: 10 * 60 * 1_000,
});

function createMarket(steps: Array<{
  timestampMs: number;
  spread?: number;
  vol?: number;
  probability?: number;
}>) {
  return {
    joinKey: "noop/KXBTC15M/MARKET-A",
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-MARKET-A",
    outputPath: `${INPUT_ROOT}/noop/KXBTC15M/MARKET-A/research-output.json`,
    marketOpenMs: EVENT_TIME_MS - 20 * 60 * 1_000,
    marketCloseMs: EVENT_TIME_MS + 20 * 60 * 1_000,
    totalPnlCents: 150,
    steps: steps.map((step, stepIndex) => ({
      stepIndex,
      timestampMs: step.timestampMs,
      impliedProbability: step.probability ?? 0.5,
      maxSpreadPercent: step.spread ?? 2,
      annualizedVolatility: step.vol ?? 0.25,
      observedOutcome: 1 as const,
    })),
  };
}

describe("parseEventsJson", () => {
  it("parses and sorts events deterministically", () => {
    const events = parseEventsJson(
      JSON.stringify([
        { eventId: "b-event", timestamp: "2026-06-27T13:00:00.000Z", type: "CPI" },
        { eventId: "a-event", timestamp: "2026-06-27T12:00:00.000Z", type: "FOMC" },
      ]),
    );

    expect(events.map((event) => event.eventId)).toEqual(["a-event", "b-event"]);
  });
});

describe("assignStepToEventWindow", () => {
  it("matches steps into before, during, and after windows", () => {
    expect(
      assignStepToEventWindow({
        stepTimestampMs: EVENT_TIME_MS - 5 * 60 * 1_000,
        eventTimeMs: EVENT_TIME_MS,
        windowConfig: WINDOW_CONFIG,
      }),
    ).toBe("before");

    expect(
      assignStepToEventWindow({
        stepTimestampMs: EVENT_TIME_MS + 2 * 60 * 1_000,
        eventTimeMs: EVENT_TIME_MS,
        windowConfig: WINDOW_CONFIG,
      }),
    ).toBe("during");

    expect(
      assignStepToEventWindow({
        stepTimestampMs: EVENT_TIME_MS + 8 * 60 * 1_000,
        eventTimeMs: EVENT_TIME_MS,
        windowConfig: WINDOW_CONFIG,
      }),
    ).toBe("after");
  });
});

describe("computeEventStudyEventResult", () => {
  it("computes window metrics and shifts for synthetic markets", () => {
    const market = createMarket([
      { timestampMs: EVENT_TIME_MS - 8 * 60 * 1_000, vol: 0.2, spread: 1 },
      { timestampMs: EVENT_TIME_MS - 2 * 60 * 1_000, vol: 0.22, spread: 1.2 },
      { timestampMs: EVENT_TIME_MS + 1 * 60 * 1_000, vol: 0.5, spread: 4 },
      { timestampMs: EVENT_TIME_MS + 8 * 60 * 1_000, vol: 0.45, spread: 3.5 },
    ]);

    const result = computeEventStudyEventResult({
      event: {
        eventId: "cpi-2026-05",
        timestamp: EVENT_TIME,
        type: "CPI",
        timestampMs: EVENT_TIME_MS,
      },
      markets: [market],
      windowConfig: WINDOW_CONFIG,
    });

    expect(result.windows.map((window) => window.window)).toEqual([
      "before",
      "during",
      "after",
    ]);
    expect(result.windows[0]?.marketCount).toBe(1);
    expect(result.windows[1]?.averageRealizedVolatilityAnnualized).toBeGreaterThan(
      result.windows[0]?.averageRealizedVolatilityAnnualized ?? 0,
    );
    expect(result.shifts.beforeToDuring.volatilityShift).toBeGreaterThan(0);
    expect(result.shifts.beforeToDuring.spreadShift).toBeGreaterThan(0);
    expect(result.windows[1]?.totalPnlCents).toBe(150);
  });

  it("handles overlapping events independently", () => {
    const market = createMarket([
      { timestampMs: EVENT_TIME_MS - 2 * 60 * 1_000 },
      { timestampMs: EVENT_TIME_MS + 2 * 60 * 1_000 },
    ]);

    const secondEventTimeMs = EVENT_TIME_MS + 10 * 60 * 1_000;

    const first = computeEventStudyEventResult({
      event: {
        eventId: "event-a",
        timestamp: EVENT_TIME,
        type: "CPI",
        timestampMs: EVENT_TIME_MS,
      },
      markets: [market],
      windowConfig: WINDOW_CONFIG,
    });
    const second = computeEventStudyEventResult({
      event: {
        eventId: "event-b",
        timestamp: new Date(secondEventTimeMs).toISOString(),
        type: "FOMC",
        timestampMs: secondEventTimeMs,
      },
      markets: [market],
      windowConfig: WINDOW_CONFIG,
    });

    expect(first.eventId).toBe("event-a");
    expect(second.eventId).toBe("event-b");
    expect(first.overlappingMarketCount).toBe(1);
    expect(second.overlappingMarketCount).toBe(1);
    expect(
      marketOverlapsEventStudySpan({
        marketOpenMs: market.marketOpenMs,
        marketCloseMs: market.marketCloseMs,
        eventTimeMs: secondEventTimeMs,
        windowConfig: WINDOW_CONFIG,
      }),
    ).toBe(true);
  });
});

describe("buildEventStudyReport", () => {
  it("handles empty events and empty scanned datasets", () => {
    const report = buildEventStudyReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      eventsPath: EVENTS_PATH,
      generatedAt: GENERATED_AT,
      events: [],
      scanned: [],
      windowConfig: WINDOW_CONFIG,
    });

    expect(report.sampleCounts.eventCount).toBe(0);
    expect(report.events).toEqual([]);
    expect(report.warnings.map((warning) => warning.code)).toContain("empty-events");
    expect(report.warnings.map((warning) => warning.code)).toContain("empty-dataset");
  });

  it("produces deterministic serialized output", () => {
    const market = createMarket([
      { timestampMs: EVENT_TIME_MS - 5 * 60 * 1_000 },
      { timestampMs: EVENT_TIME_MS + 2 * 60 * 1_000 },
    ]);

    const eventResult = computeEventStudyEventResult({
      event: {
        eventId: "cpi-2026-05",
        timestamp: EVENT_TIME,
        type: "CPI",
        timestampMs: EVENT_TIME_MS,
      },
      markets: [market],
      windowConfig: WINDOW_CONFIG,
    });

    const report = buildEventStudyReport({
      inputRoot: INPUT_ROOT,
      outputPath: OUTPUT_PATH,
      eventsPath: EVENTS_PATH,
      generatedAt: GENERATED_AT,
      events: [],
      scanned: [],
      windowConfig: WINDOW_CONFIG,
    });

    const mergedReport = {
      ...report,
      events: [eventResult],
      sampleCounts: {
        ...report.sampleCounts,
        eventCount: 1,
        analyzedMarketCount: 1,
      },
    };

    const first = serializeEventStudyReport(mergedReport);
    const second = serializeEventStudyReport(mergedReport);
    expect(first).toBe(second);
    expect(JSON.parse(first).events[0].eventId).toBe("cpi-2026-05");

    expect(
      filterStepsForEventWindow({
        steps: market.steps,
        event: {
          eventId: "cpi-2026-05",
          timestamp: EVENT_TIME,
          type: "CPI",
          timestampMs: EVENT_TIME_MS,
        },
        window: "during",
        windowConfig: WINDOW_CONFIG,
      }),
    ).toHaveLength(1);
  });
});
