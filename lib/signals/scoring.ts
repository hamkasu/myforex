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
  avgAtr: number;           // rolling average ATR (last 20)
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
 * Supply & Demand Zone Score (-2 to +2):
 *  +2: Price inside a demand zone (strong buy area)
 *  +1: Price approaching a fresh demand zone below
 *  0:  No significant S&D context
 *  -1: Price approaching a fresh supply zone above
 *  -2: Price inside a supply zone (strong sell area)
 */
export function supplyDemandScore(sd: SDAnalysis): number {
  return Math.max(-2, Math.min(2, sd.sdScore));
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
 * Bollinger Band Score (-2 to +2):
 *  Based on %B (price position within the bands):
 *  < 0   → below lower band (oversold extension)           +2
 *  0–0.1 → near lower band (potential support/bounce)      +1
 *  0.9–1 → near upper band (potential resistance/rejection) -1
 *  > 1   → above upper band (overbought extension)         -2
 *  Squeeze (very narrow bands): -1 modifier (uncertainty)
 */
export function bbScore(percentB: number, bbWidth: number): number {
  if (isNaN(percentB)) return 0;
  let score = 0;

  if (percentB < 0)    score = 2;   // below lower band — oversold
  else if (percentB <= 0.1) score = 1;  // near lower band
  else if (percentB >= 1)   score = -2; // above upper band — overbought
  else if (percentB >= 0.9) score = -1; // near upper band

  // Squeeze penalty: very narrow bands signal uncertainty (breakout could go either way)
  if (!isNaN(bbWidth) && bbWidth < 0.003) score -= 1;

  return Math.max(-2, Math.min(2, score));
}

/** Convert total score to confidence 0–100 */
export function scoreToConfidence(score: ScoreBreakdown): number {
  // Max possible |score|: 2+2+2+2+1+1+2 = 12
  const maxScore = 12;
  const raw = (score.total / maxScore) * 100;
  return Math.round(Math.min(100, Math.max(0, Math.abs(raw))));
}

export function computeScoreBreakdown(input: ScoringInput): ScoreBreakdown {
  const trend      = trendScore(input);
  const momentum   = momentumScore(input);
  const breakout   = breakoutScore(input);
  const volatility = volatilityPenalty(input);
  const pattern    = patternBonusScore(input.patterns);
  const sd         = supplyDemandScore(input.sd);
  const adx        = adxScore(input.adx);
  const bb         = bbScore(input.bbPercentB, input.bbWidth);

  const total = trend + momentum + breakout + volatility + pattern + sd + adx + bb;

  return {
    trendScore:        trend,
    momentumScore:     momentum,
    breakoutScore:     breakout,
    volatilityPenalty: volatility,
    patternBonus:      pattern,
    sdScore:           sd,
    adxScore:          adx,
    bbScore:           bb,
    total,
  };
}
