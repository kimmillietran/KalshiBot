import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

import type { RecoveryAcceptanceScenario } from "./captureRecoveryAcceptanceTypes";

/**
 * Deterministic Kalshi WebSocket transport for the recovery acceptance
 * harness. It speaks the official control protocol and replays one exact
 * recovery scenario for the primary market:
 *
 * subscribe            -> subscribed ack (server sid) + snapshot(seq 1)
 *                          + deltas(seq 2, 3) + intentional gap delta(seq 10)
 * get_snapshot (sid)   -> deltas(seq 11, 12) arriving while recovery is
 *                          pending + ok ack + fresh snapshot(seq 100)
 *                          + post-recovery deltas(seq 101, 102)
 * unsubscribe (sid)    -> unsubscribed ack
 *
 * Scenario variants intentionally break one contract so the acceptance
 * evaluation can be proven to fail closed.
 */
export class AcceptanceScriptedTransport implements KalshiWsProbeTransport {
  readonly sentCommands: Array<Record<string, unknown>> = [];
  /** Headers passed to connect(); used by the credential-hygiene scan. */
  connectHeaderValues: string[] = [];
  connectCount = 0;

  private nextSid = 1;
  private gapInjectedFor = new Set<string>();
  private onMessageHandler: ((payload: string) => void) | null = null;

  constructor(
    private readonly options: {
      scenario: RecoveryAcceptanceScenario;
      /** The market that receives the scripted gap/recovery lifecycle. */
      primaryMarketTicker: string;
      transcript: string[];
    },
  ) {}

  private emit(payload: Record<string, unknown>, note: string): void {
    this.options.transcript.push(`received ${note}`);
    this.onMessageHandler?.(JSON.stringify(payload));
  }

  private snapshot(sid: number, seq: number, ticker: string) {
    return {
      type: "orderbook_snapshot",
      sid,
      seq,
      msg: {
        market_ticker: ticker,
        market_id: "acceptance-market-id",
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
        market_id: "acceptance-market-id",
        price_dollars: "0.4600",
        delta_fp: "5.00",
        side: "yes" as const,
      },
    };
  }

  async connect(
    _url: string,
    options?: { headers?: Record<string, string> },
  ): Promise<void> {
    this.connectCount += 1;
    this.connectHeaderValues = Object.values(options?.headers ?? {});
    this.options.transcript.push("connected (authenticated WebSocket handshake)");
  }

  send(payload: string): void {
    const command = JSON.parse(payload) as Record<string, unknown>;
    this.sentCommands.push(command);
    const params = (command.params ?? {}) as Record<string, unknown>;

    if (command.cmd === "subscribe") {
      const ticker = (params.market_tickers as string[])[0];
      const sid = this.nextSid++;
      this.options.transcript.push(`sent subscribe id=${command.id} [${ticker}]`);

      if (this.options.scenario === "missing-sid") {
        this.emit(
          {
            id: command.id,
            type: "subscribed",
            msg: { channel: "orderbook_delta" },
          },
          `subscribed ack WITHOUT sid [${ticker}]`,
        );
      } else {
        this.emit(
          {
            id: command.id,
            type: "subscribed",
            msg: { channel: "orderbook_delta", sid },
          },
          `subscribed ack sid=${sid} [${ticker}]`,
        );
      }

      this.emit(this.snapshot(sid, 1, ticker), `orderbook_snapshot seq=1 [${ticker}]`);

      if (
        ticker === this.options.primaryMarketTicker
        && !this.gapInjectedFor.has(ticker)
      ) {
        this.gapInjectedFor.add(ticker);
        this.emit(this.delta(sid, 2, ticker), `orderbook_delta seq=2 [${ticker}]`);
        this.emit(this.delta(sid, 3, ticker), `orderbook_delta seq=3 [${ticker}]`);
        this.emit(
          this.delta(sid, 10, ticker),
          `orderbook_delta seq=10 [${ticker}] (intentional sequence discontinuity)`,
        );
      }
      return;
    }

    if (command.cmd === "update_subscription" && params.action === "get_snapshot") {
      const sid = (params.sids as number[])[0];
      const ticker = (params.market_tickers as string[])[0];
      this.options.transcript.push(
        `sent update_subscription get_snapshot id=${command.id} sid=${sid} [${ticker}]`,
      );

      this.emit(
        this.delta(sid, 11, ticker),
        `orderbook_delta seq=11 [${ticker}] (recovery pending; must be quarantined)`,
      );
      this.emit(
        this.delta(sid, 12, ticker),
        `orderbook_delta seq=12 [${ticker}] (recovery pending; must be quarantined)`,
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

      if (this.options.scenario === "no-fresh-snapshot") {
        return;
      }

      this.emit(
        this.snapshot(sid, 100, ticker),
        `orderbook_snapshot seq=100 [${ticker}] (fresh recovery snapshot)`,
      );
      this.emit(
        this.delta(sid, 101, ticker),
        `orderbook_delta seq=101 [${ticker}] (post-recovery)`,
      );
      this.emit(
        this.delta(sid, 102, ticker),
        `orderbook_delta seq=102 [${ticker}] (post-recovery)`,
      );
      return;
    }

    if (command.cmd === "unsubscribe") {
      const sid = (params.sids as number[])[0];
      this.options.transcript.push(
        `sent unsubscribe id=${command.id} sid=${sid}`,
      );
      this.emit(
        { id: command.id, sid, seq: 200, type: "unsubscribed" },
        `unsubscribed ack for id=${command.id} sid=${sid}`,
      );
    }
  }

  close(): void {
    this.options.transcript.push("transport closed (graceful shutdown)");
  }

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(): void {}

  onError(): void {}

  ping(): void {}

  onPong(): void {}
}
