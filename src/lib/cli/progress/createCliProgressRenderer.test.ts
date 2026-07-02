import { describe, expect, it, vi } from "vitest";

import { createCliProgressRenderer } from "./createCliProgressRenderer";

describe("createCliProgressRenderer", () => {
  it("emits periodic updates in non-TTY mode", () => {
    const write = vi.fn();
    const renderer = createCliProgressRenderer({
      isTty: false,
      nonTtyUpdateEvery: 10,
      write,
    });

    renderer.render(9, 100, ["line-9"]);
    renderer.render(10, 100, ["line-10"]);
    renderer.render(11, 100, ["line-11"]);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain("line-10");
  });

  it("always emits the final completion block in non-TTY mode", () => {
    const write = vi.fn();
    const renderer = createCliProgressRenderer({
      isTty: false,
      nonTtyUpdateEvery: 10,
      write,
    });

    renderer.complete(["done"]);

    expect(write).toHaveBeenCalledWith("done\n");
  });

  it("rewrites prior lines in TTY mode", () => {
    const write = vi.fn();
    const renderer = createCliProgressRenderer({
      isTty: true,
      write,
    });

    renderer.render(1, 3, ["first"]);
    renderer.render(2, 3, ["second"]);

    const output = write.mock.calls.map(([chunk]) => chunk).join("");
    expect(output).toContain("\x1b[2Ksecond");
    expect(write.mock.calls.length).toBeGreaterThan(2);
  });

  it("does not write to stdout", () => {
    const write = vi.fn();
    const renderer = createCliProgressRenderer({
      isTty: false,
      write,
    });

    renderer.render(10, 100, ["[Import]", "progress"]);

    expect(write).not.toHaveBeenCalledWith(expect.stringContaining("stdout"));
  });
});
