import {
  CalibrationErrorCode,
  type CalibrationObservation,
  type CalibrationWarning,
  type ParsedCalibrationResearchDocument,
  type ScannedCalibrationResearchOutput,
} from "./calibrationTypes";
import { parseCalibrationResearchDocument } from "./parseCalibrationResearchOutput";

export type ExtractedCalibrationMarketData = {
  document: ParsedCalibrationResearchDocument;
  observations: readonly CalibrationObservation[];
  warnings: readonly CalibrationWarning[];
};

function buildObservation(
  source: CalibrationObservation["source"],
  document: ParsedCalibrationResearchDocument,
  predictedProbability: number,
  outputPath: string,
): CalibrationObservation | null {
  if (document.settlementOutcome === null) {
    return null;
  }

  return {
    source,
    strategyId: document.strategyId,
    seriesTicker: document.seriesTicker,
    marketTicker: document.marketTicker,
    predictedProbability,
    observedOutcome: document.settlementOutcome,
    outputPath,
  };
}

export function extractCalibrationObservationsFromDocument(
  document: ParsedCalibrationResearchDocument,
  outputPath: string,
): ExtractedCalibrationMarketData {
  const warnings: CalibrationWarning[] = [];
  const observations: CalibrationObservation[] = [];

  if (document.settlementOutcome === null) {
    warnings.push({
      code: CalibrationErrorCode.MISSING_SETTLEMENT,
      message: `Missing settlement for market ${document.marketTicker}`,
      marketTicker: document.marketTicker,
    });
  } else {
    for (const predictedProbability of document.kalshiImpliedProbabilities) {
      const observation = buildObservation(
        "kalshi-implied",
        document,
        predictedProbability,
        outputPath,
      );
      if (observation) {
        observations.push(observation);
      }
    }

    if (document.strategyFairValueProbabilities.length === 0) {
      warnings.push({
        code: CalibrationErrorCode.MISSING_PROBABILITY,
        message: `Missing strategy fair-value probability for market ${document.marketTicker}`,
        marketTicker: document.marketTicker,
      });
    } else {
      for (const predictedProbability of document.strategyFairValueProbabilities) {
        const observation = buildObservation(
          "strategy-fair-value",
          document,
          predictedProbability,
          outputPath,
        );
        if (observation) {
          observations.push(observation);
        }
      }
    }
  }

  if (
    document.settlementOutcome !== null
    && document.kalshiImpliedProbabilities.length === 0
  ) {
    warnings.push({
      code: CalibrationErrorCode.MISSING_PROBABILITY,
      message: `Missing Kalshi implied probability for market ${document.marketTicker}`,
      marketTicker: document.marketTicker,
    });
  }

  return {
    document,
    observations,
    warnings,
  };
}

export function extractCalibrationObservationsFromScan(
  scanned: ScannedCalibrationResearchOutput,
): ExtractedCalibrationMarketData {
  const document = parseCalibrationResearchDocument(scanned.outputJson, scanned.outputPath, {
    strategyId: scanned.strategyId,
    seriesTicker: scanned.seriesTicker,
    marketTicker: scanned.marketTicker,
  });

  return extractCalibrationObservationsFromDocument(document, scanned.outputPath);
}
