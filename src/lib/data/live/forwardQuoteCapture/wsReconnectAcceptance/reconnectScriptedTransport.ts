import { createHash } from "node:crypto";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import { KalshiWsHandshakeError } from "@/lib/data/live/kalshiWsCaptureSpike";

import type { WsReconnectAcceptanceScenario } from "./wsReconnectAcceptanceTypes";

export type ReconnectConnectAttemptRecord = {
  timestamp: string;
  /** Full signature value from the test/mock signer — fake only, never real keys. */
  signature: string;
  headers: Record<string, string>;
};

function signatureHashPrefix(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 16);
}

/**
 * Deterministic Kalshi WebSocket transport for reconnect acceptance.
 *
 * Records every connect's auth headers, enforces fresh-header contracts on
 * reconnect, and replays subscribe → subscribed+snapshot (+ optional deltas).
 * Server responses are delivered asynchronously on the microtask queue.
 */
export class ReconnectScriptedTransport implements KalshiWsProbeTransport {
  readonly sentCommands: Array<Record<string, unknown>> = [];
  /** Headers passed to each connect() (for credential-hygiene scans). */
  connectHeaderValues: string[] = [];
  connectCount = 0;
  /**
   * Every connect attempt with timestamp + signature identity for assertions.
   * Signature is the header value from the test/ephemeral signer — fake only.
   */
  readonly connectAttempts: ReconnectConnectAttemptRecord[] = [];

  private nextSid = 1;
  private onMessageHandler: ((payload: string) => void) | null = null;
  private onErrorHandler: ((error: Error) => void) | null = null;
  /** Successful reconnects that delivered a post-reconnect book for this market. */
  private resubscribed = new Set<string>();
  private firstAttempt: ReconnectConnectAttemptRecord | null = null;
  /** How many reconnect connect() calls have been attempted (connectCount > 1). */
  private reconnectConnectCount = 0;

  constructor(
    private readonly options: {
      scenario: WsReconnectAcceptanceScenario;
      primaryMarketTicker: string;
      transcript: string[];
      /** Invoked just before a reconnect connect() so the harness can advance wall clock. */
      onBeforeReconnectConnect?: () => void;
    },
  ) {}

  private emit(payload: Record<string, unknown>, note: string): void {
    this.options.transcript.push(`received ${note}`);
    const serialized = JSON.stringify(payload);
    queueMicrotask(() => {
      this.onMessageHandler?.(serialized);
    });
  }

  private snapshot(sid: number, seq: number, ticker: string) {
    return {
      type: "orderbook_snapshot",
      sid,
      seq,
      msg: {
        market_ticker: ticker,
        market_id: "reconnect-acceptance-market-id",
        yes_dollars_fp: [["0.4500", "100.00"]],
        no_dollars_fp: [["0.5000", "80.00"]],
      },
    };
  }

  private delta(sid: number, seq: number, ticker: string) {
    return {
      type: "orderbook_delta",
      sid,
      seq,
      msg: {
        market_ticker: ticker,
        market_id: "reconnect-acceptance-market-id",
        price_dollars: "0.4600",
        delta_fp: "5.00",
        side: "yes" as const,
      },
    };
  }

  private recordAttempt(headers: Record<string, string>): ReconnectConnectAttemptRecord {
    const timestamp = headers["KALSHI-ACCESS-TIMESTAMP"] ?? "";
    const signature = headers["KALSHI-ACCESS-SIGNATURE"] ?? "";
    const record: ReconnectConnectAttemptRecord = {
      timestamp,
      signature,
      headers: { ...headers },
    };
    this.connectAttempts.push(record);
    this.connectHeaderValues = Object.values(headers);
    this.options.transcript.push(
      `connect attempt #${this.connectCount} `
        + `timestamp=${timestamp || "(missing)"} `
        + `signatureHash=${signatureHashPrefix(signature)} `
        + `signatureLast4=${signature.slice(-4) || "(missing)"}`,
    );
    return record;
  }

  private assertFreshHeaders(attempt: ReconnectConnectAttemptRecord): void {
    if (this.firstAttempt === null) {
      return;
    }
    const sameTimestamp = attempt.timestamp === this.firstAttempt.timestamp;
    const sameSignature = attempt.signature === this.firstAttempt.signature;
    if (sameTimestamp || sameSignature) {
      const message =
        "Stale WebSocket auth headers reused on reconnect "
        + `(timestampEqual=${sameTimestamp} signatureEqual=${sameSignature})`;
      this.options.transcript.push(`rejected reconnect: ${message}`);
      throw new Error(message);
    }
    this.options.transcript.push(
      "accepted reconnect with fresh auth headers "
        + `(timestamp≠first signature≠first)`,
    );
  }

  private throw401(attemptLabel: string): never {
    const error = new KalshiWsHandshakeError({
      message: "Unexpected server response: 401",
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
    this.options.transcript.push(
      `reconnect ${attemptLabel} rejected with KalshiWsHandshakeError HTTP 401`,
    );
    this.onErrorHandler?.(error);
    throw error;
  }

  async connect(
    _url: string,
    options?: { headers?: Record<string, string> },
  ): Promise<void> {
    this.connectCount += 1;
    const headers = options?.headers ?? {};
    const isReconnect = this.connectCount > 1;

    if (isReconnect) {
      this.options.onBeforeReconnectConnect?.();
      this.reconnectConnectCount += 1;
    }

    const attempt = this.recordAttempt(headers);

    if (!isReconnect) {
      this.firstAttempt = attempt;
      this.options.transcript.push(
        "connected (authenticated WebSocket handshake — initial)",
      );
      return;
    }

    const scenario = this.options.scenario;

    if (scenario === "reconnect-401-terminal") {
      this.throw401(`#${this.reconnectConnectCount}`);
    }

    if (scenario === "auth-generation-throw") {
      // Header-factory throw is injected by the harness when available; the
      // transport fallback rejects every reconnect so the failure stays
      // contained without contacting Kalshi.
      this.options.transcript.push(
        "auth-generation-throw transport fallback: rejecting reconnect connect",
      );
      const error = new Error("auth header generation failed (scripted)");
      this.onErrorHandler?.(error);
      throw error;
    }

    if (scenario === "second-attempt-success") {
      if (this.reconnectConnectCount === 1) {
        this.throw401("#1 (first reconnect; second attempt should succeed)");
      }
      this.assertFreshHeaders(attempt);
      this.options.transcript.push(
        "connected (authenticated WebSocket handshake — second reconnect attempt)",
      );
      return;
    }

    // reconnect-success: reject stale headers, accept fresh ones.
    this.assertFreshHeaders(attempt);
    this.options.transcript.push(
      "connected (authenticated WebSocket handshake — reconnect)",
    );
  }

  send(payload: string): void {
    const command = JSON.parse(payload) as Record<string, unknown>;
    this.sentCommands.push(command);
    const params = (command.params ?? {}) as Record<string, unknown>;

    if (command.cmd === "subscribe") {
      const ticker = (params.market_tickers as string[])[0]!;
      const sid = this.nextSid++;
      this.options.transcript.push(
        `sent subscribe id=${command.id} sid→${sid} [${ticker}]`,
      );

      this.emit(
        {
          id: command.id,
          type: "subscribed",
          msg: { channel: "orderbook_delta", sid },
        },
        `subscribed ack sid=${sid} [${ticker}]`,
      );

      const isResubscribe = this.resubscribed.has(ticker);
      const snapshotSeq = isResubscribe ? 200 : 1;
      this.emit(
        this.snapshot(sid, snapshotSeq, ticker),
        `orderbook_snapshot seq=${snapshotSeq} [${ticker}]`
          + (isResubscribe ? " (post-reconnect)" : ""),
      );

      if (!isResubscribe && ticker === this.options.primaryMarketTicker) {
        this.emit(
          this.delta(sid, 2, ticker),
          `orderbook_delta seq=2 [${ticker}]`,
        );
      }

      this.resubscribed.add(ticker);
      return;
    }

    if (command.cmd === "update_subscription" && params.action === "get_snapshot") {
      const sid = (params.sids as number[])[0]!;
      const ticker = (params.market_tickers as string[])[0]!;
      this.options.transcript.push(
        `sent update_subscription get_snapshot id=${command.id} sid=${sid} [${ticker}]`,
      );
      this.emit(
        {
          id: command.id,
          sid,
          seq: 99,
          type: "ok",
          msg: { market_tickers: [ticker] },
        },
        `ok ack for get_snapshot id=${command.id} sid=${sid}`,
      );
      this.emit(
        this.snapshot(sid, 100, ticker),
        `orderbook_snapshot seq=100 [${ticker}] (get_snapshot recovery)`,
      );
      return;
    }

    if (command.cmd === "unsubscribe") {
      const sid = (params.sids as number[])[0];
      this.options.transcript.push(
        `sent unsubscribe id=${command.id} sid=${sid}`,
      );
      this.emit(
        { id: command.id, sid, seq: 300, type: "unsubscribed" },
        `unsubscribed ack for id=${command.id} sid=${sid}`,
      );
    }
  }

  close(): void {
    this.options.transcript.push("transport closed");
  }

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    void handler;
    // Intentionally no-op: invoking onClose from close() races plannedShutdown
    // in the live capture recovery path (same as AcceptanceScriptedTransport).
  }

  onError(handler: (error: Error) => void): void {
    this.onErrorHandler = handler;
  }

  ping(): void {}

  onPong(): void {}
}
