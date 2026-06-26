import { NextResponse } from "next/server";

/** Binance public 1m klines — no API key required. */
const BINANCE_KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30";

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

function formatCandleTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function GET() {
  try {
    const res = await fetch(BINANCE_KLINES_URL, {
      next: { revalidate: 0 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Binance klines unavailable" },
        { status: 502 },
      );
    }

    const rows = (await res.json()) as BinanceKline[];

    const candles = rows.map((row) => {
      const open = parseFloat(row[1]);
      const high = parseFloat(row[2]);
      const low = parseFloat(row[3]);
      const close = parseFloat(row[4]);
      const timestamp = row[0];

      return {
        timestamp,
        time: formatCandleTime(timestamp),
        open,
        high,
        low,
        close,
      };
    });

    return NextResponse.json({ candles });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch BTC candles" },
      { status: 500 },
    );
  }
}
