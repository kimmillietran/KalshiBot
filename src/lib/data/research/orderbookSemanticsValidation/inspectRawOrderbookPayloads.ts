import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";

import { parseRawWsLine } from "@/lib/data/research/orderbookReconstructionAudit/replayRawOrderbookMessages";

import type { RawPayloadFieldSemantics } from "./orderbookSemanticsValidationTypes";

const EXPLICIT_ASK_PATTERNS = [
  "yes_ask",
  "no_ask",
  "yes_asks",
  "no_asks",
  "ask_dollars",
  "asks_fp",
] as const;

const EXPLICIT_BID_PATTERNS = [
  "yes_bid",
  "no_bid",
  "yes_bids",
  "no_bids",
  "bid_dollars",
] as const;

function collectFieldNames(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const names: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    names.push(path);
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      names.push(...collectFieldNames(nested, path));
    }
  }
  return names;
}

function matchPatterns(fieldNames: string[], patterns: readonly string[]): string[] {
  const found = new Set<string>();
  for (const name of fieldNames) {
    const lower = name.toLowerCase();
    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        found.add(name);
      }
    }
  }
  return [...found].sort();
}

export function inspectRawOrderbookPayloads(input: {
  lines: readonly string[];
  maxMessages: number;
}): RawPayloadFieldSemantics {
  const snapshotFields = new Set<string>();
  const deltaFields = new Set<string>();
  const priceFields = new Set<string>();
  const quantityFields = new Set<string>();
  const sideFields = new Set<string>();
  const sideValues = new Set<string>();
  const yesNoBidLadderFields = new Set<string>();
  let messagesScanned = 0;
  let malformedLineCount = 0;

  for (const line of input.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (messagesScanned >= input.maxMessages) {
      break;
    }

    const parsed = parseRawWsLine(trimmed);
    if (!parsed) {
      malformedLineCount += 1;
      continue;
    }
    messagesScanned += 1;

    if (parsed.messageType === "orderbook_snapshot") {
      const snap = kalshiOrderbookSnapshotMessageSchema.safeParse(parsed.rawPayload);
      if (snap.success) {
        for (const field of collectFieldNames(snap.data.msg)) {
          snapshotFields.add(field);
        }
        if (snap.data.msg.yes_dollars_fp) {
          yesNoBidLadderFields.add("yes_dollars_fp");
          priceFields.add("yes_dollars_fp.price_dollars");
          quantityFields.add("yes_dollars_fp.quantity_fp");
        }
        if (snap.data.msg.no_dollars_fp) {
          yesNoBidLadderFields.add("no_dollars_fp");
          priceFields.add("no_dollars_fp.price_dollars");
          quantityFields.add("no_dollars_fp.quantity_fp");
        }
      }
    }

    if (parsed.messageType === "orderbook_delta") {
      const delta = kalshiOrderbookDeltaMessageSchema.safeParse(parsed.rawPayload);
      if (delta.success) {
        for (const field of collectFieldNames(delta.data.msg)) {
          deltaFields.add(field);
        }
        sideFields.add("side");
        sideValues.add(delta.data.msg.side);
        priceFields.add("price_dollars");
        quantityFields.add("delta_fp");
      }
    }
  }

  const allFields = [...snapshotFields, ...deltaFields];
  const explicitAskFieldsFound = matchPatterns(allFields, EXPLICIT_ASK_PATTERNS);
  const explicitBidFieldsFound = matchPatterns(allFields, EXPLICIT_BID_PATTERNS);
  const notes: string[] = [];

  if (yesNoBidLadderFields.size > 0 && explicitAskFieldsFound.length === 0) {
    notes.push(
      "Observed yes_dollars_fp/no_dollars_fp bid ladders with no explicit ask ladder fields in snapshots.",
    );
  }
  if (explicitAskFieldsFound.length > 0) {
    notes.push(`Explicit ask-like fields detected: ${explicitAskFieldsFound.join(", ")}.`);
  }

  return {
    messagesScanned,
    malformedLineCount,
    snapshotFieldNames: [...snapshotFields].sort(),
    deltaFieldNames: [...deltaFields].sort(),
    priceFieldNames: [...priceFields].sort(),
    quantityFieldNames: [...quantityFields].sort(),
    sideFieldNames: [...sideFields].sort(),
    observedSideValues: [...sideValues].sort(),
    explicitAskFieldsFound,
    explicitBidFieldsFound,
    yesNoBidLadderFieldsFound: [...yesNoBidLadderFields].sort(),
    notes,
  };
}
