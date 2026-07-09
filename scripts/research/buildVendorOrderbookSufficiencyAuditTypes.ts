import {
  DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
  DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_HTML_OUTPUT_PATH,
  DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_OUTPUT_PATH,
  VendorOrderbookSufficiencyAuditError,
  buildDefaultVendorAuditInputPaths,
  type VendorOrderbookSufficiencyAuditInputPaths,
} from "@/lib/data/research/vendorOrderbookSufficiencyAudit";

export class VendorOrderbookSufficiencyAuditCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorOrderbookSufficiencyAuditCommandError";
  }
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output")
    ?? DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_OUTPUT_PATH;
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output")
    ?? DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_HTML_OUTPUT_PATH;
}

export function parseInputPathsFromArgv(
  argv: readonly string[],
): VendorOrderbookSufficiencyAuditInputPaths {
  return buildDefaultVendorAuditInputPaths({
    configPath: readFlagValue(argv, "--config") ?? DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
    samplesRoot: readFlagValue(argv, "--samples-root"),
  });
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof VendorOrderbookSufficiencyAuditCommandError) {
    return error.message;
  }

  if (error instanceof VendorOrderbookSufficiencyAuditError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Vendor orderbook sufficiency audit failed";
}

export type VendorOrderbookSufficiencyAuditCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};
