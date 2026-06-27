import { NextResponse } from "next/server";

import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
  fetchBtcSpotPrice,
} from "@/features/btc-feed/api/btcServer";

function mapBtcErrorToResponse(err: unknown) {
  if (err instanceof BtcProviderTimeoutError) {
    console.error("[btc] price request timed out");
    return NextResponse.json({ error: err.message }, { status: 504 });
  }

  if (err instanceof BtcProviderRateLimitError) {
    return NextResponse.json({ error: err.message }, { status: 429 });
  }

  if (err instanceof BtcProviderMalformedResponseError) {
    console.error("[btc] malformed price payload:", err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  if (err instanceof BtcProviderUnavailableError) {
    console.error(`[btc] upstream unavailable (${err.status}):`, err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  if (err instanceof BtcProviderNetworkError) {
    console.error("[btc] network error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const message = err instanceof Error ? err.message : "Failed to fetch BTC price";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const data = await fetchBtcSpotPrice();
    return NextResponse.json(data);
  } catch (err) {
    return mapBtcErrorToResponse(err);
  }
}
