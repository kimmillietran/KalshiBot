import { describe, expect, it } from "vitest";

import {
  chartColors,
  heroActionClass,
  iconSize,
  labelClass,
  textLabel,
  toneClasses,
} from "@/lib/design-system";

describe("design system — toneClasses", () => {
  it("exports bullish, bearish, caution, and demo tones", () => {
    expect(toneClasses.bullish).toBeDefined();
    expect(toneClasses.bearish).toBeDefined();
    expect(toneClasses.caution).toBeDefined();
    expect(toneClasses.demo).toBeDefined();
  });

  it("maps bullish tone to text utility class", () => {
    expect(toneClasses.bullish.text).toBe("text-bullish");
  });
});

describe("design system — chartColors", () => {
  it("exports required chart line and target colors", () => {
    expect(chartColors.lineUp).toBeTruthy();
    expect(chartColors.lineDown).toBeTruthy();
    expect(chartColors.target).toBeTruthy();
    expect(chartColors.grid).toBeTruthy();
  });
});

describe("design system — typography", () => {
  it("textLabel export includes label utility classes", () => {
    expect(textLabel).toContain("text-label");
    expect(textLabel).toContain("text-muted-foreground");
  });

  it("labelClass composes label typography", () => {
    expect(typeof labelClass()).toBe("string");
    expect(labelClass().length).toBeGreaterThan(0);
  });

  it("heroActionClass returns bullish text class by default", () => {
    expect(heroActionClass()).toContain("text-bullish");
  });
});

describe("design system — iconSize", () => {
  it("exports sm, md, and lg sizes", () => {
    expect(iconSize.sm).toBe("size-3");
    expect(iconSize.md).toBe("size-4");
    expect(iconSize.lg).toBe("size-5");
  });
});
