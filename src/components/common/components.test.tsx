import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlassPanel, PanelBody, PanelHeader } from "@/components/common/GlassPanel";
import { MetricCard } from "@/components/common/MetricCard";
import {
  ProbabilityBar,
  ProbabilityCompare,
} from "@/components/common/ProbabilityBar";
import { StatusBadge } from "@/components/common/StatusBadge";

describe("StatusBadge", () => {
  it("renders label text", () => {
    render(<StatusBadge variant="success">LIVE</StatusBadge>);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });
});

describe("GlassPanel", () => {
  it("renders children", () => {
    render(
      <GlassPanel>
        <PanelHeader title="Test Panel" subtitle="Subtitle" />
        <PanelBody>Panel content</PanelBody>
      </GlassPanel>,
    );
    expect(screen.getByText("Test Panel")).toBeInTheDocument();
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("renders label and value", () => {
    render(<MetricCard label="Fair Value" value="74¢" tone="bullish" />);
    expect(screen.getByText("Fair Value")).toBeInTheDocument();
    expect(screen.getByText("74¢")).toBeInTheDocument();
  });
});

describe("ProbabilityBar", () => {
  it("renders probability value", () => {
    render(<ProbabilityBar label="UP" value={74} tone="up" />);
    expect(screen.getByText("UP")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
  });

  it("renders compare columns", () => {
    render(
      <ProbabilityCompare
        kalshiUp={63}
        kalshiDown={38}
        modelUp={74}
        modelDown={26}
      />,
    );
    expect(screen.getByText("Kalshi says")).toBeInTheDocument();
    expect(screen.getByText("Model says")).toBeInTheDocument();
  });
});
