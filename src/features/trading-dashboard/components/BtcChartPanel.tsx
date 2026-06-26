"use client";

import { GlassPanel, PanelBody, PanelHeader } from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useBtcChartData } from "@/features/btc-feed";
import { useActiveBtcMarket } from "@/features/market-data";
import { chartColors, textChartAxis } from "@/lib/design-system";
import { formatUsd } from "@/lib/utils/format";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 320;
const PADDING = { top: 24, right: 80, bottom: 32, left: 56 };

export function BtcChartPanel() {
  const { points, currentPrice, targetPrice, status, isLoading } =
    useBtcChartData();
  const market = useActiveBtcMarket();

  const hasPoints = points.length > 0;
  const chartPoints = hasPoints
    ? points
    : [{ time: "--:--", price: currentPrice }];

  const prices = chartPoints.map((p) => p.price);
  const minPrice = Math.min(...prices, targetPrice) - 15;
  const maxPrice = Math.max(...prices, targetPrice) + 15;
  const priceRange = maxPrice - minPrice || 1;

  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const denom = Math.max(1, chartPoints.length - 1);
  const toX = (index: number) => PADDING.left + (index / denom) * plotWidth;
  const toY = (price: number) =>
    PADDING.top + plotHeight - ((price - minPrice) / priceRange) * plotHeight;

  const linePath = chartPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.price)}`)
    .join(" ");

  const areaPath = `${linePath} L ${toX(chartPoints.length - 1)} ${PADDING.top + plotHeight} L ${toX(0)} ${PADDING.top + plotHeight} Z`;

  const targetY = toY(targetPrice);
  const currentY = toY(currentPrice);
  const isBullish = currentPrice >= chartPoints[0].price;

  const lineColor = isBullish ? chartColors.lineUp : chartColors.lineDown;
  const areaColor = isBullish ? chartColors.areaUp : chartColors.areaDown;
  const labelBg = isBullish
    ? chartColors.labelUpBg
    : chartColors.labelDownBg;

  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const price = minPrice + (priceRange / (yTicks - 1)) * i;
    return { price, y: toY(price) };
  });

  const xLabelIndices = hasPoints
    ? [0, Math.floor(chartPoints.length / 2), chartPoints.length - 1]
    : [0];

  const subtitle =
    status === "loading" || isLoading
      ? "Loading live BTC data…"
      : market.isFallback
        ? "Live 1m candles · fallback Kalshi target"
        : market.noMarket
          ? "Live 1m candles · no active Kalshi market"
          : "Live 1m candles · Kalshi target";

  return (
    <GlassPanel variant="elevated" className="h-full">
      <PanelHeader
        title="BTC Price"
        subtitle={subtitle}
        action={
          <StatusBadge variant={isBullish ? "success" : "danger"}>
            {isBullish ? "Bullish" : "Bearish"}
          </StatusBadge>
        }
      />
      <PanelBody className="p-2 sm:p-4">
        <div className="relative w-full overflow-hidden">
          {isLoading ? (
            <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
              Loading BTC chart…
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="h-auto w-full"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="BTC price chart with target line"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={areaColor}
                    stopOpacity={chartColors.areaFillOpacity}
                  />
                  <stop
                    offset="100%"
                    stopColor={areaColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              {yLabels.map(({ y }, i) => (
                <g key={i}>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={CHART_WIDTH - PADDING.right}
                    y2={y}
                    stroke={chartColors.grid}
                    strokeOpacity={chartColors.gridOpacity}
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className={textChartAxis}
                  >
                    {formatUsd(yLabels[i].price, true)}
                  </text>
                </g>
              ))}

              <line
                x1={PADDING.left}
                y1={targetY}
                x2={CHART_WIDTH - PADDING.right}
                y2={targetY}
                stroke={chartColors.target}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={chartColors.targetStrokeOpacity}
              />
              <text
                x={CHART_WIDTH - PADDING.right + 6}
                y={targetY + 4}
                className="text-label font-medium"
                fill={chartColors.targetLabel}
              >
                Target {formatUsd(targetPrice)}
              </text>

              <path d={areaPath} fill="url(#chartGradient)" />

              <path
                d={linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              <circle
                cx={toX(chartPoints.length - 1)}
                cy={currentY}
                r={5}
                fill={lineColor}
                stroke={chartColors.dotStroke}
                strokeWidth={2}
              />
              <rect
                x={toX(chartPoints.length - 1) - 52}
                y={currentY - 28}
                width={104}
                height={20}
                rx={4}
                fill={labelBg}
                fillOpacity={0.9}
              />
              <text
                x={toX(chartPoints.length - 1)}
                y={currentY - 14}
                textAnchor="middle"
                className="fill-white text-label font-semibold"
              >
                {formatUsd(currentPrice)}
              </text>

              {xLabelIndices.map((idx) => (
                <text
                  key={idx}
                  x={toX(idx)}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className={textChartAxis}
                >
                  {chartPoints[idx].time}
                </text>
              ))}
            </svg>
          )}
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
