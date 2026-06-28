export class PollingRateGovernorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollingRateGovernorConfigError";
  }
}
