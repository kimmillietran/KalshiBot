import { z } from "zod";

import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
import { fetchWithTimeout } from "./fetchWithTimeout";
import type {
  BtcCandleInterval,
  BtcPriceProvider,
  BtcProviderCandle,
  BtcProviderPrice,
} from "./interface";

export const KRAKEN_API_BASE = "https://api.kraken.com/0/public";

const PAIR = "XBTUSD";

const krakenApiEnvelopeSchema = z.object({
  error: z.array(z.string()),
  result: z.record(z.string(), z.unknown()).optional(),
});

const krakenTickerPairSchema = z.object({
  c: z.tuple([z.string(), z.string()]),
  o: z.string(),
});

const krakenOhlcRowSchema = z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.number(),
]);

function parsePositiveNumber(value: string, field: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new BtcProviderMalformedResponseError(
      `Kraken ${field} is not a valid number`,
    );
  }
  return parsed;
}

function assertKrakenApiOk(
  envelope: z.infer<typeof krakenApiEnvelopeSchema>,
  context: string,
): void {
  if (envelope.error.length > 0) {
    throw new BtcProviderUnavailableError(
      502,
      `Kraken ${context} error: ${envelope.error.join(", ")}`,
    );
  }
}

async function handleUpstreamResponse(res: Response, context: string): Promise<Response> {
  if (res.status === 429) {
    throw new BtcProviderRateLimitError(`Kraken ${context} rate limit exceeded`);
  }

  if (res.status >= 500) {
    throw new BtcProviderUnavailableError(
      res.status,
      `Kraken ${context} unavailable (${res.status})`,
    );
  }

  if (!res.ok) {
    throw new BtcProviderUnavailableError(
      res.status,
      `Kraken ${context} request failed (${res.status})`,
    );
  }

  return res;
}

function formatCandleTime(timestampSec: number): string {
  return new Date(timestampSec * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type KrakenProviderOptions = {
  fetchImpl?: typeof fetch;
};

export function createKrakenBtcProvider(
  options: KrakenProviderOptions = {},
): BtcPriceProvider {
  const resolveFetch = () => options.fetchImpl ?? globalThis.fetch;

  return {
    id: "kraken",

    async getCurrentPrice(): Promise<BtcProviderPrice> {
      const url = `${KRAKEN_API_BASE}/Ticker?pair=${PAIR}`;

      let res: Response;
      try {
        res = await fetchWithTimeout(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          fetchImpl: resolveFetch(),
        });
      } catch (err) {
        if (err instanceof BtcProviderTimeoutError) throw err;
        throw new BtcProviderNetworkError(
          err instanceof Error ? err.message : "Kraken ticker network error",
        );
      }

      await handleUpstreamResponse(res, "ticker");

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new BtcProviderMalformedResponseError("Kraken ticker response is not JSON");
      }

      const envelope = krakenApiEnvelopeSchema.safeParse(json);
      if (!envelope.success) {
        throw new BtcProviderMalformedResponseError("Kraken ticker payload invalid");
      }

      assertKrakenApiOk(envelope.data, "ticker");

      const pairKey = Object.keys(envelope.data.result ?? {}).find((key) =>
        key.includes("XBT"),
      );
      const pairData = pairKey ? envelope.data.result?.[pairKey] : undefined;
      const parsedPair = krakenTickerPairSchema.safeParse(pairData);
      if (!parsedPair.success) {
        throw new BtcProviderMalformedResponseError("Kraken ticker pair missing fields");
      }

      const last = parsePositiveNumber(parsedPair.data.c[0], "last");
      const open = parsePositiveNumber(parsedPair.data.o, "open");
      const change24h = last - open;
      const change24hPercent = open === 0 ? 0 : (change24h / open) * 100;

      return {
        price: last,
        change24h,
        change24hPercent,
        updatedAt: new Date().toISOString(),
      };
    },

    async getCandles(
      interval: BtcCandleInterval,
      limit: number,
    ): Promise<BtcProviderCandle[]> {
      if (interval !== "1m") {
        throw new BtcProviderMalformedResponseError(`Kraken unsupported interval: ${interval}`);
      }

      const url = `${KRAKEN_API_BASE}/OHLC?pair=${PAIR}&interval=1`;

      let res: Response;
      try {
        res = await fetchWithTimeout(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          fetchImpl: resolveFetch(),
        });
      } catch (err) {
        if (err instanceof BtcProviderTimeoutError) throw err;
        throw new BtcProviderNetworkError(
          err instanceof Error ? err.message : "Kraken OHLC network error",
        );
      }

      await handleUpstreamResponse(res, "OHLC");

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new BtcProviderMalformedResponseError("Kraken OHLC response is not JSON");
      }

      const envelope = krakenApiEnvelopeSchema.safeParse(json);
      if (!envelope.success) {
        throw new BtcProviderMalformedResponseError("Kraken OHLC payload invalid");
      }

      assertKrakenApiOk(envelope.data, "OHLC");

      const pairKey = Object.keys(envelope.data.result ?? {}).find((key) =>
        key.includes("XBT"),
      );
      const rows = pairKey ? envelope.data.result?.[pairKey] : undefined;
      if (!Array.isArray(rows)) {
        throw new BtcProviderMalformedResponseError("Kraken OHLC rows missing");
      }

      const candles: BtcProviderCandle[] = [];
      for (const row of rows.slice(-limit)) {
        const parsed = krakenOhlcRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new BtcProviderMalformedResponseError("Kraken OHLC row malformed");
        }

        const [timestampSec, openStr, highStr, lowStr, closeStr] = parsed.data;
        candles.push({
          timestamp: timestampSec * 1000,
          time: formatCandleTime(timestampSec),
          open: parsePositiveNumber(openStr, "open"),
          high: parsePositiveNumber(highStr, "high"),
          low: parsePositiveNumber(lowStr, "low"),
          close: parsePositiveNumber(closeStr, "close"),
        });
      }

      return candles;
    },
  };
}

export const krakenBtcProvider = createKrakenBtcProvider();
