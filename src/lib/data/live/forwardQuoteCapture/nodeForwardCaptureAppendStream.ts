import { createWriteStream } from "node:fs";

import type { ForwardCaptureAppendStream } from "./jsonlForwardCaptureWriter";

/**
 * Production append sink backed by a persistent Node fs.WriteStream in append
 * mode. write() returns false above the stream's high-water mark so the
 * buffered writer can queue instead of blocking the WebSocket event loop.
 */
export function createNodeForwardCaptureAppendStream(
  path: string,
): ForwardCaptureAppendStream {
  const stream = createWriteStream(path, { flags: "a", encoding: "utf8" });
  return {
    write(chunk) {
      return stream.write(chunk);
    },
    onceDrain(callback) {
      stream.once("drain", callback);
    },
    onError(callback) {
      stream.on("error", callback);
    },
    end() {
      return new Promise<void>((resolve, reject) => {
        stream.once("error", reject);
        stream.end(() => {
          resolve();
        });
      });
    },
  };
}
