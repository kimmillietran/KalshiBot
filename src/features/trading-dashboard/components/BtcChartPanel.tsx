"use client";

import { GlassPanel, PanelBody, PanelHeader } from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useBtcChartData, useBtcPrice } from "@/features/btc-feed";
import { formatSignedDistance } from "@/features/btc-feed/utils";
import { useActiveBtcMarket } from "@/features/market-data";
import { chartColors, textChartAxis, toneClasses } from "@/lib/design-system";
import { formatUsd } from "@/lib/utils/format";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 340;
const PADDING = { top: 28, right: 24, bottom: 32, left: 56 };

export function BtcChartPanel() {
  const { points, currentPrice, targetPrice, status, isLoading } =
    useBtcChartData();
  const { isAboveTarget } = useBtcPrice();
  const market = useActiveBtcMarket();

  const hasPoints = points.length > 0;
  const chartPoints = hasPoints
    ? points
    : [{ time: "--:--", price: currentPrice }];

  const prices = chartPoints.map((p) => p.price);
  const minPrice = Math.min(...prices, targetPrice) - 20;
  const maxPrice = Math.max(...prices, targetPrice) + 20;
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

  const targetLabel = `Settlement target · ${formatUsd(targetPrice)}`;
  const targetLabelWidth = Math.max(168, targetLabel.length * 6.2);

  const subtitle =
    status === "loading" || isLoading
      ? "Loading live BTC data…"
      : market.isFallback
        ? "Live 1m candles · fallback Kalshi target"
        : market.noMarket
          ? "Live 1m candles · no active Kalshi market"
          : `Live 1m candles · ${isAboveTarget ? "above" : "below"} settlement target`;

  return (
    <GlassPanel variant="elevated" className="h-full">
      <PanelHeader
        title="BTC Price"
        subtitle={subtitle}
        action={
          <StatusBadge variant={isAboveTarget ? "success" : "danger"}>
            {isAboveTarget ? "Above target" : "Below target"}
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
              aria-label="BTC price chart with settlement target line"
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

              <rect
                x={PADDING.left}
                y={isAboveTarget ? targetY : currentY}
                width={plotWidth}
                height={Math.abs(targetY - currentY) || 1}
                fill={isAboveTarget ? chartColors.areaUp : chartColors.areaDown}
                fillOpacity={0.08}
              />

              <line
                x1={PADDING.left}
                y1={targetY}
                x2={CHART_WIDTH - PADDING.right}
                y2={targetY}
                stroke={chartColors.target}
                strokeWidth={2.5}
                strokeDasharray="8 5"
                strokeOpacity={0.95}
              />

              <rect
                x={PADDING.left + 4}
                y={targetY - 22}
                width={targetLabelWidth}
                height={18}
                rx={4}
                fill={chartColors.target}
                fillOpacity={0.18}
                stroke={chartColors.target}
                strokeOpacity={0.55}
              />
              <text
                x={PADDING.left + 10}
                y={targetY - 10}
                className="text-label font-semibold"
                fill={chartColors.targetLabel}
              >
                {targetLabel}
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
                x={toX(chartPoints.length - 1) - 56}
                y={currentY - 30}
                width={112}
                height={22}
                rx={4}
                fill={labelBg}
                fillOpacity={0.92}
              />
              <text
                x={toX(chartPoints.length - 1)}
                y={currentY - 15}
                textAnchor="middle"
                className="fill-white text-label font-semibold"
              >
                {formatUsd(currentPrice)}
              </text>
              <text
                x={toX(chartPoints.length - 1)}
                y={currentY + 18}
                textAnchor="middle"
                className={textChartAxis}
                fill={isAboveTarget ? chartColors.lineUp : chartColors.lineDown}
              >
                {formatSignedDistance(currentPrice - targetPrice)} vs target
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
        <p
          className={`mt-2 text-center text-xs font-medium ${isAboveTarget ? toneClasses.bullish.text : toneClasses.bearish.text}`}
        >
          BTC is {formatUsd(currentPrice)} —{" "}
          {isAboveTarget ? "above" : "below"} the {formatUsd(targetPrice)} settlement
          line
        </p>
      </PanelBody>
    </GlassPanel>
  );
}
