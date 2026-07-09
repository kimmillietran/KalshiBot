import type { KalshiWsTransport } from "./types";

type Handler = {
  onOpen?: () => void;
  onMessage?: (payload: string) => void;
  onClose?: (code?: number, reason?: string) => void;
  onError?: (error: Error) => void;
};

/** Thin WebSocket wrapper implementing the injectable transport contract. */
export class KalshiOrderbookWsClient implements KalshiWsTransport {
  private socket: WebSocket | null = null;
  private handlers: Handler = {};

  constructor(private readonly WebSocketImpl: typeof WebSocket = WebSocket) {}

  async connect(url: string, _options?: { headers?: Record<string, string> }): Promise<void> {
    void _options;
    if (this.socket) {
      this.close();
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new this.WebSocketImpl(url);
      this.socket = socket;
      let opened = false;

      socket.onopen = () => {
        opened = true;
        this.handlers.onOpen?.();
        resolve();
      };

      socket.onmessage = (event) => {
        const payload =
          typeof event.data === "string"
            ? event.data
            : String(event.data);
        this.handlers.onMessage?.(payload);
      };

      socket.onclose = (event) => {
        this.handlers.onClose?.(event.code, event.reason);
      };

      socket.onerror = () => {
        const error = new Error("WebSocket connection error");
        this.handlers.onError?.(error);
        if (!opened) {
          reject(error);
        }
      };
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
}

/** In-memory transport for deterministic unit tests. */
export class MockKalshiWsTransport implements KalshiWsTransport {
  readonly sent: string[] = [];
  private handlers: Handler = {};

  async connect(url: string, _options?: { headers?: Record<string, string> }): Promise<void> {
    void _options;
    void url;
    this.handlers.onOpen?.();
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.handlers.onClose?.(1000, "mock-close");
  }

  emitMessage(payload: string): void {
    this.handlers.onMessage?.(payload);
  }

  emitClose(code = 1006, reason = "mock-close"): void {
    this.handlers.onClose?.(code, reason);
  }

  emitError(error: Error): void {
    this.handlers.onError?.(error);
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
}
