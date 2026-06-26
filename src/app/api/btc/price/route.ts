import { NextResponse } from "next/server";

/** Binance public 24hr ticker — no API key required. */
const BINANCE_TICKER_URL =
  "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT";

type BinanceTicker = {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
};

export async function GET() {
  try {
    const res = await fetch(BINANCE_TICKER_URL, {
      next: { revalidate: 0 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Binance ticker unavailable" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as BinanceTicker;

    return NextResponse.json({
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChange),
      change24hPercent: parseFloat(data.priceChangePercent),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch BTC price" },
      { status: 500 },
    );
  }
}
