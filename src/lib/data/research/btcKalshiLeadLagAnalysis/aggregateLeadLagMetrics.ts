import type {
  LeadLagAggregateBucket,
  LeadLagEventRecord,
} from "./btcKalshiLeadLagAnalysisTypes";
import { firstResponseLatencyForMagnitude } from "./forwardResponse";
import { emptyAggregateBucket, mean, median, quantile } from "./leadLagUtils";
import { responseWindowLabel } from "./leadLagBins";

type MutableBucket = {
  triggerCount: number;
  eligibleTriggerCount: number;
  signedResponses: number[];
  directionalCorrect: number;
  directionalTotal: number;
  timeTo1Cent: number[];
  timeTo2Cent: number[];
  no1CentBy2s: number;
  no1CentBy5s: number;
  no1CentBy10s: number;
  spreadBefore: number[];
  spreadAfter: number[];
  sizeBefore: number[];
  sizeAfter: number[];
};

function createMutableBucket(): MutableBucket {
  return {
    triggerCount: 0,
    eligibleTriggerCount: 0,
    signedResponses: [],
    directionalCorrect: 0,
    directionalTotal: 0,
    timeTo1Cent: [],
    timeTo2Cent: [],
    no1CentBy2s: 0,
    no1CentBy5s: 0,
    no1CentBy10s: 0,
    spreadBefore: [],
    spreadAfter: [],
    sizeBefore: [],
    sizeAfter: [],
  };
}

function finalizeBucket(bucket: MutableBucket): LeadLagAggregateBucket {
  const base = emptyAggregateBucket();
  if (bucket.triggerCount === 0) {
    return base;
  }

  const directionalResponseShare =
    bucket.directionalTotal === 0
      ? null
      : bucket.directionalCorrect / bucket.directionalTotal;

  const responseAt5s = bucket.signedResponses;
  const no1Cent2s = bucket.no1CentBy2s / bucket.eligibleTriggerCount;
  const no1Cent5s = bucket.no1CentBy5s / bucket.eligibleTriggerCount;
  const no1Cent10s = bucket.no1CentBy10s / bucket.eligibleTriggerCount;

  return {
    triggerCount: bucket.triggerCount,
    eligibleTriggerCount: bucket.eligibleTriggerCount,
    directionalResponseShare,
    medianSignedYesMidResponseCents: median(responseAt5s),
    meanSignedYesMidResponseCents: mean(responseAt5s),
    responseQuantiles: {
      p25: quantile(responseAt5s, 0.25),
      p50: quantile(responseAt5s, 0.5),
      p75: quantile(responseAt5s, 0.75),
    },
    medianTimeToFirst1CentResponseMs: median(bucket.timeTo1Cent),
    medianTimeToFirst2CentResponseMs: median(bucket.timeTo2Cent),
    shareNo1CentResponseBy2Seconds: bucket.eligibleTriggerCount === 0 ? null : no1Cent2s,
    shareNo1CentResponseBy5Seconds: bucket.eligibleTriggerCount === 0 ? null : no1Cent5s,
    shareNo1CentResponseBy10Seconds: bucket.eligibleTriggerCount === 0 ? null : no1Cent10s,
    meanSpreadBeforeCents: mean(bucket.spreadBefore),
    meanSpreadAfterCents: mean(bucket.spreadAfter),
    meanSizeBefore: mean(bucket.sizeBefore),
    meanSizeAfter: mean(bucket.sizeAfter),
  };
}

function addEventToBucket(bucket: MutableBucket, event: LeadLagEventRecord): void {
  bucket.triggerCount += 1;
  if (!event.contractDirectionResolved) {
    return;
  }
  bucket.eligibleTriggerCount += 1;

  const response5s = event.responses.find((response) => response.responseWindowMs === 5_000);
  const signed = response5s?.signedYesMidResponseCents ?? null;
  if (signed !== null) {
    bucket.signedResponses.push(signed);
  }
  if (response5s?.directionallyCorrect === true) {
    bucket.directionalCorrect += 1;
  }
  if (response5s?.directionallyCorrect !== null) {
    bucket.directionalTotal += 1;
  }

  const timeTo1 = firstResponseLatencyForMagnitude(event.responses, 1);
  const timeTo2 = firstResponseLatencyForMagnitude(event.responses, 2);
  if (timeTo1 !== null) {
    bucket.timeTo1Cent.push(timeTo1);
  }
  if (timeTo2 !== null) {
    bucket.timeTo2Cent.push(timeTo2);
  }
  if (timeTo1 === null || timeTo1 > 2_000) {
    bucket.no1CentBy2s += 1;
  }
  if (timeTo1 === null || timeTo1 > 5_000) {
    bucket.no1CentBy5s += 1;
  }
  if (timeTo1 === null || timeTo1 > 10_000) {
    bucket.no1CentBy10s += 1;
  }

  if (event.spreadAtTrigger !== null) {
    bucket.spreadBefore.push(event.spreadAtTrigger);
  }
  if (response5s && event.spreadAtTrigger !== null && response5s.spreadChangeCents !== null) {
    bucket.spreadAfter.push(event.spreadAtTrigger + response5s.spreadChangeCents);
  }
  if (event.sizeAtTrigger !== null) {
    bucket.sizeBefore.push(event.sizeAtTrigger);
  }
  if (response5s && event.sizeAtTrigger !== null && response5s.sizeChange !== null) {
    bucket.sizeAfter.push(event.sizeAtTrigger + response5s.sizeChange);
  }
}

export class LeadLagAggregateCollector {
  private readonly byLagWindow = new Map<string, MutableBucket>();
  private readonly byMagnitude = new Map<string, MutableBucket>();
  private readonly byTimeRemaining = new Map<string, MutableBucket>();
  private readonly byProbability = new Map<string, MutableBucket>();
  private readonly thresholdCrossing = createMutableBucket();
  private readonly nonThresholdCrossing = createMutableBucket();
  private thresholdCrossingCount = 0;

  addEvent(event: LeadLagEventRecord): void {
    const lagBucket = this.byLagWindow.get("5s") ?? createMutableBucket();
    this.byLagWindow.set("5s", lagBucket);
    addEventToBucket(lagBucket, event);

    const magnitudeKey = event.btcMagnitudeBin;
    const magnitudeBucket = this.byMagnitude.get(magnitudeKey) ?? createMutableBucket();
    this.byMagnitude.set(magnitudeKey, magnitudeBucket);
    addEventToBucket(magnitudeBucket, event);

    if (event.timeRemainingBin) {
      const timeBucket = this.byTimeRemaining.get(event.timeRemainingBin) ?? createMutableBucket();
      this.byTimeRemaining.set(event.timeRemainingBin, timeBucket);
      addEventToBucket(timeBucket, event);
    }

    if (event.impliedProbabilityBin) {
      const probabilityBucket =
        this.byProbability.get(event.impliedProbabilityBin) ?? createMutableBucket();
      this.byProbability.set(event.impliedProbabilityBin, probabilityBucket);
      addEventToBucket(probabilityBucket, event);
    }

    for (const response of event.responses) {
      const key = responseWindowLabel(response.responseWindowMs);
      const windowBucket = this.byLagWindow.get(key) ?? createMutableBucket();
      windowBucket.triggerCount += 1;
      if (event.contractDirectionResolved) {
        windowBucket.eligibleTriggerCount += 1;
        if (response.signedYesMidResponseCents !== null) {
          windowBucket.signedResponses.push(response.signedYesMidResponseCents);
        }
        if (response.directionallyCorrect === true) {
          windowBucket.directionalCorrect += 1;
        }
        if (response.directionallyCorrect !== null) {
          windowBucket.directionalTotal += 1;
        }
      }
      this.byLagWindow.set(key, windowBucket);
    }

    if (event.thresholdCrossingDuringWindow) {
      this.thresholdCrossingCount += 1;
      addEventToBucket(this.thresholdCrossing, event);
    } else {
      addEventToBucket(this.nonThresholdCrossing, event);
    }
  }

  getThresholdCrossingShare(totalEvents: number): number | null {
    if (totalEvents === 0) {
      return null;
    }
    return this.thresholdCrossingCount / totalEvents;
  }

  getOverallDirectionalShare(): number | null {
    const bucket = this.byLagWindow.get("5s");
    if (!bucket || bucket.directionalTotal === 0) {
      return null;
    }
    return bucket.directionalCorrect / bucket.directionalTotal;
  }

  getMedianSignedResponseAt5Seconds(): number | null {
    return median(this.byLagWindow.get("5s")?.signedResponses ?? []);
  }

  isConsistentAcrossMagnitudeBins(): boolean {
    const shares = [...this.byMagnitude.values()]
      .filter((bucket) => bucket.directionalTotal >= 5)
      .map((bucket) => bucket.directionalCorrect / bucket.directionalTotal);
    if (shares.length < 2) {
      return false;
    }
    const min = Math.min(...shares);
    const max = Math.max(...shares);
    return max - min <= 0.15;
  }

  finalizeMaps(): {
    responseByLagWindow: Record<string, LeadLagAggregateBucket>;
    responseByMagnitudeBin: Record<string, LeadLagAggregateBucket>;
    responseByTimeRemainingBin: Record<string, LeadLagAggregateBucket>;
    responseByImpliedProbabilityBin: Record<string, LeadLagAggregateBucket>;
    responseByThresholdCrossing: {
      thresholdCrossing: LeadLagAggregateBucket;
      nonThresholdCrossing: LeadLagAggregateBucket;
    };
  } {
    const mapFinalize = (source: Map<string, MutableBucket>) => {
      const result: Record<string, LeadLagAggregateBucket> = {};
      for (const [key, bucket] of source.entries()) {
        result[key] = finalizeBucket(bucket);
      }
      return result;
    };

    return {
      responseByLagWindow: mapFinalize(this.byLagWindow),
      responseByMagnitudeBin: mapFinalize(this.byMagnitude),
      responseByTimeRemainingBin: mapFinalize(this.byTimeRemaining),
      responseByImpliedProbabilityBin: mapFinalize(this.byProbability),
      responseByThresholdCrossing: {
        thresholdCrossing: finalizeBucket(this.thresholdCrossing),
        nonThresholdCrossing: finalizeBucket(this.nonThresholdCrossing),
      },
    };
  }
}
