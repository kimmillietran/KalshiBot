import { NextResponse } from "next/server";

import { discoverActiveBtcMarket } from "@/features/market-data/api/kalshiServer";

export async function GET() {
  try {
    const result = await discoverActiveBtcMarket();

    if (result.kind === "no-market") {
      return NextResponse.json({
        market: null,
        noMarket: true,
        message: result.message,
      });
    }

    return NextResponse.json({
      market: result.market,
      noMarket: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Kalshi market";

    const status = message.includes("rate limit") ? 429 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
