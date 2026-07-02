/** Stable parameter-set directory ids: ps-0001, ps-0002, ... */
export function formatParameterSetId(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("parameter set index must be a positive integer");
  }

  return `ps-${String(index).padStart(4, "0")}`;
}
