import type { ForwardCaptureConnectionDiagnostics } from "./forwardQuoteCaptureTypes";

export function createEmptyConnectionDiagnostics(
  overrides?: Partial<ForwardCaptureConnectionDiagnostics>,
): ForwardCaptureConnectionDiagnostics {
  return {
    wsConnectCount: 0,
    wsDisconnectCount: 0,
    reconnectCount: 0,
    connected: false,
    everConnected: false,
    completedNormally: false,
    liveConnectionSucceeded: false,
    completedWithWarnings: false,
    terminalFailureReason: null,
    captureEndReason: null,
    ...overrides,
  };
}
