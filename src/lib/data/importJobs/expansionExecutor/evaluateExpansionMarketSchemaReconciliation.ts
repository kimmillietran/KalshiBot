import {
  findMissingKalshiMarketWireFields,
  type KalshiMarketWireShape,
} from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import {
  mergeKalshiMarketWireFromListDetail,
  type KalshiMarketSchemaReconciliationResult,
} from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

export type ExpansionMarketExpirationValueSource =
  | "detail"
  | "list"
  | "merged"
  | "missing";

export type ExpansionMarketSchemaReconciliationEvaluation = {
  reconciliation: KalshiMarketSchemaReconciliationResult;
  mergedMissingRequiredFields: readonly string[];
  reconciliationSuccess: boolean;
  expirationValueSource: ExpansionMarketExpirationValueSource;
};

function resolveExpirationValueSource(input: {
  detailWire: KalshiMarketWireShape | null;
  listWire: KalshiMarketWireShape | null;
  mergedFields: readonly string[];
  mergedWire: KalshiMarketWireShape;
}): ExpansionMarketExpirationValueSource {
  if (input.detailWire?.expiration_value?.trim()) {
    return "detail";
  }

  if (input.listWire?.expiration_value?.trim()) {
    return "list";
  }

  if (
    input.mergedWire.expiration_value?.trim()
    && input.mergedFields.includes("expiration_value")
  ) {
    return "merged";
  }

  if (input.mergedWire.expiration_value?.trim()) {
    return "merged";
  }

  return "missing";
}

/**
 * Canonical list/detail schema reconciliation used by expansion smoke and import reporting.
 * Matches the merge + required-field validation performed during historical import prefetch.
 */
export function evaluateExpansionMarketSchemaReconciliation(input: {
  listMarketWire: KalshiMarketWireShape | null;
  detailMarketWire: KalshiMarketWireShape | null;
}): ExpansionMarketSchemaReconciliationEvaluation {
  if (!input.detailMarketWire) {
    const mergedWire = input.listMarketWire ?? {};
    const mergedMissingRequiredFields = findMissingKalshiMarketWireFields(mergedWire);

    return {
      reconciliation: {
        mergedWire,
        mergedFields: [],
        detailMissingRequiredFields: [],
        listMissingRequiredFields: input.listMarketWire
          ? findMissingKalshiMarketWireFields(input.listMarketWire)
          : [],
      },
      mergedMissingRequiredFields,
      reconciliationSuccess: mergedMissingRequiredFields.length === 0,
      expirationValueSource: resolveExpirationValueSource({
        detailWire: null,
        listWire: input.listMarketWire,
        mergedFields: [],
        mergedWire,
      }),
    };
  }

  const reconciliation = mergeKalshiMarketWireFromListDetail({
    listMarket: input.listMarketWire,
    detailMarket: input.detailMarketWire,
  });
  const mergedMissingRequiredFields = findMissingKalshiMarketWireFields(
    reconciliation.mergedWire,
  );

  return {
    reconciliation,
    mergedMissingRequiredFields,
    reconciliationSuccess: mergedMissingRequiredFields.length === 0,
    expirationValueSource: resolveExpirationValueSource({
      detailWire: input.detailMarketWire,
      listWire: input.listMarketWire,
      mergedFields: reconciliation.mergedFields,
      mergedWire: reconciliation.mergedWire,
    }),
  };
}
