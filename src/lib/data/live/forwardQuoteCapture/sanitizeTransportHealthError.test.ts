import { describe, expect, it } from "vitest";

import { KalshiWsHandshakeError } from "@/lib/data/live/kalshiWsCaptureSpike";

import {
  sanitizeReconnectFailureMessage,
  sanitizeTransportHealthError,
} from "./runLiveForwardQuoteCapture";

describe("sanitizeTransportHealthError / sanitizeReconnectFailureMessage", () => {
  it("sanitizes KalshiWsHandshakeError to a single HTTP status form", () => {
    const error = new KalshiWsHandshakeError({
      message: "Unexpected server response: 401",
      statusCode: 401,
      statusMessage: "Unauthorized",
    });

    const sanitized = sanitizeTransportHealthError(error);
    expect(sanitized).toBe(
      "WebSocket recovery connection failed: HTTP 401 Unauthorized",
    );
    expect(sanitized).not.toContain("Unexpected server response");
    expect(sanitizeReconnectFailureMessage(error, "handshake")).toBe(sanitized);
  });

  it("uses a safe generic form for non-handshake transport errors", () => {
    const error = new Error(
      "socket hang up with KALSHI-ACCESS-SIGNATURE=deadbeef and path=/trade-api/ws/v2",
    );
    expect(sanitizeTransportHealthError(error)).toBe("WebSocket transport error");
    expect(sanitizeTransportHealthError(error)).not.toContain("KALSHI-ACCESS");
    expect(sanitizeTransportHealthError(error)).not.toContain("deadbeef");
  });

  it("never embeds raw Error.message for generic reconnect failures", () => {
    const secret =
      "apiKey=KEYID-SECRET path=/home/user/private.pem signature=abcd body=xyz";
    const error = new Error(secret);
    const sanitized = sanitizeReconnectFailureMessage(error, "connection");
    expect(sanitized).toBe("WebSocket recovery connection failed");
    expect(sanitized).not.toContain("KEYID-SECRET");
    expect(sanitized).not.toContain("private.pem");
    expect(sanitized).not.toContain("abcd");
    expect(sanitized).not.toContain("xyz");

    expect(sanitizeReconnectFailureMessage(error, "auth-generation")).toBe(
      "WebSocket recovery authentication generation failed",
    );
    expect(sanitizeReconnectFailureMessage(error, "unexpected")).toBe(
      "WebSocket recovery failed unexpectedly",
    );
  });
});
