import {
  findMissingKalshiMarketWireFields,
  type KalshiMarketWireShape,
} from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import {
  KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY,
  KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY,
  type KalshiMarketSchemaReconciliationResult,
} from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

export type ExpansionImportExpirationValueSource =
  | "list"
  | "detail"
  | "merged"
  | "missing";

export type ExpansionImportReconciliationTraceStage = {
  stage:
    | "discovery-list-response"
    | "expansion-import-config-metadata"
    | "per-market-config-json"
    | "executor-load"
    | "historical-import-bootstrap"
    | "kalshi-prefetch-adapter"
    | "kalshi-importer-get-market"
    | "merge-list-detail"
    | "required-field-validation";
  ticker: string;
  expirationValuePresent: boolean;
  expirationValueSource: ExpansionImportExpirationValueSource;
  topLevelKeys: readonly string[];
  metadataPreserved: boolean | null;
  missingRequiredFields: readonly string[];
  mergedFields: readonly string[];
  notes: string | null;
};

export type ExpansionImportReconciliationTracer = {
  traceMarket: string;
  record: (stage: ExpansionImportReconciliationTraceStage) => void;
  flush: () => void;
};

function expirationValueSourceFromWire(
  wire: KalshiMarketWireShape | null | undefined,
  source: ExpansionImportExpirationValueSource,
): ExpansionImportExpirationValueSource {
  if (!wire?.expiration_value?.trim()) {
    return "missing";
  }

  return source;
}

function buildWireStage(input: {
  stage: ExpansionImportReconciliationTraceStage["stage"];
  ticker: string;
  wire: KalshiMarketWireShape | null | undefined;
  expirationValueSource: ExpansionImportExpirationValueSource;
  metadataPreserved?: boolean | null;
  missingRequiredFields?: readonly string[];
  mergedFields?: readonly string[];
  notes?: string | null;
}): ExpansionImportReconciliationTraceStage {
  const topLevelKeys = input.wire ? Object.keys(input.wire).sort() : [];

  return {
    stage: input.stage,
    ticker: input.ticker,
    expirationValuePresent: Boolean(input.wire?.expiration_value?.trim()),
    expirationValueSource: expirationValueSourceFromWire(
      input.wire,
      input.expirationValueSource,
    ),
    topLevelKeys,
    metadataPreserved: input.metadataPreserved ?? null,
    missingRequiredFields: input.missingRequiredFields ?? [],
    mergedFields: input.mergedFields ?? [],
    notes: input.notes ?? null,
  };
}

export function createExpansionImportReconciliationTracer(input: {
  traceMarket: string | null;
  write: (message: string) => void;
}): ExpansionImportReconciliationTracer | null {
  if (!input.traceMarket?.trim()) {
    return null;
  }

  const traceMarket = input.traceMarket.trim();
  const stages: ExpansionImportReconciliationTraceStage[] = [];

  return {
    traceMarket,
    record(stage) {
      if (stage.ticker !== traceMarket) {
        return;
      }

      stages.push(stage);
    },
    flush() {
      if (stages.length === 0) {
        input.write(
          `[Expansion Import Trace] No stages recorded for ${traceMarket}.\n`,
        );
        return;
      }

      const lines = [
        `[Expansion Import Trace] ${traceMarket}`,
        ...stages.map((stage) => JSON.stringify(stage)),
      ];
      input.write(`${lines.join("\n")}\n`);
    },
  };
}

export function traceDiscoveryListResponse(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  tracer?.record(
    buildWireStage({
      stage: "discovery-list-response",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: "list",
      notes: "Discovery list wire captured at normalization time",
    }),
  );
}

export function traceExpansionImportConfigMetadata(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    metadata: Readonly<Record<string, unknown>>;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  const metadataHasKey = KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY in input.metadata;
  const provenanceHasKey =
    KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY in input.metadata;

  tracer?.record(
    buildWireStage({
      stage: "expansion-import-config-metadata",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: "list",
      metadataPreserved: metadataHasKey && provenanceHasKey,
      notes: metadataHasKey
        ? "kalshiDiscoveryListMarket metadata key present"
        : "kalshiDiscoveryListMarket metadata key missing",
    }),
  );
}

export function traceSerializedConfigJson(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    serializedConfig: string;
    parsedMetadata: Readonly<Record<string, unknown>>;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  const serializedHasKey = input.serializedConfig.includes(
    KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY,
  );

  tracer?.record(
    buildWireStage({
      stage: "per-market-config-json",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: "list",
      metadataPreserved: serializedHasKey
        && KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY in input.parsedMetadata,
      notes: serializedHasKey
        ? "Serialized config.json includes kalshiDiscoveryListMarket"
        : "Serialized config.json missing kalshiDiscoveryListMarket",
    }),
  );
}

export function traceExecutorLoad(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  tracer?.record(
    buildWireStage({
      stage: "executor-load",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: "list",
      notes: "Executor handing config to runImport",
    }),
  );
}

export function traceHistoricalImportBootstrap(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  tracer?.record(
    buildWireStage({
      stage: "historical-import-bootstrap",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: input.listMarketWire?.expiration_value?.trim()
        ? "list"
        : "missing",
      metadataPreserved: input.listMarketWire !== null,
      notes: input.listMarketWire
        ? "Bootstrap resolved listMarketWire from config metadata"
        : "Bootstrap could not resolve listMarketWire from config metadata",
    }),
  );
}

export function traceKalshiPrefetchAdapter(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    listMarketWire: KalshiMarketWireShape | null | undefined;
  },
): void {
  tracer?.record(
    buildWireStage({
      stage: "kalshi-prefetch-adapter",
      ticker: input.ticker,
      wire: input.listMarketWire,
      expirationValueSource: input.listMarketWire?.expiration_value?.trim()
        ? "list"
        : "missing",
      notes: input.listMarketWire
        ? "Prefetch adapter forwarding listMarketWire to importer"
        : "Prefetch adapter has no listMarketWire to forward",
    }),
  );
}

export function traceKalshiImporterGetMarket(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    detailMarket: KalshiMarketWireShape;
    listMarketWire?: KalshiMarketWireShape | null;
  },
): void {
  tracer?.record(
    buildWireStage({
      stage: "kalshi-importer-get-market",
      ticker: input.ticker,
      wire: input.detailMarket,
      expirationValueSource: "detail",
      missingRequiredFields: findMissingKalshiMarketWireFields(input.detailMarket),
      notes: input.listMarketWire
        ? "Detail payload received before list/detail merge"
        : "Detail payload received without list fallback",
    }),
  );
}

export function traceMergeListDetail(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    reconciliation: KalshiMarketSchemaReconciliationResult;
  },
): void {
  const expirationValueSource: ExpansionImportExpirationValueSource =
    input.reconciliation.mergedWire.expiration_value?.trim()
      ? input.reconciliation.mergedFields.includes("expiration_value")
        ? "merged"
        : input.reconciliation.detailMissingRequiredFields.includes("expiration_value")
          ? "list"
          : "detail"
      : "missing";

  tracer?.record(
    buildWireStage({
      stage: "merge-list-detail",
      ticker: input.ticker,
      wire: input.reconciliation.mergedWire,
      expirationValueSource,
      mergedFields: input.reconciliation.mergedFields,
      missingRequiredFields: findMissingKalshiMarketWireFields(
        input.reconciliation.mergedWire,
      ),
      notes: `detailMissing=${input.reconciliation.detailMissingRequiredFields.join(",") || "none"}; listMissing=${input.reconciliation.listMissingRequiredFields.join(",") || "none"}`,
    }),
  );
}

export function traceRequiredFieldValidation(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
  input: {
    ticker: string;
    wire: KalshiMarketWireShape;
  },
): void {
  const missingRequiredFields = findMissingKalshiMarketWireFields(input.wire);

  tracer?.record(
    buildWireStage({
      stage: "required-field-validation",
      ticker: input.ticker,
      wire: input.wire,
      expirationValueSource: input.wire.expiration_value?.trim()
        ? missingRequiredFields.includes("expiration_value")
          ? "missing"
          : "merged"
        : "missing",
      missingRequiredFields,
      notes: missingRequiredFields.length === 0
        ? "Required-field validation passed"
        : `Required-field validation failed: ${missingRequiredFields.join(", ")}`,
    }),
  );
}

export function buildExpansionImportReconciliationTraceCallbacks(
  tracer: ExpansionImportReconciliationTracer | null | undefined,
): import("@/lib/data/importJobs/bootstrap/historicalImportBootstrapTypes").HistoricalImportReconciliationTraceCallbacks | null {
  if (!tracer) {
    return null;
  }

  return {
    onBootstrapListMarketWire: (input) => {
      traceHistoricalImportBootstrap(tracer, input);
    },
    onPrefetchListMarketWire: (input) => {
      traceKalshiPrefetchAdapter(tracer, input);
    },
    importerTrace: {
      onDetailMarket: (input) => {
        traceKalshiImporterGetMarket(tracer, input);
      },
      onMerge: (input) => {
        traceMergeListDetail(tracer, input);
      },
      onValidation: (input) => {
        traceRequiredFieldValidation(tracer, input);
      },
    },
  };
}
