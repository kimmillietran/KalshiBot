import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KalshiWsHandshakeError,
  NodeKalshiAuthenticatedWsClient,
} from "@/lib/data/live/kalshiWsCaptureSpike";

/**
 * Real `ws` handshake regression: an ephemeral localhost HTTP server answers
 * the WebSocket upgrade with HTTP 401. No external network, no Kalshi
 * credentials. Proves connect() rejects normally instead of escaping as an
 * uncaughtException / unhandledRejection.
 */
describe("NodeKalshiAuthenticatedWsClient handshake rejection", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    }
  });

  async function start401Server(): Promise<string> {
    server = createServer((req, res) => {
      // Reject the WebSocket upgrade with HTTP 401 Unauthorized.
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("unauthorized");
    });

    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as AddressInfo;
    return `ws://127.0.0.1:${address.port}/`;
  }

  it("rejects connect with KalshiWsHandshakeError status 401 and settles once", async () => {
    const url = await start401Server();
    const client = new NodeKalshiAuthenticatedWsClient();

    const uncaught: unknown[] = [];
    const unhandled: unknown[] = [];
    const onUncaught = (error: unknown) => {
      uncaught.push(error);
    };
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("uncaughtException", onUncaught);
    process.on("unhandledRejection", onUnhandled);

    const onError = vi.fn();
    client.onError(onError);

    let rejection: unknown = null;
    try {
      await client.connect(url, {
        headers: { "X-Test": "handshake-401" },
      });
    } catch (error) {
      rejection = error;
    } finally {
      process.off("uncaughtException", onUncaught);
      process.off("unhandledRejection", onUnhandled);
    }

    expect(rejection).toBeInstanceOf(KalshiWsHandshakeError);
    const handshake = rejection as KalshiWsHandshakeError;
    expect(handshake.statusCode).toBe(401);
    expect(handshake.phase).toBe("handshake");
    expect(handshake.message).toContain("401");
    // Sanitized: no request headers, bodies, or credential material.
    expect(handshake.message).not.toContain("X-Test");
    expect(handshake.message).not.toContain("unauthorized");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(uncaught).toEqual([]);
    expect(unhandled).toEqual([]);

    // Failed socket is cleared; a subsequent close is a no-op.
    client.close();
  });

  it("does not reject twice when close follows the handshake error", async () => {
    const url = await start401Server();
    const client = new NodeKalshiAuthenticatedWsClient();
    const onError = vi.fn();
    client.onError(onError);

    await expect(client.connect(url)).rejects.toBeInstanceOf(KalshiWsHandshakeError);
    expect(onError).toHaveBeenCalledTimes(1);

    // Allow any trailing close/error ticks to flush; they must not notify again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
