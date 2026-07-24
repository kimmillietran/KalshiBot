/**
 * Parse and prove controlled reconnect lifecycle association for an exact run.
 * Fail closed on malformed lines, missing linkage, or natural-recovery substitution.
 */
export const CONTROLLED_RECONNECT_REASON = "controlled-reconnect-validation" as const;

export type LifecycleEventRecord = {
  type?: unknown;
  runId?: unknown;
  detectedAt?: unknown;
  recoveryCycleId?: unknown;
  recoveryReason?: unknown;
  reason?: unknown;
  requestDisposition?: unknown;
  [key: string]: unknown;
};

export type ControlledReconnectLifecycleProof = {
  controlledReconnectRequestCount: number;
  controlledReconnectRecoveryCycleId: number | null;
  controlledReconnectRecoveryReason: string | null;
  controlledReconnectAttemptCount: number;
  controlledReconnectSuccessCount: number;
  controlledReconnectFailureCount: number;
  controlledReconnectRequestedAt: string | null;
  controlledReconnectSucceededAt: string | null;
  controlledReconnectProven: boolean;
  failedChecks: string[];
};

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isParseableTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function parseCaptureLifecycleJsonl(
  raw: string,
  expectedRunId: string,
): { events: LifecycleEventRecord[]; failedChecks: string[] } {
  const failedChecks: string[] = [];
  const events: LifecycleEventRecord[] = [];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim().length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      failedChecks.push(`lifecycle-malformed-line:${index + 1}`);
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      failedChecks.push(`lifecycle-non-object-line:${index + 1}`);
      continue;
    }
    const record = parsed as LifecycleEventRecord;
    if (record.runId !== undefined && record.runId !== expectedRunId) {
      failedChecks.push(
        `lifecycle-runId-mismatch (${String(record.runId)} != ${expectedRunId})`,
      );
    }
    events.push(record);
  }
  return { events, failedChecks };
}

export function evaluateControlledReconnectLifecycle(
  events: readonly LifecycleEventRecord[],
): ControlledReconnectLifecycleProof {
  const failedChecks: string[] = [];

  const requests = events.filter((event) => event.type === "controlledReconnectRequested");
  const deferred = events.filter((event) => event.type === "controlledReconnectDeferred");

  if (requests.length !== 1) {
    failedChecks.push(`controlledReconnectRequestCount=${requests.length}`);
  }

  const request = requests[0] ?? null;
  let recoveryCycleId: number | null = null;
  let requestedAt: string | null = null;
  let recoveryReason: string | null = null;

  if (request) {
    if (!isFiniteInteger(request.recoveryCycleId) || request.recoveryCycleId < 1) {
      failedChecks.push(
        `controlledReconnectRecoveryCycleId=${String(request.recoveryCycleId)}`,
      );
    } else {
      recoveryCycleId = request.recoveryCycleId;
    }
    if (request.recoveryReason !== CONTROLLED_RECONNECT_REASON) {
      failedChecks.push(
        `controlledReconnectRecoveryReason=${String(request.recoveryReason)}`,
      );
    } else {
      recoveryReason = CONTROLLED_RECONNECT_REASON;
    }
    if (!isParseableTimestamp(request.detectedAt)) {
      failedChecks.push("controlledReconnectRequestedAt-invalid");
    } else {
      requestedAt = request.detectedAt;
    }
    if (
      request.requestDisposition !== "started"
      && request.requestDisposition !== "queued"
    ) {
      failedChecks.push(
        `controlledReconnectRequestDisposition=${String(request.requestDisposition)}`,
      );
    }
  }

  const attempts = events.filter((event) => {
    if (event.type !== "wsRecoveryAttempted") {
      return false;
    }
    const reason = event.recoveryReason ?? event.reason;
    return (
      recoveryCycleId !== null
      && event.recoveryCycleId === recoveryCycleId
      && reason === CONTROLLED_RECONNECT_REASON
    );
  });

  const successes = events.filter((event) => {
    if (event.type !== "wsRecoverySucceeded") {
      return false;
    }
    const reason = event.recoveryReason ?? event.reason;
    return (
      recoveryCycleId !== null
      && event.recoveryCycleId === recoveryCycleId
      && reason === CONTROLLED_RECONNECT_REASON
    );
  });

  const failures = events.filter((event) => {
    if (event.type !== "wsRecoveryFailed") {
      return false;
    }
    const reason = event.recoveryReason ?? event.reason;
    return (
      recoveryCycleId !== null
      && event.recoveryCycleId === recoveryCycleId
      && reason === CONTROLLED_RECONNECT_REASON
    );
  });

  if (attempts.length < 1) {
    failedChecks.push(`controlledReconnectAttemptCount=${attempts.length}`);
  }
  if (successes.length !== 1) {
    failedChecks.push(`controlledReconnectSuccessCount=${successes.length}`);
  }
  if (failures.length !== 0) {
    failedChecks.push(`controlledReconnectFailureCount=${failures.length}`);
  }

  let succeededAt: string | null = null;
  const success = successes[0] ?? null;
  if (success) {
    if (!isParseableTimestamp(success.detectedAt)) {
      failedChecks.push("controlledReconnectSucceededAt-invalid");
    } else {
      succeededAt = success.detectedAt;
    }
  }

  for (const attempt of attempts) {
    if (!isParseableTimestamp(attempt.detectedAt)) {
      failedChecks.push("controlledReconnectAttemptAt-invalid");
    }
  }

  if (requestedAt && attempts[0] && isParseableTimestamp(attempts[0]!.detectedAt)) {
    if (Date.parse(attempts[0]!.detectedAt as string) < Date.parse(requestedAt)) {
      failedChecks.push("controlled-reconnect-order:attempt-before-request");
    }
  }
  if (
    requestedAt
    && succeededAt
    && Date.parse(succeededAt) < Date.parse(requestedAt)
  ) {
    failedChecks.push("controlled-reconnect-order:success-before-request");
  }
  if (
    attempts[0]
    && succeededAt
    && isParseableTimestamp(attempts[0]!.detectedAt)
    && Date.parse(succeededAt) < Date.parse(attempts[0]!.detectedAt as string)
  ) {
    failedChecks.push("controlled-reconnect-order:success-before-attempt");
  }

  // Deferred events are allowed but must not substitute for the authoritative request.
  void deferred;

  const controlledReconnectProven = failedChecks.length === 0;

  return {
    controlledReconnectRequestCount: requests.length,
    controlledReconnectRecoveryCycleId: recoveryCycleId,
    controlledReconnectRecoveryReason: recoveryReason,
    controlledReconnectAttemptCount: attempts.length,
    controlledReconnectSuccessCount: successes.length,
    controlledReconnectFailureCount: failures.length,
    controlledReconnectRequestedAt: requestedAt,
    controlledReconnectSucceededAt: succeededAt,
    controlledReconnectProven,
    failedChecks,
  };
}
