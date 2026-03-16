import type { AppSettings, MACDResult, ScoreBreakdown, SDAnalysis, SignalType } from "@/types";
import type { CandlePattern } from "@/types";
import { getRSIZone } from "@/lib/indicators/rsi";

export interface ScoringInput {
  ema20: number;
  ema50: number;
  ema20Prev: number;
  ema50Prev: number;
  rsi: number;
  macd: MACDResult;
  macdPrev: MACDResult;
  atr: number;
  avgAtr: number;               // rolling average ATR (last 20)
  nearSupport: boolean;
  nearResistance: boolean;
  brokeResistance: boolean;
  brokeSupport: boolean;
  patterns: CandlePattern[];
  sd: SDAnalysis;
  settings: AppSettings;
  // New indicators
  adx: number;
  plusDI: number;
  minusDI: number;
  bbPercentB: number;
  bbWidth: number;
  stochK: number;
  stochD: number;
  stochKPrev: number;
  stochDPrev: number;
  divergenceScore: number;      // pre-computed by signal engine (-2 to +2)
  marketStructureScore: number; // pre-computed BOS/CHOCH score (-2 to +2)
  mtfScore: number;             // pre-computed higher-TF trend bias (-2 to +2)
}

/**
 * Trend Score (-2 to +2):
 *  +2: EMA20 well above EMA50 and widening
 *  +1: EMA20 above EMA50
 *  0:  EMA20 ≈ EMA50
 *  -1: EMA20 below EMA50
 *  -2: EMA20 well below EMA50 and widening
 */
export function trendScore(input: ScoringInput): number {
  const { ema20, ema50, ema20Prev, ema50Prev } = input;
  if (isNaN(ema20) || isNaN(ema50)) return 0;

  const gap = ema20 - ema50;
  const prevGap = ema20Prev - ema50Prev;
  const widening = Math.abs(gap) > Math.abs(prevGap);

  if (gap > 0) return widening ? 2 : 1;
  if (gap < 0) return widening ? -2 : -1;
  return 0;
}

/**
 * Momentum Score (-2 to +2):
 *  Based on RSI zone and MACD cross/direction
 */
export function momentumScore(input: ScoringInput): number {
  const { rsi, macd, macdPrev, settings } = input;
  let score = 0;

  if (!isNaN(rsi)) {
    const zone = getRSIZone(rsi, settings.rsiOversold, settings.rsiOverbought);
    if (zone === "bullish") score += 1;
    else if (zone === "overbought") score -= 1; // weakening
    else if (zone === "bearish") score -= 1;
    else if (zone === "oversold") score += 1; // potential reversal
  }

  if (!isNaN(macd.histogram) && !isNaN(macdPrev.histogram)) {
    // MACD bullish cross
    if (macdPrev.macdLine <= macdPrev.signalLine && macd.macdLine > macd.signalLine) {
      score += 1;
    }
    // MACD bearish cross
    if (macdPrev.macdLine >= macdPrev.signalLine && macd.macdLine < macd.signalLine) {
      score -= 1;
    }
    // Histogram growing bullish
    if (macd.histogram > 0 && macd.histogram > macdPrev.histogram) score += 0.5;
    // Histogram growing bearish
    if (macd.histogram < 0 && macd.histogram < macdPrev.histogram) score -= 0.5;
  }

  // Stochastic confirmation
  const { stochK, stochD, stochKPrev, stochDPrev } = input;
  if (!isNaN(stochK) && !isNaN(stochD)) {
    // Bullish cross in oversold zone
    if (stochK > stochD && stochKPrev <= stochDPrev && stochK < 50) score += 0.5;
    // Bearish cross in overbought zone
    if (stochK < stochD && stochKPrev >= stochDPrev && stochK > 50) score -= 0.5;
    // Deep oversold
    if (stochK < 20 && stochD < 20) score += 0.5;
    // Deep overbought
    if (stochK > 80 && stochD > 80) score -= 0.5;
  }

  return Math.max(-2, Math.min(2, score));
}

/**
 * Breakout / Reversal Score (-2 to +2):
 *  Price action relative to S/R
 */
export function breakoutScore(input: ScoringInput): number {
  const { nearSupport, nearResistance, brokeResistance, brokeSupport } = input;

  if (brokeResistance) return 2;    // strong bullish breakout
  if (brokeSupport) return -2;      // strong bearish breakdown
  if (nearSupport) return 1;        // potential bounce
  if (nearResistance) return -1;    // potential rejection
  return 0;
}

/**
 * Volatility Penalty (0 to -2):
 *  High ATR spike penalizes signal strength (avoid bad entries)
 */
export function volatilityPenalty(input: ScoringInput): number {
  const { atr, avgAtr, settings } = input;
  if (isNaN(atr) || isNaN(avgAtr) || avgAtr === 0) return 0;

  const ratio = atr / avgAtr;
  if (ratio > settings.volatilityThreshold) return -2;
  if (ratio > settings.volatilityThreshold * 0.75) return -1;
  return 0;
}

/**
 * Pattern Bonus (-1 to +1)
 */
export function patternBonusScore(patterns: CandlePattern[]): number {
  if (patterns.length === 0) return 0;

  // Use most recent pattern
  const latest = patterns[patterns.length - 1];
  if (latest.direction === "bullish") return 1;
  if (latest.direction === "bearish") return -1;
  return 0;
}

/** Convert total score to signal type */
export function scoreToSignal(total: number, minConfidence: number, confidence: number): SignalType {
  if (confidence < minConfidence) return "HOLD";

  if (total >= 4) return "STRONG_BUY";
  if (total >= 2) return "BUY";
  if (total <= -4) return "STRONG_SELL";
  if (total <= -2) return "SELL";
  return "HOLD";
}

/**
 * Supply & Demand Zone Score (capped at ±4) — highest weight component.
 *
 * Raw sdScore from analyzeSDZones is strength-weighted and continuous:
 *   In-zone fresh  strength-3 → sdScore = +3.0 → final +4 (capped)
 *   In-zone fresh  strength-2 → sdScore = +2.0 → final +4 (capped)
 *   In-zone fresh  strength-1 → sdScore = +1.0 → final +2
 *   In-zone tested strength-3 → sdScore = +1.5 → final +3
 *   In-zone tested strength-1 → sdScore = +0.5 → final +1
 *   Near-zone (approaching)   → sdScore 0–1.0  → final 0–2 (graduated)
 *   0: No significant S&D context
 *   (negated for supply / bearish direction)
 *
 * Multiplied by 2 to make S&D the dominant factor in signal confidence.
 */
export function supplyDemandScore(sd: SDAnalysis): number {
  return Math.max(-4, Math.min(4, sd.sdScore * 2));
}

/**
 * ADX Score (-1 to +1):
 *  +1: ADX > 25 (trending market — trust EMA/MACD direction signals)
 *   0: ADX 20–25 (developing trend)
 *  -1: ADX < 20 (ranging market — trend signals less reliable)
 */
export function adxScore(adx: number): number {
  if (isNaN(adx)) return 0;
  if (adx > 25) return 1;
  if (adx < 20) return -1;
  return 0;
}

/**
 * Bollinger Band Score (-2 to +2), trend-aware:
 *
 * "Price below lower band" means opposite things depending on context:
 *  - In an uptrend  → oversold extension, likely snap-back → +2 (bullish)
 *  - In a downtrend → trend continuation / breakdown       → -1 (bearish)
 *
 * Similarly "above upper band":
 *  - In a downtrend → overbought extension, likely snap-back → -2 (bearish)
 *  - In an uptrend  → trend continuation / breakout          → +1 (bullish)
 *
 * Mid-band extremes (near lower/upper in neutral zone) are direction-neutral.
 * Squeeze penalty remains regardless of trend.
 */
export function bbScore(percentB: number, bbWidth: number, ema20: number, ema50: number): number {
  if (isNaN(percentB)) return 0;
  const bullishTrend = !isNaN(ema20) && !isNaN(ema50) && ema20 > ema50;
  let score = 0;

  if (percentB < 0) {
    // Below lower band: bounce signal in uptrend, trend extension in downtrend
    score = bullishTrend ? 2 : -1;
  } else if (percentB <= 0.1) {
    score = bullishTrend ? 1 : 0;
  } else if (percentB >= 1) {
    // Above upper band: breakdown signal in downtrend, trend extension in uptrend
    score = bullishTrend ? 1 : -2;
  } else if (percentB >= 0.9) {
    score = bullishTrend ? 0 : -1;
  }

  // Squeeze penalty: very narrow bands signal uncertainty (breakout could go either way)
  if (!isNaN(bbWidth) && bbWidth < 0.003) score -= 1;

  return Math.max(-2, Math.min(2, score));
}

/** Convert total score to confidence 0–100 */
export function scoreToConfidence(score: ScoreBreakdown): number {
  // Base max = non-SD components:
  //   trend(2) + momentum(2) + breakout(2) + pattern(1) + adx(1) + bb(2)
  //   + divergence(2) + marketStructure(2) + mtf(2) = 16
  // S&D (±4) is treated as a bonus that can push confidence above the base
  // ceiling, capped at 100.
  const maxScore = 16;
  const raw = (score.total / maxScore) * 100;
  return Math.round(Math.min(100, Math.max(0, Math.abs(raw))));
}

export function computeScoreBreakdown(input: ScoringInput): ScoreBreakdown {
  const trend           = trendScore(input);
  const momentum        = momentumScore(input);
  const breakout        = breakoutScore(input);
  const volatility      = volatilityPenalty(input);
  const pattern         = patternBonusScore(input.patterns);
  const sd              = supplyDemandScore(input.sd);
  const adx             = adxScore(input.adx);
  const bb              = bbScore(input.bbPercentB, input.bbWidth, input.ema20, input.ema50);
  const divergence      = Math.max(-2, Math.min(2, input.divergenceScore ?? 0));
  const marketStructure = Math.max(-2, Math.min(2, input.marketStructureScore ?? 0));
  const mtf             = Math.max(-2, Math.min(2, input.mtfScore ?? 0));

  const total =
    trend + momentum + breakout + volatility + pattern +
    sd + adx + bb + divergence + marketStructure + mtf;

  return {
    trendScore:           trend,
    momentumScore:        momentum,
    breakoutScore:        breakout,
    volatilityPenalty:    volatility,
    patternBonus:         pattern,
    sdScore:              sd,
    adxScore:             adx,
    bbScore:              bb,
    divergenceScore:      divergence,
    marketStructureScore: marketStructure,
    mtfScore:             mtf,
    total,
  };
}
