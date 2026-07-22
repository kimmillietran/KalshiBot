import type { IncomingMessage } from "node:http";
import type { ClientRequest } from "node:http";

import WebSocket from "ws";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";

import { KalshiWsHandshakeError } from "./kalshiWsHandshakeError";

type Handler = {
  onOpen?: () => void;
  onMessage?: (payload: string) => void;
  onClose?: (code?: number, reason?: string) => void;
  onError?: (error: Error) => void;
};

export type NodeKalshiWsConnectOptions = {
  headers?: Record<string, string>;
};

/**
 * Dispose of an unexpected HTTP upgrade response without retaining bodies.
 * Resume drains any buffered bytes; destroy closes the underlying socket.
 */
function disposeUnexpectedResponse(response: IncomingMessage): void {
  try {
    response.resume();
  } catch {
    // ignore
  }
  try {
    response.destroy();
  } catch {
    // ignore
  }
}

/**
 * Node `ws` transport with custom handshake headers for Kalshi authenticated
 * capture. Handshake rejections (e.g. HTTP 401) settle `connect()` as a
 * normal rejected Promise — they must never escape as uncaught exceptions.
 */
export class NodeKalshiAuthenticatedWsClient implements KalshiWsProbeTransport {
  private socket: WebSocket | null = null;
  private handlers: Handler = {};
  private pongHandler?: () => void;

  async connect(url: string, options?: NodeKalshiWsConnectOptions): Promise<void> {
    if (this.socket) {
      this.close();
    }

    await new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(url, {
          headers: options?.headers,
        });
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("WebSocket construction failed"),
        );
        return;
      }

      this.socket = socket;
      let opened = false;
      let settled = false;

      const settleReject = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        removePreOpenListeners();
        // Swallow late error/close emissions from destroying the failed
        // handshake socket so they cannot become uncaughtExceptions.
        socket.on("error", () => {});
        socket.on("close", () => {});
        // Notify the application error handler only for the first handshake
        // failure; later close/error noise must not duplicate it.
        try {
          this.handlers.onError?.(error);
        } catch {
          // Never throw from a WebSocket event callback.
        }
        clearFailedSocket();
        reject(error);
      };

      const settleResolve = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        opened = true;
        removePreOpenListeners();
        try {
          this.handlers.onOpen?.();
        } catch {
          // Never throw from a WebSocket event callback.
        }
        resolve();
      };

      const clearFailedSocket = (): void => {
        if (this.socket === socket) {
          this.socket = null;
        }
      };

      const onUnexpectedResponse = (
        request: ClientRequest,
        response: IncomingMessage,
      ): void => {
        disposeUnexpectedResponse(response);
        try {
          request.destroy();
        } catch {
          // ignore
        }
        const statusCode =
          typeof response.statusCode === "number" ? response.statusCode : null;
        const statusMessage =
          typeof response.statusMessage === "string" && response.statusMessage.length > 0
            ? response.statusMessage
            : null;
        const statusLabel = statusCode !== null ? String(statusCode) : "unknown";
        settleReject(
          new KalshiWsHandshakeError({
            message: `Unexpected server response: ${statusLabel}`,
            statusCode,
            statusMessage,
          }),
        );
      };

      const onOpen = (): void => {
        settleResolve();
      };

      const onError = (error: Error): void => {
        const wrapped =
          error instanceof Error ? error : new Error("WebSocket connection error");
        if (!opened) {
          // Pre-open transport errors (including the default ws abort path
          // when no unexpected-response listener ran) reject connect once.
          settleReject(
            wrapped instanceof KalshiWsHandshakeError
              ? wrapped
              : new KalshiWsHandshakeError({
                message: wrapped.message,
                statusCode: null,
                statusMessage: null,
              }),
          );
          return;
        }
        // Post-open errors notify the application without rejecting connect.
        try {
          this.handlers.onError?.(wrapped);
        } catch {
          // Never throw from a WebSocket event callback.
        }
      };

      const onClose = (code: number, reason: Buffer): void => {
        if (!opened && !settled) {
          settleReject(
            new KalshiWsHandshakeError({
              message: `WebSocket closed before open (code ${code})`,
              statusCode: null,
              statusMessage: null,
            }),
          );
          return;
        }
        try {
          this.handlers.onClose?.(code, reason.toString());
        } catch {
          // Never throw from a WebSocket event callback.
        }
      };

      const removePreOpenListeners = (): void => {
        socket.off("unexpected-response", onUnexpectedResponse);
        socket.off("open", onOpen);
        // Keep post-open error/close/message/pong handlers attached after a
        // successful open; only drop the handshake-specific unexpected-
        // response and the one-shot open listener.
        if (!opened) {
          socket.off("error", onError);
          socket.off("close", onClose);
        }
      };

      socket.on("unexpected-response", onUnexpectedResponse);
      socket.once("open", onOpen);
      socket.on("error", onError);
      socket.on("close", onClose);

      socket.on("message", (data) => {
        if (!opened) {
          return;
        }
        try {
          const payload = typeof data === "string" ? data : data.toString("utf8");
          this.handlers.onMessage?.(payload);
        } catch {
          // Never throw from a WebSocket event callback.
        }
      });

      socket.on("pong", () => {
        try {
          this.pongHandler?.();
        } catch {
          // Never throw from a WebSocket event callback.
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
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    try {
      this.socket?.terminate();
    } catch {
      // ignore
    }
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
