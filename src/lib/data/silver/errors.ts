export class SilverNormalizationError extends Error {
  readonly code: string;
  readonly recordId?: string;

  constructor(message: string, code: string, recordId?: string) {
    super(message);
    this.name = "SilverNormalizationError";
    this.code = code;
    this.recordId = recordId;
  }
}

export class SilverUnsupportedContentTypeError extends SilverNormalizationError {
  readonly contentType: string;

  constructor(contentType: string, recordId?: string) {
    super(
      `Unsupported bronze contentType "${contentType}" for silver normalization`,
      "unsupported-content-type",
      recordId,
    );
    this.name = "SilverUnsupportedContentTypeError";
    this.contentType = contentType;
  }
}

export class SilverMalformedPayloadError extends SilverNormalizationError {
  readonly details: readonly string[];

  constructor(recordId: string, details: readonly string[]) {
    super(
      `Malformed bronze payload for record "${recordId}"`,
      "malformed-payload",
      recordId,
    );
    this.name = "SilverMalformedPayloadError";
    this.details = details;
  }
}

export class SilverInvalidBronzeRecordError extends SilverNormalizationError {
  readonly details: readonly string[];

  constructor(recordId: string, details: readonly string[]) {
    super(
      `Invalid bronze record "${recordId}"`,
      "invalid-bronze-record",
      recordId,
    );
    this.name = "SilverInvalidBronzeRecordError";
    this.details = details;
  }
}
