import type { QuoteFidelityGateIo } from "./quoteFidelityGateTypes";

export function resolveMarketFixturePath(input: {
  marketTicker: string;
  registryFixturePath: string;
  fixturesDir: string | null;
  io: QuoteFidelityGateIo;
}): string {
  if (input.io.fileExists(input.registryFixturePath)) {
    return input.registryFixturePath;
  }

  if (input.fixturesDir) {
    const normalizedDir = input.fixturesDir.replace(/\\/g, "/").replace(/\/$/, "");
    const candidate = `${normalizedDir}/${input.marketTicker}/fixture.json`;
    if (input.io.fileExists(candidate)) {
      return candidate;
    }
  }

  return input.registryFixturePath;
}
