export type ConfidenceLevel = "Low" | "Medium" | "High";
export type RecommendationAction = "BUY UP" | "BUY DOWN" | "HOLD" | "NO TRADE";
export type TrendDirection = "Bullish" | "Bearish" | "Neutral";
export type RiskLevel = "Low" | "Medium" | "High";
export type LiquidityQuality = "Poor" | "Fair" | "Good" | "Excellent";
export type EvLabel = "Positive EV" | "Negative EV" | "Neutral EV";

export type ChartPoint = {
  time: string;
  price: number;
};

export type ContractOdds = {
  label: "UP" | "DOWN";
  price: number;
  bid: number;
  ask: number;
  volume: string;
  impliedProbability: number;
  spread: number;
};

export type PlaybookItem = {
  label: string;
  checked: boolean;
};

export type TradingMockData = {
  commandBar: {
    btcPrice: number;
    change24h: number;
    change24hPercent: number;
    marketStatus: string;
    currentMarket: string;
    timeRemaining: string;
    expiration: string;
    lastUpdated: string;
  };
  market: {
    targetPrice: number;
    distanceFromTarget: number;
    distancePercent: number;
  };
  contracts: {
    up: ContractOdds;
    down: ContractOdds;
  };
  model: {
    probabilityUp: number;
    probabilityDown: number;
    fairValueUp: number;
    mispricingCents: number;
    edgePercent: number;
    evLabel: EvLabel;
  };
  recommendation: {
    action: RecommendationAction;
    stars: number;
    confidence: ConfidenceLevel;
    edge: string;
    ev: EvLabel;
    actionStatus: string;
    takeProfitZone: string;
    stopLoss: string;
    entryZone: string;
    riskLevel: RiskLevel;
  };
  structure: {
    trend: TrendDirection;
    momentum: string;
    structure: string;
    targetBehavior: string;
    patternDetected: string;
    riskWarning: string;
    volatility: string;
  };
  tradeManagement: {
    hasActiveTrade: boolean;
    suggestedEntry: string;
    takeProfit: string;
    cutLoss: string;
    doNotChaseAbove: string;
    holdIntoExpiration: string;
  };
  reasoning: {
    summary: string;
    playbook: PlaybookItem[];
  };
  chart: {
    points: ChartPoint[];
    targetPrice: number;
    currentPrice: number;
  };
};
