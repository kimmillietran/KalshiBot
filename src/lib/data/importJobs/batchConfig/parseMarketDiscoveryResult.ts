import type {
  DiscoveredMarket,
  MarketDiscoveryMetadata,
  MarketDiscoveryProvenance,
  MarketDiscoveryResult,
  MarketDiscoveryValidationIssue,
  MarketDiscoveryValidationResult,
} from "@/lib/data/discovery";
import { MarketDiscoveryErrorCode } from "@/lib/data/discovery";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import { discoveredMarketToKalshiListWireShape } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

import {
  BatchImportConfigError,
  BatchImportConfigErrorCode,
} from "./batchImportConfigTypes";

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BatchImportConfigError(
      `${label} must be a plain object`,
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }
}

function readNonEmptyString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BatchImportConfigError(
      `${label} is required`,
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  return value.trim();
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BatchImportConfigError(
      "Discovery market string fields must be strings or null",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseProvenance(value: unknown): MarketDiscoveryProvenance {
  assertPlainObject(value, "market provenance");

  return {
    source: readNonEmptyString(value.source, "provenance.source") as MarketDiscoveryProvenance["source"],
    fetchedAt: readNonEmptyString(value.fetchedAt, "provenance.fetchedAt"),
    requestPath: readNonEmptyString(value.requestPath, "provenance.requestPath"),
    cursor:
      value.cursor === null || value.cursor === undefined
        ? undefined
        : String(value.cursor),
  };
}

function parseListMarketWire(
  value: unknown,
  market: Pick<
    DiscoveredMarket,
    | "marketTicker"
    | "eventTicker"
    | "seriesTicker"
    | "status"
    | "openTime"
    | "closeTime"
    | "settlementTime"
    | "expirationValue"
    | "title"
    | "subtitle"
  >,
): KalshiMarketWireShape {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as KalshiMarketWireShape;
  }

  return discoveredMarketToKalshiListWireShape(market);
}

function parseDiscoveredMarket(value: unknown): DiscoveredMarket {
  assertPlainObject(value, "discovered market");

  const marketFields = {
    marketTicker: readNonEmptyString(value.marketTicker, "marketTicker"),
    eventTicker: readNonEmptyString(value.eventTicker, "eventTicker"),
    seriesTicker: readNonEmptyString(value.seriesTicker, "seriesTicker"),
    title: readNullableString(value.title),
    subtitle: readNullableString(value.subtitle),
    status: readNonEmptyString(value.status, "status"),
    openTime: readNullableString(value.openTime),
    closeTime: readNullableString(value.closeTime),
    settlementTime: readNullableString(value.settlementTime),
    expirationValue: readNullableString(value.expirationValue),
  };

  return {
    ...marketFields,
    listMarketWire: parseListMarketWire(value.listMarketWire, marketFields),
    provenance: parseProvenance(value.provenance),
  };
}

function parseValidation(value: unknown): MarketDiscoveryValidationResult {
  assertPlainObject(value, "validation");

  if (typeof value.valid !== "boolean") {
    throw new BatchImportConfigError(
      "validation.valid must be a boolean",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  const readIssues = (issues: unknown, label: string): MarketDiscoveryValidationIssue[] => {
    if (!Array.isArray(issues)) {
      throw new BatchImportConfigError(
        `${label} must be an array`,
        BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
      );
    }

    return issues.map((issue) => {
      assertPlainObject(issue, label);
      const errorCode = readNonEmptyString(issue.errorCode, `${label}.errorCode`);
      if (
        !Object.values(MarketDiscoveryErrorCode).includes(
          errorCode as MarketDiscoveryValidationIssue["errorCode"],
        )
      ) {
        throw new BatchImportConfigError(
          `${label}.errorCode is invalid`,
          BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
        );
      }

      const severity = readNonEmptyString(issue.severity, `${label}.severity`);
      if (severity !== "error" && severity !== "warning") {
        throw new BatchImportConfigError(
          `${label}.severity must be error or warning`,
          BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
        );
      }

      return {
        errorCode: errorCode as MarketDiscoveryValidationIssue["errorCode"],
        severity,
        message: readNonEmptyString(issue.message, `${label}.message`),
        ...(typeof issue.marketTicker === "string"
          ? { marketTicker: issue.marketTicker }
          : {}),
      };
    });
  };

  return {
    valid: value.valid,
    errors: readIssues(value.errors, "validation.errors"),
    warnings: readIssues(value.warnings, "validation.warnings"),
  };
}

function parseMetadata(value: unknown): MarketDiscoveryMetadata {
  assertPlainObject(value, "metadata");

  const marketCount = value.marketCount;
  const pageCount = value.pageCount;

  if (typeof marketCount !== "number" || !Number.isFinite(marketCount)) {
    throw new BatchImportConfigError(
      "metadata.marketCount must be a finite number",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  if (typeof pageCount !== "number" || !Number.isFinite(pageCount)) {
    throw new BatchImportConfigError(
      "metadata.pageCount must be a finite number",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  return {
    seriesTicker: readNonEmptyString(value.seriesTicker, "metadata.seriesTicker"),
    discoveredAt: readNonEmptyString(value.discoveredAt, "metadata.discoveredAt"),
    marketCount,
    pageCount,
  };
}

/** Parses and validates a serialized discovery-result.json document. */
export function parseMarketDiscoveryResultJson(json: string): MarketDiscoveryResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BatchImportConfigError(
      "Discovery input file contains invalid JSON",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  assertPlainObject(parsed, "discovery result");

  if (!Array.isArray(parsed.markets)) {
    throw new BatchImportConfigError(
      "discovery result markets must be an array",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  const metadata = parseMetadata(parsed.metadata);
  const markets = parsed.markets.map(parseDiscoveredMarket);
  const validation = parseValidation(parsed.validation);

  assertPlainObject(parsed.provenance, "provenance");
  if (!Array.isArray(parsed.provenance.pages)) {
    throw new BatchImportConfigError(
      "provenance.pages must be an array",
      BatchImportConfigErrorCode.INVALID_DISCOVERY_SCHEMA,
    );
  }

  const result: MarketDiscoveryResult = {
    metadata,
    markets,
    validation,
    provenance: {
      pages: parsed.provenance.pages.map(parseProvenance),
    },
  };

  if (!result.validation.valid) {
    const firstError = result.validation.errors[0]?.message ?? "Discovery validation failed";
    throw new BatchImportConfigError(
      firstError,
      BatchImportConfigErrorCode.INVALID_DISCOVERY_RESULT,
      result.validation.errors[0]?.marketTicker,
    );
  }

  return result;
}
