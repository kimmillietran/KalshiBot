import {
  DEFAULT_MAPPING_OUT_DIR,
  DEFAULT_MAPPING_RAW_DIR,
  MAPPING_MAX_HTTP,
  MAPPING_MAX_POST_CLOSE_SETTLEMENT,
  V2_MAPPING_CAMPAIGN_ID,
  type ParsedMappingArgv,
} from "./types";

export function parseSettlementSampleMappingArgv(argv: readonly string[]): ParsedMappingArgv {
  const has = (flag: string) => argv.includes(flag);
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    if (index < 0) {
      return null;
    }
    return argv[index + 1] ?? null;
  };
  return {
    fixture: has("--fixture"),
    skipLive: has("--skip-live") || has("--fixture"),
    skipHttp: has("--skip-http") || has("--fixture"),
    skipOffline: has("--skip-offline"),
    waitForClose: has("--wait-for-close"),
    campaignId: read("--campaign-id") ?? V2_MAPPING_CAMPAIGN_ID,
    campaignDir: read("--campaign-dir") ?? DEFAULT_MAPPING_OUT_DIR,
    outDir: read("--out-dir") ?? DEFAULT_MAPPING_OUT_DIR,
    rawDir: read("--raw-dir") ?? DEFAULT_MAPPING_RAW_DIR,
    maxHttpRequests: Number(read("--max-http") ?? MAPPING_MAX_HTTP),
    maxPostCloseSettlement: Number(read("--max-post-close-settlement") ?? MAPPING_MAX_POST_CLOSE_SETTLEMENT),
  };
}
