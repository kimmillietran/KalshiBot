export type CopyTextResult =
  | { ok: true }
  | { ok: false; error: string };

export type ClipboardLike = {
  writeText(text: string): Promise<void>;
};

/** Injectable clipboard helper for tests and environments without navigator.clipboard. */
export async function copyTextToClipboard(
  text: string,
  clipboard?: ClipboardLike | null,
): Promise<CopyTextResult> {
  const writer = clipboard ?? globalThis.navigator?.clipboard;

  if (!writer?.writeText) {
    return { ok: false, error: "Clipboard unavailable" };
  }

  try {
    await writer.writeText(text);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Copy failed",
    };
  }
}
