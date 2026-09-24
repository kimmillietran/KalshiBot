import { createHash } from "node:crypto";

import { createKalshiAuthHeaders } from "@/lib/data/live/kalshiWsCaptureSpike/kalshiAuthHeaders";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import type { CampaignBudgetIo, CampaignHttpPurpose, HttpReservation } from "./campaignBudget";
import { completeHttpAttempt, reserveHttpAttempt } from "./campaignBudget";
import { classifyHttpStatus, isRetryableCategory } from "./classifyHttpError";
import { KalshiBrtiAccessProbeError, type SignedGetResult } from "./types";

export type HttpBudget = {
  remaining: number;
};

export type CampaignBudgetHook = {
  ledgerPath: string;
  lockPath: string;
  campaignId: string;
  limit: number;
  purpose: CampaignHttpPurpose;
  io: CampaignBudgetIo;
};

export type SignedGetDeps = {
  fetchImpl: typeof fetch;
  nowMs?: () => number;
  campaign?: CampaignBudgetHook;
};

function reserveIfNeeded(deps: SignedGetDeps | undefined): HttpReservation | null {
  if (!deps?.campaign) {
    return null;
  }
  return reserveHttpAttempt({
    ledgerPath: deps.campaign.ledgerPath,
    lockPath: deps.campaign.lockPath,
    campaignId: deps.campaign.campaignId,
    limit: deps.campaign.limit,
    purpose: deps.campaign.purpose,
    io: deps.campaign.io,
  });
}

function completeIfNeeded(
  deps: SignedGetDeps | undefined,
  reservation: HttpReservation | null,
  result: { httpStatus: number | null; category: string | null; failed?: boolean },
): void {
  if (!deps?.campaign || !reservation) {
    return;
  }
  completeHttpAttempt({
    ledgerPath: deps.campaign.ledgerPath,
    lockPath: deps.campaign.lockPath,
    reservationId: reservation.id,
    httpStatus: result.httpStatus,
    category: result.category,
    failed: result.failed,
    io: deps.campaign.io,
  });
}

export async function signedKalshiGet(input: {
  url: string;
  signPath: string;
  credentials: KalshiCaptureCredentials;
  budget: HttpBudget;
  maxRetries: number;
  deps: SignedGetDeps;
}): Promise<SignedGetResult> {
  if (input.credentials.status !== "available" || !input.credentials.apiKeyId
    || !input.credentials.privateKeyMaterial.privateKeyPem) {
    throw new KalshiBrtiAccessProbeError("credentials-not-available");
  }

  let last: SignedGetResult | null = null;
  const attempts = input.maxRetries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reservation = reserveIfNeeded(input.deps);
    if (input.budget.remaining <= 0 && !reservation) {
      throw new KalshiBrtiAccessProbeError("http-request-budget-exhausted");
    }
    if (!reservation) {
      input.budget.remaining -= 1;
    } else {
      input.budget.remaining = reservation.limit - reservation.consumed;
    }
    const headers = {
      Accept: "application/json",
      ...createKalshiAuthHeaders({
        apiKeyId: input.credentials.apiKeyId,
        privateKeyPem: input.credentials.privateKeyMaterial.privateKeyPem,
        method: "GET",
        path: input.signPath,
        timestampMs: String((input.deps.nowMs ?? Date.now)()),
      }),
    };
    let response: Response;
    try {
      response = await input.deps.fetchImpl(input.url, {
        method: "GET",
        headers,
        cache: "no-store",
      });
    } catch (error) {
      completeIfNeeded(input.deps, reservation, {
        httpStatus: null,
        category: "upstream-or-transient",
        failed: true,
      });
      throw error;
    }
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { parseError: "invalid-json", length: text.length };
      }
    }
    last = {
      url: redactQuery(input.url),
      signPath: input.signPath,
      status: response.status,
      category: classifyHttpStatus(response.status, body),
      body,
      bodyTextHash: createHash("sha256").update(text).digest("hex"),
      attempt,
    };
    completeIfNeeded(input.deps, reservation, {
      httpStatus: last.status,
      category: last.category,
      failed: last.category !== "success" && last.category !== "empty-success",
    });
    if (!isRetryableCategory(last.category) || attempt === attempts) {
      return last;
    }
  }
  throw new KalshiBrtiAccessProbeError("signed get failed without result");
}

export async function unsignedKalshiGet(input: {
  url: string;
  signPath: string;
  budget: HttpBudget;
  maxRetries: number;
  deps: SignedGetDeps;
}): Promise<SignedGetResult> {
  let last: SignedGetResult | null = null;
  const attempts = input.maxRetries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reservation = reserveIfNeeded(input.deps);
    if (input.budget.remaining <= 0 && !reservation) {
      throw new KalshiBrtiAccessProbeError("http-request-budget-exhausted");
    }
    if (!reservation) {
      input.budget.remaining -= 1;
    } else {
      input.budget.remaining = reservation.limit - reservation.consumed;
    }
    let response: Response;
    try {
      response = await input.deps.fetchImpl(input.url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (error) {
      completeIfNeeded(input.deps, reservation, {
        httpStatus: null,
        category: "upstream-or-transient",
        failed: true,
      });
      throw error;
    }
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { parseError: "invalid-json", length: text.length };
      }
    }
    last = {
      url: redactQuery(input.url),
      signPath: input.signPath,
      status: response.status,
      category: classifyHttpStatus(response.status, body),
      body,
      bodyTextHash: createHash("sha256").update(text).digest("hex"),
      attempt,
    };
    completeIfNeeded(input.deps, reservation, {
      httpStatus: last.status,
      category: last.category,
      failed: last.category !== "success" && last.category !== "empty-success",
    });
    if (!isRetryableCategory(last.category) || attempt === attempts) {
      return last;
    }
  }
  throw new KalshiBrtiAccessProbeError("unsigned get failed without result");
}

function redactQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}
