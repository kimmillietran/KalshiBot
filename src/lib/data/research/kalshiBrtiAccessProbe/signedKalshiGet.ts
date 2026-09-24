import { createHash } from "node:crypto";

import { createKalshiAuthHeaders } from "@/lib/data/live/kalshiWsCaptureSpike/kalshiAuthHeaders";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";

import { classifyHttpStatus, isRetryableCategory } from "./classifyHttpError";
import { KalshiBrtiAccessProbeError, type SignedGetResult } from "./types";

export type HttpBudget = {
  remaining: number;
};

export type SignedGetDeps = {
  fetchImpl: typeof fetch;
  nowMs?: () => number;
};

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
    if (input.budget.remaining <= 0) {
      throw new KalshiBrtiAccessProbeError("http-request-budget-exhausted");
    }
    input.budget.remaining -= 1;
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
    const response = await input.deps.fetchImpl(input.url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
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
    if (input.budget.remaining <= 0) {
      throw new KalshiBrtiAccessProbeError("http-request-budget-exhausted");
    }
    input.budget.remaining -= 1;
    const response = await input.deps.fetchImpl(input.url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
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
