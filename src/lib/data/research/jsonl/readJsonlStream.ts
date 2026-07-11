import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type JsonlStreamSummary = {
  linesRead: number;
  blankLinesSkipped: number;
  invalidLineCount: number;
  recordsHandled: number;
  truncated: boolean;
};

export type JsonlStreamOptions = {
  maxRecords?: number;
  onLine: (line: string, lineNumber: number) => "continue" | "stop" | "skip";
};

export async function readJsonlStream(
  path: string,
  options: JsonlStreamOptions,
): Promise<JsonlStreamSummary> {
  const summary: JsonlStreamSummary = {
    linesRead: 0,
    blankLinesSkipped: 0,
    invalidLineCount: 0,
    recordsHandled: 0,
    truncated: false,
  };

  const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;
  const stream = createReadStream(path, { encoding: "utf8" });
  const lineReader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  try {
    for await (const line of lineReader) {
      summary.linesRead += 1;
      const trimmed = line.trim();
      if (!trimmed) {
        summary.blankLinesSkipped += 1;
        continue;
      }

      if (summary.recordsHandled >= maxRecords) {
        summary.truncated = true;
        break;
      }

      const action = options.onLine(trimmed, summary.linesRead);
      if (action === "skip") {
        summary.invalidLineCount += 1;
        continue;
      }

      summary.recordsHandled += 1;
      if (action === "stop") {
        break;
      }
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }

  return summary;
}

export function iterateJsonlLines(
  lines: Iterable<string>,
  options: JsonlStreamOptions,
): JsonlStreamSummary {
  const summary: JsonlStreamSummary = {
    linesRead: 0,
    blankLinesSkipped: 0,
    invalidLineCount: 0,
    recordsHandled: 0,
    truncated: false,
  };

  const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;

  for (const line of lines) {
    summary.linesRead += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      summary.blankLinesSkipped += 1;
      continue;
    }

    if (summary.recordsHandled >= maxRecords) {
      summary.truncated = true;
      break;
    }

    const action = options.onLine(trimmed, summary.linesRead);
    if (action === "skip") {
      summary.invalidLineCount += 1;
      continue;
    }

    summary.recordsHandled += 1;
    if (action === "stop") {
      break;
    }
  }

  return summary;
}
