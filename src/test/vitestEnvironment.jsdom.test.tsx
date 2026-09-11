import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
});

describe("Vitest environment selection (jsdom for tsx)", () => {
  it("provides a real document for React Testing Library", () => {
    expect(typeof document).toBe("object");
    expect(document).not.toBeNull();

    render(<button type="button">jsdom-ok</button>);
    expect(screen.getByRole("button", { name: "jsdom-ok" })).toBeTruthy();
  });
});
