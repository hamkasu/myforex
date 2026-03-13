// ─── Core OHLCV Candle ──────────────────────────────────────────────────────

export interface Candle {
  time: number;        // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ─── Forex Pairs & Timeframes ────────────────────────────────────────────────

export type ForexPair =
  // Major forex pairs
  | "EUR/USD" | "GBP/USD" | "USD/JPY" | "GBP/JPY"
  | "AUD/USD" | "USD/CAD" | "EUR/JPY" | "EUR/GBP"
  // Commodities
  | "XAU/USD"
  // Stock indices
  | "SPX500" | "NAS100" | "GER40";

export type Timeframe = "1h" | "4h" | "1d";

export const FOREX_PAIRS: ForexPair[] = [
  "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY",
  "AUD/USD", "USD/CAD", "EUR/JPY", "EUR/GBP",
  "XAU/USD",
  "SPX500", "NAS100", "GER40",
];
export const TIMEFRAMES: Timeframe[] = ["1h", "4h", "1d"];

// ─── Indicator Results ───────────────────────────────────────────────────────

export interface IndicatorResult {
  ema20: number[];
  ema50: number[];
  rsi: number[];
  macd: MACDResult[];
  atr: number[];
  supportLevels: number[];
  resistanceLevels: number[];
  patterns: CandlePattern[];
}

export interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export interface CandlePattern {
  index: number;
  type: PatternType;
  direction: "bullish" | "bearish" | "neutral";
}

export type PatternType =
  | "engulfing"
  | "pin_bar"
  | "doji"
  | "hammer"
  | "shooting_star";

// ─── Supply & Demand Zones ───────────────────────────────────────────────────

export type SDZoneStatus = "fresh" | "tested" | "broken";
export type SDZoneType = "supply" | "demand";

export interface SDZone {
  type: SDZoneType;
  top: number;
  bottom: number;
  /** 1 = weak (1.5–2× ATR impulse), 2 = moderate, 3 = strong (>3× ATR) */
  strength: 1 | 2 | 3;
  status: SDZoneStatus;
  timeIndex: number;     // candle index where the impulse originated
  impulseSize: number;   // impulse body as multiple of ATR
}

export interface SDAnalysis {
  supplyZones: SDZone[];
  demandZones: SDZone[];
  inSupplyZone: boolean;
  inDemandZone: boolean;
  freshSupplyAbove: SDZone | null;
  freshDemandBelow: SDZone | null;
  nearFreshDemand: boolean;
  nearFreshSupply: boolean;
  sdScore: number;       // -2 to +2
}

// ─── Signal Engine ───────────────────────────────────────────────────────────

export type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface ScoreBreakdown {
  trendScore: number;        // -2 to +2
  momentumScore: number;     // -2 to +2
  breakoutScore: number;     // -2 to +2
  volatilityPenalty: number; // 0 to -2
  patternBonus: number;      // -1 to +1
  sdScore: number;           // -2 to +2  (supply & demand zones)
  adxScore: number;          // -1 (ranging) | 0 | +1 (strongly trending)
  bbScore: number;           // -2 to +2  (Bollinger Band position)
  total: number;             // sum of all dimensions
}

export interface SignalResult {
  pair: ForexPair;
  timeframe: Timeframe;
  timestamp: number;
  signal: SignalType;
  confidence: number;       // 0–100
  score: ScoreBreakdown;
  reasons: string[];
  currentPrice: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  atrValue: number;
  higherTimeframeConfirmed?: boolean;
}

// ─── Trade Setup ─────────────────────────────────────────────────────────────

export interface TradeSetup {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  direction: "long" | "short";
  pips: number;
}

// ─── Backtest ────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  pair: ForexPair;
  timeframe: Timeframe;
  direction: "long" | "short";
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  outcome: "win" | "loss" | "breakeven";
  pnlR: number;              // profit/loss in R (risk units)
  signal: SignalType;
  confidence: number;
}

export interface ConfidenceBand {
  label: string;        // e.g. "55–64%"
  minConf: number;      // inclusive lower bound (0–100)
  maxConf: number;      // exclusive upper bound (0–100)
  trades: number;
  wins: number;
  winRate: number;      // 0–1
  avgR: number;         // average pnlR
}

export interface BacktestResult {
  pair: ForexPair;
  timeframe: Timeframe;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;           // 0–1
  averageRR: number;
  maxDrawdown: number;       // in R
  profitFactor: number;
  totalR: number;
  equityCurve: number[];     // cumulative R
  calibration: ConfidenceBand[];
  trades: BacktestTrade[];
  runAt: number;             // timestamp
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  rsiOversold: number;
  rsiOverbought: number;
  rsiMomentumLow: number;
  rsiMomentumHigh: number;
  ema1Period: number;
  ema2Period: number;
  atrMultiplierSL: number;
  atrMultiplierTP: number;
  minConfidence: number;
  trendWeight: number;
  momentumWeight: number;
  breakoutWeight: number;
  patternWeight: number;
  volatilityThreshold: number;
  enableBrowserNotifications: boolean;
  alertMinConfidence: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  rsiOversold: 30,
  rsiOverbought: 70,
  rsiMomentumLow: 50,
  rsiMomentumHigh: 70,
  ema1Period: 20,
  ema2Period: 50,
  atrMultiplierSL: 1.5,
  atrMultiplierTP: 2.5,
  minConfidence: 55,
  trendWeight: 2,
  momentumWeight: 2,
  breakoutWeight: 2,
  patternWeight: 1,
  volatilityThreshold: 2.5,
  enableBrowserNotifications: false,
  alertMinConfidence: 65,
};

// ─── Storage ─────────────────────────────────────────────────────────────────

export interface StoredSignal extends SignalResult {
  id: string;
}

export interface AlertConfig {
  pair: ForexPair;
  minConfidence: number;
  signalTypes: SignalType[];
  enabled: boolean;
}

// ─── Data Provider ───────────────────────────────────────────────────────────

export interface DataProvider {
  getCandles(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]>;
  getName(): string;
}

// ─── UI State ────────────────────────────────────────────────────────────────

export type TabId = "overview" | "indicators" | "history" | "backtest" | "settings";

export interface AppState {
  selectedPair: ForexPair;
  selectedTimeframe: Timeframe;
  activeTab: TabId;
  isOnline: boolean;
}
