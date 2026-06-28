import { ORDERBOOK_SUBSCRIPTION_ID_START } from "./constants";
import type { KalshiWsTransport } from "./types";

export type OrderbookSubscriptionCommand = {
  id: number;
  cmd: "subscribe" | "unsubscribe" | "update_subscription";
  params: {
    channels: ["orderbook_delta"];
    market_tickers?: string[];
    action?: "add_markets" | "delete_markets" | "get_snapshot";
  };
};

/** Builds deterministic Kalshi orderbook_delta subscribe commands. */
export class OrderbookSubscriptionManager {
  private nextCommandId = ORDERBOOK_SUBSCRIPTION_ID_START;
  private activeTickers: string[] = [];

  buildSubscribeCommand(ticker: string): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: [ticker],
      },
    };
  }

  buildUnsubscribeCommand(tickers: string[]): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "update_subscription",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: tickers,
        action: "delete_markets",
      },
    };
  }

  buildSnapshotCommand(ticker: string): OrderbookSubscriptionCommand {
    return {
      id: this.nextCommandId++,
      cmd: "update_subscription",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: [ticker],
        action: "get_snapshot",
      },
    };
  }

  subscribe(transport: KalshiWsTransport, ticker: string): void {
    const command = this.buildSubscribeCommand(ticker);
    this.activeTickers = [ticker];
    transport.send(JSON.stringify(command));
  }

  unsubscribe(transport: KalshiWsTransport, tickers: string[]): void {
    if (tickers.length === 0) {
      return;
    }
    const command = this.buildUnsubscribeCommand(tickers);
    this.activeTickers = this.activeTickers.filter(
      (active) => !tickers.includes(active),
    );
    transport.send(JSON.stringify(command));
  }

  requestSnapshot(transport: KalshiWsTransport, ticker: string): void {
    const command = this.buildSnapshotCommand(ticker);
    transport.send(JSON.stringify(command));
  }

  getActiveTickers(): readonly string[] {
    return this.activeTickers;
  }
}
