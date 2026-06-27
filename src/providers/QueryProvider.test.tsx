import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueryProvider } from "./QueryProvider";

describe("QueryProvider", () => {
  it("renders children", () => {
    render(
      <QueryProvider>
        <p>Dashboard child</p>
      </QueryProvider>,
    );

    expect(screen.getByText("Dashboard child")).toBeInTheDocument();
  });
});
