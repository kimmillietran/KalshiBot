import type { HttpErrorCategory } from "./types";

export function classifyHttpStatus(status: number, body: unknown): HttpErrorCategory {
  if (status === 401) {
    return "authentication-failure";
  }
  if (status === 403) {
    return "entitlement-denial";
  }
  if (status === 404) {
    return "not-found";
  }
  if (status === 400) {
    return "invalid-parameters";
  }
  if (status === 429) {
    return "rate-limited";
  }
  if (status >= 500) {
    // Kalshi maps upstream auth failure, server error, and timeout to 503.
    return "upstream-or-transient";
  }
  if (status >= 200 && status < 300) {
    if (isEmptySuccess(body)) {
      return "empty-success";
    }
    return "success";
  }
  return "unknown";
}

function isEmptySuccess(body: unknown): boolean {
  if (body == null) {
    return true;
  }
  if (typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (record.data == null && record.payload == null && !Array.isArray(record.values)) {
      const keys = Object.keys(record);
      return keys.length === 0;
    }
  }
  return false;
}

export function isRetryableCategory(category: HttpErrorCategory): boolean {
  return category === "rate-limited" || category === "upstream-or-transient";
}
