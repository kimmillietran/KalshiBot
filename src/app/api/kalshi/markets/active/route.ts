import { NextResponse } from "next/server";

import {
  discoverActiveBtcMarket,
} from "@/features/market-data/api/kalshiServer";
import { KalshiRequestTimeoutError } from "@/features/market-data/api/fetchWithTimeout";

export async function GET() {
  try {
    const result = await discoverActiveBtcMarket();

    if (result.kind === "no-market") {
      return NextResponse.json({
        market: null,
        pricing: null,
        noMarket: true,
        message: result.message,
      });
    }

    return NextResponse.json({
      market: result.market,
      pricing: result.pricing,
      noMarket: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch Kalshi market";

    if (err instanceof KalshiRequestTimeoutError) {
      console.error("[kalshi] active market discovery timed out");
      return NextResponse.json({ error: message }, { status: 504 });
    }

    const status = message.includes("rate limit") ? 429 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
