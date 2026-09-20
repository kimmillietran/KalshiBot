/**
 * Causal M16 reversal-confirmation state machine.
 * File/append order only. No centered pivots. No future bars.
 */
import {
  M16_MIN_REMAINING_MS_AT_CONFIRMATION,
  M16_SETUP_ABORT_LOW_CENTS,
  M16_SETUP_CROSS_CENTS,
  M16_STRUCTURE_TICK_CENTS,
  type M16CandidateSide,
} from "./m16Types";

export type M16QuoteTick = {
  timestampMs: number;
  yesBestBidCents: number;
  noBestBidCents: number;
  /** Candidate-side complement midpoint (YES mid or NO mid = 100 - YES mid). */
  candidateMidCents: number;
  bookEligible: boolean;
  /** Structural interval contaminated by gap/resync — fail closed. */
  structuralGap: boolean;
};

export type M16MachinePhase =
  | "awaiting-above-cross"
  | "in-setup"
  | "building-reversal"
  | "pullback-held"
  | "confirmed"
  | "aborted-waterfall"
  | "left-truncated"
  | "invalidated-gap"
  | "rejected-time-gate"
  | "done";

type ReversalBuild = {
  offLowSeen: boolean;
  reboundHighH: number | null;
  pullbackSeen: boolean;
};

export type M16MarketMachineState = {
  side: M16CandidateSide;
  phase: M16MachinePhase;
  sawAboveCross: boolean;
  setupLowL: number | null;
  downCrossTimestampMs: number | null;
  build: ReversalBuild | null;
  confirmationTimestampMs: number | null;
  confirmationMidCents: number | null;
  signalEmitted: boolean;
};

export type M16MachineEvent =
  | { type: "left-truncated"; side: M16CandidateSide; timestampMs: number }
  | { type: "down-cross"; side: M16CandidateSide; timestampMs: number; midCents: number }
  | {
    type: "abort-waterfall";
    side: M16CandidateSide;
    timestampMs: number;
    setupLowL: number;
  }
  | { type: "invalidated-gap"; side: M16CandidateSide; timestampMs: number }
  | {
    type: "confirmation";
    side: M16CandidateSide;
    timestampMs: number;
    confirmationMidCents: number;
    setupLowL: number;
    passedTimeGate: boolean;
  }
  | {
    type: "time-gate-reject";
    side: M16CandidateSide;
    timestampMs: number;
    confirmationMidCents: number;
    setupLowL: number;
  };

export function candidateMidFromYesMid(
  side: M16CandidateSide,
  yesMidCents: number,
): number {
  return side === "YES" ? yesMidCents : 100 - yesMidCents;
}

export function createM16MarketMachine(side: M16CandidateSide): M16MarketMachineState {
  return {
    side,
    phase: "awaiting-above-cross",
    sawAboveCross: false,
    setupLowL: null,
    downCrossTimestampMs: null,
    build: null,
    confirmationTimestampMs: null,
    confirmationMidCents: null,
    signalEmitted: false,
  };
}

function resetBuild(): ReversalBuild {
  return { offLowSeen: false, reboundHighH: null, pullbackSeen: false };
}

/**
 * Advance one market/side machine by one eligible quote tick.
 * Caller supplies file-order ticks; gap ticks should set structuralGap.
 */
export function stepM16MarketMachine(input: {
  state: M16MarketMachineState;
  tick: M16QuoteTick;
  closeTimeMs: number | null;
}): { state: M16MarketMachineState; events: M16MachineEvent[] } {
  const events: M16MachineEvent[] = [];
  let state = { ...input.state, build: input.state.build ? { ...input.state.build } : null };
  const mid = input.tick.candidateMidCents;
  const ts = input.tick.timestampMs;

  if (
    state.phase === "confirmed"
    || state.phase === "aborted-waterfall"
    || state.phase === "left-truncated"
    || state.phase === "invalidated-gap"
    || state.phase === "rejected-time-gate"
    || state.phase === "done"
    || state.signalEmitted
  ) {
    return { state, events };
  }

  // Gap during active structure → fail closed
  if (
    input.tick.structuralGap
    && (state.phase === "in-setup"
      || state.phase === "building-reversal"
      || state.phase === "pullback-held")
  ) {
    state = { ...state, phase: "invalidated-gap", build: null };
    events.push({ type: "invalidated-gap", side: state.side, timestampMs: ts });
    return { state, events };
  }

  if (!input.tick.bookEligible) {
    return { state, events };
  }

  // Left truncation: first observation already in/below setup without prior >40
  if (state.phase === "awaiting-above-cross" && !state.sawAboveCross) {
    if (mid <= M16_SETUP_CROSS_CENTS) {
      state = { ...state, phase: "left-truncated" };
      events.push({ type: "left-truncated", side: state.side, timestampMs: ts });
      return { state, events };
    }
    state = { ...state, sawAboveCross: true };
  }

  if (state.phase === "awaiting-above-cross" && state.sawAboveCross) {
    if (mid <= M16_SETUP_CROSS_CENTS) {
      // Down-cross
      state = {
        ...state,
        phase: "in-setup",
        setupLowL: mid,
        downCrossTimestampMs: ts,
        build: resetBuild(),
      };
      events.push({
        type: "down-cross",
        side: state.side,
        timestampMs: ts,
        midCents: mid,
      });
      // Immediate waterfall check
      if (mid < M16_SETUP_ABORT_LOW_CENTS) {
        state = { ...state, phase: "aborted-waterfall", build: null };
        events.push({
          type: "abort-waterfall",
          side: state.side,
          timestampMs: ts,
          setupLowL: mid,
        });
      }
      return { state, events };
    }
    return { state, events };
  }

  if (state.phase === "in-setup" || state.phase === "building-reversal" || state.phase === "pullback-held") {
    const L = state.setupLowL!;
    // Strict new low
    if (mid < L) {
      const newL = mid;
      if (newL < M16_SETUP_ABORT_LOW_CENTS) {
        state = {
          ...state,
          setupLowL: newL,
          phase: "aborted-waterfall",
          build: null,
        };
        events.push({
          type: "abort-waterfall",
          side: state.side,
          timestampMs: ts,
          setupLowL: newL,
        });
        return { state, events };
      }
      // New low resets reversal-building state
      state = {
        ...state,
        setupLowL: newL,
        phase: "in-setup",
        build: resetBuild(),
      };
      return { state, events };
    }

    // Tied low is NOT a new low — continue
    let build = state.build ?? resetBuild();

    // Off-low: mid >= L + 1
    if (!build.offLowSeen && mid >= L + M16_STRUCTURE_TICK_CENTS) {
      build = {
        offLowSeen: true,
        reboundHighH: mid,
        pullbackSeen: false,
      };
      state = { ...state, phase: "building-reversal", build };
    } else if (build.offLowSeen && !build.pullbackSeen) {
      // Track rebound high H
      const H = build.reboundHighH == null ? mid : Math.max(build.reboundHighH, mid);
      build = { ...build, reboundHighH: H };
      // Pullback: mid <= H - 1 and mid >= L
      if (mid <= H - M16_STRUCTURE_TICK_CENTS && mid >= L) {
        build = { ...build, pullbackSeen: true };
        state = { ...state, phase: "pullback-held", build };
      } else {
        state = { ...state, phase: "building-reversal", build };
      }
    } else if (build.pullbackSeen) {
      const H = build.reboundHighH!;
      // Higher-high confirmation: mid > H (equality is NOT confirmation)
      if (mid > H) {
        const remainingMs =
          input.closeTimeMs == null ? null : input.closeTimeMs - ts;
        const passedTimeGate =
          remainingMs != null && remainingMs >= M16_MIN_REMAINING_MS_AT_CONFIRMATION;
        if (passedTimeGate) {
          state = {
            ...state,
            phase: "confirmed",
            confirmationTimestampMs: ts,
            confirmationMidCents: mid,
            signalEmitted: true,
            build,
          };
          events.push({
            type: "confirmation",
            side: state.side,
            timestampMs: ts,
            confirmationMidCents: mid,
            setupLowL: L,
            passedTimeGate: true,
          });
        } else {
          state = {
            ...state,
            phase: "rejected-time-gate",
            confirmationTimestampMs: ts,
            confirmationMidCents: mid,
            signalEmitted: true,
            build,
          };
          events.push({
            type: "time-gate-reject",
            side: state.side,
            timestampMs: ts,
            confirmationMidCents: mid,
            setupLowL: L,
          });
        }
        return { state, events };
      }
      // Continue tracking; if mid makes new low already handled above
      state = { ...state, phase: "pullback-held", build };
    } else {
      state = { ...state, build };
    }
  }

  return { state, events };
}
