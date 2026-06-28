import { NextResponse } from "next/server";

import {
  fetchKalshiOrderbook,
  KalshiRequestTimeoutError,
} from "@/features/market-data/api/kalshiServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim();

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const orderbook = await fetchKalshiOrderbook(ticker);

    return NextResponse.json({
      ticker,
      yesLevels: orderbook.yesLevels,
      noLevels: orderbook.noLevels,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Kalshi orderbook";

    if (err instanceof KalshiRequestTimeoutError) {
      console.error("[kalshi] orderbook snapshot timed out");
      return NextResponse.json({ error: message }, { status: 504 });
    }

    const status = message.includes("rate limit") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
