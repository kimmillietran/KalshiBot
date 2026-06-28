export const OrderbookFeedErrorCode = {
  SEQUENCE_GAP: "sequence-gap",
  INVALID_MESSAGE: "invalid-message",
  RESYNC_FAILED: "resync-failed",
  TRANSPORT_ERROR: "transport-error",
} as const;

export type OrderbookFeedErrorCode =
  (typeof OrderbookFeedErrorCode)[keyof typeof OrderbookFeedErrorCode];

export class OrderbookFeedError extends Error {
  readonly code: OrderbookFeedErrorCode;

  constructor(message: string, code: OrderbookFeedErrorCode) {
    super(message);
    this.name = "OrderbookFeedError";
    this.code = code;
  }
}
