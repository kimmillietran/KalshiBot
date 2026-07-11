import WebSocket from "ws";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

type Handler = {
  onOpen?: () => void;
  onMessage?: (payload: string) => void;
  onClose?: (code?: number, reason?: string) => void;
  onError?: (error: Error) => void;
};

export type NodeKalshiWsConnectOptions = {
  headers?: Record<string, string>;
};

/** Node `ws` transport with custom handshake headers for Kalshi authenticated capture. */
export class NodeKalshiAuthenticatedWsClient implements KalshiWsProbeTransport {
  private socket: WebSocket | null = null;
  private handlers: Handler = {};
  private pongHandler?: () => void;

  async connect(url: string, options?: NodeKalshiWsConnectOptions): Promise<void> {
    if (this.socket) {
      this.close();
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: options?.headers,
      });
      this.socket = socket;
      let opened = false;

      socket.once("open", () => {
        opened = true;
        this.handlers.onOpen?.();
        resolve();
      });

      socket.on("message", (data) => {
        const payload = typeof data === "string" ? data : data.toString("utf8");
        this.handlers.onMessage?.(payload);
      });

      socket.on("pong", () => {
        this.pongHandler?.();
      });

      socket.once("close", (code, reason) => {
        this.handlers.onClose?.(code, reason.toString());
      });

      socket.once("error", (error) => {
        const wrapped =
          error instanceof Error ? error : new Error("WebSocket connection error");
        this.handlers.onError?.(wrapped);
        if (!opened) {
          reject(wrapped);
        }
      });
    });
  }

  send(payload: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.socket.send(payload);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  onOpen(handler: () => void): void {
    this.handlers.onOpen = handler;
  }

  onMessage(handler: (payload: string) => void): void {
    this.handlers.onMessage = handler;
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    this.handlers.onClose = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.handlers.onError = handler;
  }

  ping(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.socket.ping();
  }

  onPong(handler: () => void): void {
    this.pongHandler = handler;
  }
}
