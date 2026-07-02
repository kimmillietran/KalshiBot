export type CliProgressRendererOptions = {
  isTty: boolean;
  nonTtyUpdateEvery?: number;
  write: (message: string) => void;
};

export type CliProgressRenderer = {
  render: (completed: number, total: number, lines: readonly string[]) => void;
  complete: (lines: readonly string[]) => void;
};

function shouldEmitNonTtyUpdate(
  completed: number,
  total: number,
  updateEvery: number,
): boolean {
  if (completed >= total) {
    return true;
  }

  if (completed <= 0) {
    return false;
  }

  return completed % updateEvery === 0;
}

/** Renders multiline CLI progress to stderr with TTY redraw or periodic non-TTY updates. */
export function createCliProgressRenderer(
  options: CliProgressRendererOptions,
): CliProgressRenderer {
  const updateEvery = options.nonTtyUpdateEvery ?? 10;
  let previousLineCount = 0;
  let lastNonTtyCompleted = 0;

  const writeBlock = (lines: readonly string[], finalize: boolean) => {
    const block = `${lines.join("\n")}\n`;

    if (options.isTty) {
      if (previousLineCount > 0) {
        options.write(`\x1b[${previousLineCount}A`);
      }

      for (const line of lines) {
        options.write(`\x1b[2K${line}\n`);
      }

      previousLineCount = lines.length;

      if (finalize) {
        options.write("\n");
        previousLineCount = 0;
      }

      return;
    }

    options.write(block);
  };

  return {
    render(completed, total, lines) {
      if (
        !options.isTty
        && !shouldEmitNonTtyUpdate(completed, total, updateEvery)
      ) {
        return;
      }

      if (
        !options.isTty
        && completed === lastNonTtyCompleted
        && completed < total
      ) {
        return;
      }

      if (!options.isTty) {
        lastNonTtyCompleted = completed;
      }

      writeBlock(lines, false);
    },
    complete(lines) {
      writeBlock(lines, true);
      lastNonTtyCompleted = 0;
      previousLineCount = 0;
    },
  };
}

/** Detects whether interactive progress rendering should be enabled. */
export function isCliProgressTty(stream: { isTTY?: boolean } = process.stderr): boolean {
  return Boolean(stream.isTTY);
}
