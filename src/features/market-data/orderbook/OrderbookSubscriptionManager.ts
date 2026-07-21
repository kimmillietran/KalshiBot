import { ORDERBOOK_SUBSCRIPTION_ID_START } from "./constants";
import {
  kalshiOkResponseSchema,
  kalshiSubscribedResponseSchema,
  kalshiUnsubscribedResponseSchema,
  kalshiWsErrorResponseSchema,
} from "./schemas";
import type { KalshiWsTransport } from "./types";

/**
 * Explicit Kalshi orderbook price representation.
 *
 * "legacy-no-leg" = `use_yes_price: false`: yes-side levels are yes-leg
 * prices, no-side levels are no-leg prices (a no delta at 0.30 means
 * "no at 30c"). This matches the long-standing Kalshi default and the
 * existing book reconstruction (yesAsk = 100 - noBid).
 *
 * "unified-yes-leg" = `use_yes_price: true`: both sides reported in
 * yes-leg pricing. Not selected today; reconstruction would need to map
 * no-side prices back to no-leg before applying.
 */
export type KalshiOrderbookPriceRepresentation =
  | "legacy-no-leg"
  | "unified-yes-leg";

export const ORDERBOOK_PRICE_REPRESENTATION: KalshiOrderbookPriceRepresentation =
  "legacy-no-leg";

export const ORDERBOOK_USE_YES_PRICE = false;

export type OrderbookCommandKind =
  | "subscribe"
  | "unsubscribe"
  | "get_snapshot"
  | "add_markets"
  | "delete_markets";

export type OrderbookSubscriptionCommand = {
  id: number;
  cmd: "subscribe" | "unsubscribe" | "update_subscription";
  params: {
    channels?: ["orderbook_delta"];
    market_tickers?: string[];
    sids?: number[];
    action?: "add_markets" | "delete_markets" | "get_snapshot";
    use_yes_price?: boolean;
  };
};

export type PendingOrderbookCommand = {
  id: number;
  kind: OrderbookCommandKind;
  channel: "orderbook_delta";
  marketTickers: string[];
  sids: number[];
};

export type OrderbookServerSubscription = {
  sid: number;
  channel: string;
  marketTickers: string[];
};

export type OrderbookControlMessage =
  | {
    kind: "subscriptionAcknowledged";
    commandId: number | null;
    sid: number;
    channel: string;
    marketTickers: string[];
  }
  | {
    kind: "commandAcknowledged";
    commandId: number | null;
    commandKind: OrderbookCommandKind | null;
    sid: number | null;
    marketTickers: string[];
  }
  | {
    kind: "unsubscribeAcknowledged";
    commandId: number | null;
    sid: number | null;
    marketTickers: string[];
  }
  | {
    kind: "commandFailed";
    commandId: number | null;
    commandKind: OrderbookCommandKind | null;
    marketTickers: string[];
    errorCode: number | null;
    errorMessage: string;
  };

export type SnapshotRequestResult =
  | { status: "requested"; commandId: number; sid: number }
  | { status: "unavailable"; reason: "no-server-sid" };

export type UnsubscribeRequestResult = {
  requestedTickers: string[];
  commandIds: number[];
  /** Tickers with no acknowledged server subscription; no command could be sent. */
  unmappedTickers: string[];
};

/**
 * Builds Kalshi orderbook_delta commands and tracks the WebSocket command
 * lifecycle: local command id -> server subscription id (sid) -> markets.
 *
 * The locally generated command `id` is NOT the server subscription id.
 * The server assigns `sid` in the `subscribed` acknowledgement, and every
 * `update_subscription` / `unsubscribe` command must reference that sid.
 */
export class OrderbookSubscriptionManager {
  private nextCommandId = ORDERBOOK_SUBSCRIPTION_ID_START;
  private readonly pendingCommands = new Map<number, PendingOrderbookCommand>();
  private readonly subscriptionsBySid = new Map<number, OrderbookServerSubscription>();
  private readonly sidByTicker = new Map<string, number>();

  buildSubscribeCommand(tickers: string[]): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: tickers,
        use_yes_price: ORDERBOOK_USE_YES_PRICE,
      },
    };
  }

  buildSnapshotCommand(sid: number, tickers: string[]): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "update_subscription",
      params: {
        sids: [sid],
        market_tickers: tickers,
        action: "get_snapshot",
      },
    };
  }

  buildUnsubscribeCommand(sid: number): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "unsubscribe",
      params: {
        sids: [sid],
      },
    };
  }

  buildDeleteMarketsCommand(sid: number, tickers: string[]): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "update_subscription",
      params: {
        sids: [sid],
        market_tickers: tickers,
        action: "delete_markets",
      },
    };
  }

  subscribe(transport: KalshiWsTransport, ticker: string): number {
    const command = this.buildSubscribeCommand([ticker]);
    this.pendingCommands.set(command.id, {
      id: command.id,
      kind: "subscribe",
      channel: "orderbook_delta",
      marketTickers: [ticker],
      sids: [],
    });
    transport.send(JSON.stringify(command));
    return command.id;
  }

  requestSnapshot(transport: KalshiWsTransport, ticker: string): SnapshotRequestResult {
    const sid = this.sidByTicker.get(ticker);
    if (sid === undefined) {
      return { status: "unavailable", reason: "no-server-sid" };
    }

    const command = this.buildSnapshotCommand(sid, [ticker]);
    this.pendingCommands.set(command.id, {
      id: command.id,
      kind: "get_snapshot",
      channel: "orderbook_delta",
      marketTickers: [ticker],
      sids: [sid],
    });
    transport.send(JSON.stringify(command));
    return { status: "requested", commandId: command.id, sid };
  }

  unsubscribe(transport: KalshiWsTransport, tickers: string[]): UnsubscribeRequestResult {
    const result: UnsubscribeRequestResult = {
      requestedTickers: [],
      commandIds: [],
      unmappedTickers: [],
    };

    const tickersBySid = new Map<number, string[]>();
    for (const ticker of tickers) {
      const sid = this.sidByTicker.get(ticker);
      if (sid === undefined) {
        result.unmappedTickers.push(ticker);
        continue;
      }
      tickersBySid.set(sid, [...(tickersBySid.get(sid) ?? []), ticker]);
    }

    for (const [sid, sidTickers] of tickersBySid) {
      const subscription = this.subscriptionsBySid.get(sid);
      const removesWholeSubscription =
        !subscription
        || subscription.marketTickers.every((ticker) => sidTickers.includes(ticker));

      const command = removesWholeSubscription
        ? this.buildUnsubscribeCommand(sid)
        : this.buildDeleteMarketsCommand(sid, sidTickers);

      this.pendingCommands.set(command.id, {
        id: command.id,
        kind: removesWholeSubscription ? "unsubscribe" : "delete_markets",
        channel: "orderbook_delta",
        marketTickers: sidTickers,
        sids: [sid],
      });
      transport.send(JSON.stringify(command));
      result.requestedTickers.push(...sidTickers);
      result.commandIds.push(command.id);
    }

    return result;
  }

  /**
   * Parses a raw WS payload as an official control response and applies it
   * to the local command/subscription state. Returns null for market data
   * and unrecognized messages.
   */
  handleControlMessage(payload: unknown): OrderbookControlMessage | null {
    const subscribed = kalshiSubscribedResponseSchema.safeParse(payload);
    if (subscribed.success) {
      const commandId = subscribed.data.id ?? null;
      const pending = commandId !== null ? this.pendingCommands.get(commandId) : undefined;
      const marketTickers =
        subscribed.data.msg.market_tickers ?? pending?.marketTickers ?? [];
      const sid = subscribed.data.msg.sid;

      this.subscriptionsBySid.set(sid, {
        sid,
        channel: subscribed.data.msg.channel,
        marketTickers: [...marketTickers],
      });
      for (const ticker of marketTickers) {
        this.sidByTicker.set(ticker, sid);
      }
      if (commandId !== null) {
        this.pendingCommands.delete(commandId);
      }

      return {
        kind: "subscriptionAcknowledged",
        commandId,
        sid,
        channel: subscribed.data.msg.channel,
        marketTickers: [...marketTickers],
      };
    }

    const unsubscribedResult = kalshiUnsubscribedResponseSchema.safeParse(payload);
    if (unsubscribedResult.success) {
      const commandId = unsubscribedResult.data.id ?? null;
      const pending = commandId !== null ? this.pendingCommands.get(commandId) : undefined;
      const sid = unsubscribedResult.data.sid ?? pending?.sids[0] ?? null;
      const marketTickers = pending?.marketTickers
        ?? (sid !== null ? this.subscriptionsBySid.get(sid)?.marketTickers ?? [] : []);

      if (sid !== null) {
        this.removeSubscription(sid);
      }
      if (commandId !== null) {
        this.pendingCommands.delete(commandId);
      }

      return {
        kind: "unsubscribeAcknowledged",
        commandId,
        sid,
        marketTickers: [...marketTickers],
      };
    }

    const ok = kalshiOkResponseSchema.safeParse(payload);
    if (ok.success && typeof payload === "object" && payload !== null) {
      const commandId = ok.data.id ?? null;
      const pending = commandId !== null ? this.pendingCommands.get(commandId) : undefined;
      const sid = ok.data.sid ?? pending?.sids[0] ?? null;
      const marketTickers = this.extractMarketTickers(ok.data.msg)
        ?? pending?.marketTickers
        ?? [];

      if (pending?.kind === "delete_markets" && sid !== null) {
        this.removeMarketsFromSubscription(sid, pending.marketTickers);
      }
      if (pending?.kind === "unsubscribe" && sid !== null) {
        this.removeSubscription(sid);
      }
      if (commandId !== null) {
        this.pendingCommands.delete(commandId);
      }

      const acknowledgedKind = pending?.kind ?? null;
      if (acknowledgedKind === "unsubscribe" || acknowledgedKind === "delete_markets") {
        return {
          kind: "unsubscribeAcknowledged",
          commandId,
          sid,
          marketTickers: [...marketTickers],
        };
      }

      return {
        kind: "commandAcknowledged",
        commandId,
        commandKind: acknowledgedKind,
        sid,
        marketTickers: [...marketTickers],
      };
    }

    const error = kalshiWsErrorResponseSchema.safeParse(payload);
    if (error.success) {
      const commandId = error.data.id ?? null;
      const pending = commandId !== null ? this.pendingCommands.get(commandId) : undefined;
      if (commandId !== null) {
        this.pendingCommands.delete(commandId);
      }

      return {
        kind: "commandFailed",
        commandId,
        commandKind: pending?.kind ?? null,
        marketTickers: [...(pending?.marketTickers ?? [])],
        errorCode: error.data.msg.code ?? null,
        errorMessage: error.data.msg.msg,
      };
    }

    return null;
  }

  getActiveTickers(): readonly string[] {
    return [...this.sidByTicker.keys()];
  }

  getSidForTicker(ticker: string): number | null {
    return this.sidByTicker.get(ticker) ?? null;
  }

  getSubscriptions(): readonly OrderbookServerSubscription[] {
    return [...this.subscriptionsBySid.values()];
  }

  getPendingCommands(): readonly PendingOrderbookCommand[] {
    return [...this.pendingCommands.values()];
  }

  /** Server sids do not survive a socket; clear all mappings on reconnect. */
  resetForReconnect(): void {
    this.pendingCommands.clear();
    this.subscriptionsBySid.clear();
    this.sidByTicker.clear();
  }

  private removeSubscription(sid: number): void {
    const subscription = this.subscriptionsBySid.get(sid);
    this.subscriptionsBySid.delete(sid);
    for (const ticker of subscription?.marketTickers ?? []) {
      if (this.sidByTicker.get(ticker) === sid) {
        this.sidByTicker.delete(ticker);
      }
    }
  }

  private removeMarketsFromSubscription(sid: number, tickers: string[]): void {
    const subscription = this.subscriptionsBySid.get(sid);
    if (subscription) {
      subscription.marketTickers = subscription.marketTickers.filter(
        (ticker) => !tickers.includes(ticker),
      );
    }
    for (const ticker of tickers) {
      if (this.sidByTicker.get(ticker) === sid) {
        this.sidByTicker.delete(ticker);
      }
    }
  }

  private extractMarketTickers(msg: unknown): string[] | null {
    if (
      typeof msg === "object"
      && msg !== null
      && "market_tickers" in msg
      && Array.isArray((msg as { market_tickers: unknown }).market_tickers)
    ) {
      const tickers = (msg as { market_tickers: unknown[] }).market_tickers;
      if (tickers.every((ticker) => typeof ticker === "string")) {
        return tickers as string[];
      }
    }
    return null;
  }
}
