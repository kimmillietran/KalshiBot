/**
 * Sanitized WebSocket handshake rejection. Carries only safe metadata
 * (HTTP status / phase) — never request headers, signatures, API key IDs,
 * private-key material, or response bodies.
 */
export class KalshiWsHandshakeError extends Error {
  readonly statusCode: number | null;
  readonly statusMessage: string | null;
  readonly phase = "handshake" as const;

  constructor(input: {
    message: string;
    statusCode?: number | null;
    statusMessage?: string | null;
  }) {
    super(input.message);
    this.name = "KalshiWsHandshakeError";
    this.statusCode = input.statusCode ?? null;
    this.statusMessage = input.statusMessage ?? null;
  }
}
