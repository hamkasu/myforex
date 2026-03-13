import type { Candle, ForexPair, SDAnalysis, SignalResult, Timeframe, AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { getPairDecimals } from "@/lib/utils/pairs";
import { calculateEMA } from "@/lib/indicators/ema";
import { calculateRSI } from "@/lib/indicators/rsi";
import { calculateMACD } from "@/lib/indicators/macd";
import { calculateATR, atrTradeSetup, isHighVolatility } from "@/lib/indicators/atr";
import {
  calculateSupportResistance,
  nearSupport,
  nearResistance,
  brokeResistance,
  brokeSupport,
} from "@/lib/indicators/supportResistance";
import { detectPatterns, patternLabel } from "@/lib/indicators/patterns";
import { analyzeSDZones, buildSDReason } from "@/lib/indicators/supplyDemand";
import { calculateADX } from "@/lib/indicators/adx";
import { calculateBollingerBands } from "@/lib/indicators/bollingerBands";
import { calculateStochastic } from "@/lib/indicators/stochastic";
import {
  computeScoreBreakdown,
  scoreToSignal,
  scoreToConfidence,
} from "./scoring";

export interface EngineOutput extends SignalResult {
  indicators: {
    ema20: number;
    ema50: number;
    rsi: number;
    macdLine: number;
    signalLine: number;
    histogram: number;
    atr: number;
    supportLevels: number[];
    resistanceLevels: number[];
    detectedPatterns: string[];
    sd: SDAnalysis;
    // New indicators
    adx: number;
    plusDI: number;
    minusDI: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    bbWidth: number;
    bbPercentB: number;
    stochK: number;
    stochD: number;
  };
}

function buildReasons(
  score: ReturnType<typeof computeScoreBreakdown>,
  input: {
    ema20: number;
    ema50: number;
    rsi: number;
    macdLine: number;
    macdSignal: number;
    nearSup: boolean;
    nearRes: boolean;
    brokRes: boolean;
    brokSup: boolean;
    patterns: string[];
    highVol: boolean;
    sd: SDAnalysis;
    decimals: number;
  }
): string[] {
  const reasons: string[] = [];

  // Trend
  if (score.trendScore >= 2)
    reasons.push(`EMA20 (${input.ema20.toFixed(input.decimals)}) strongly above EMA50 (${input.ema50.toFixed(input.decimals)}) — bullish trend`);
  else if (score.trendScore === 1)
    reasons.push(`EMA20 above EMA50 — uptrend confirmed`);
  else if (score.trendScore <= -2)
    reasons.push(`EMA20 (${input.ema20.toFixed(input.decimals)}) strongly below EMA50 (${input.ema50.toFixed(input.decimals)}) — bearish trend`);
  else if (score.trendScore === -1)
    reasons.push(`EMA20 below EMA50 — downtrend active`);
  else
    reasons.push(`EMAs converging — trend unclear`);

  // Momentum (RSI)
  if (!isNaN(input.rsi)) {
    reasons.push(`RSI is ${input.rsi.toFixed(1)} — ${
      input.rsi < 30 ? "oversold (potential reversal)" :
      input.rsi < 45 ? "weak/bearish momentum" :
      input.rsi < 55 ? "neutral momentum" :
      input.rsi < 70 ? "bullish momentum" :
      "overbought (caution)"
    }`);
  }

  // MACD
  if (!isNaN(input.macdLine) && !isNaN(input.macdSignal)) {
    if (input.macdLine > input.macdSignal)
      reasons.push(`MACD (${input.macdLine.toFixed(input.decimals)}) above signal — bullish`);
    else
      reasons.push(`MACD (${input.macdLine.toFixed(input.decimals)}) below signal — bearish`);
  }

  // S/R
  if (input.brokRes) reasons.push("Price broke through resistance — bullish breakout");
  if (input.brokSup) reasons.push("Price broke through support — bearish breakdown");
  if (input.nearSup && !input.brokSup) reasons.push("Price near support zone — potential bounce");
  if (input.nearRes && !input.brokRes) reasons.push("Price near resistance — caution, possible rejection");

  // Supply & Demand
  const sdReason = buildSDReason(input.sd, input.decimals);
  if (sdReason) reasons.push(sdReason);

  // Patterns
  if (input.patterns.length > 0) {
    reasons.push(`Pattern detected: ${input.patterns.join(", ")}`);
  }

  // Volatility
  if (input.highVol) reasons.push("High volatility (ATR spike) — signal weakened, caution advised");

  return reasons;
}

export function runSignalEngine(
  candles: Candle[],
  pair: ForexPair,
  timeframe: Timeframe,
  settings: AppSettings = DEFAULT_SETTINGS
): EngineOutput {
  const closes = candles.map((c) => c.close);
  const len = candles.length;
  const now = candles[len - 1].time;
  const decimals = getPairDecimals(pair);

  // ── Indicators ────────────────────────────────────────────────────────────
  const ema20Arr = calculateEMA(closes, settings.ema1Period);
  const ema50Arr = calculateEMA(closes, settings.ema2Period);
  const rsiArr   = calculateRSI(closes, 14);
  const macdArr  = calculateMACD(closes);
  const atrArr   = calculateATR(candles, 14);
  const adxArr   = calculateADX(candles, 14);
  const bbArr    = calculateBollingerBands(closes, 20, 2);
  const stochArr = calculateStochastic(candles, 14, 3);

  const ema20     = ema20Arr[len - 1];
  const ema50     = ema50Arr[len - 1];
  const ema20Prev = ema20Arr[len - 2] ?? ema20;
  const ema50Prev = ema50Arr[len - 2] ?? ema50;
  const rsi       = rsiArr[len - 1];
  const macd      = macdArr[len - 1];
  const macdPrev  = macdArr[len - 2] ?? macd;
  const atr       = atrArr[len - 1];
  const adxVal    = adxArr[len - 1];
  const bb        = bbArr[len - 1];
  const stoch     = stochArr[len - 1];
  const stochPrev = stochArr[len - 2] ?? stoch;

  // Rolling average ATR (last 20 bars)
  const validAtrs = atrArr.filter((v) => !isNaN(v)).slice(-20);
  const avgAtr = validAtrs.length > 0
    ? validAtrs.reduce((s, v) => s + v, 0) / validAtrs.length
    : atr;

  // Classic S/R (pivot-based)
  const sr          = calculateSupportResistance(candles, 5, 5);
  const currentPrice = candles[len - 1].close;
  const prevClose    = candles[len - 2]?.close ?? currentPrice;

  const iNearSupport     = nearSupport(currentPrice, sr.support);
  const iNearResistance  = nearResistance(currentPrice, sr.resistance);
  const iBrokeResistance = brokeResistance(candles[len - 1], prevClose, sr.resistance);
  const iBrokeSupport    = brokeSupport(candles[len - 1], prevClose, sr.support);

  // Candlestick patterns
  const patterns = detectPatterns(candles, 3);
  const highVol  = isHighVolatility(candles, 14, settings.volatilityThreshold);

  // Supply & Demand zone analysis
  const sd = analyzeSDZones(candles, 1.5);

  // ── Scoring ───────────────────────────────────────────────────────────────
  const scoreInput = {
    ema20, ema50, ema20Prev, ema50Prev,
    rsi,
    macd, macdPrev,
    atr, avgAtr,
    nearSupport:     iNearSupport,
    nearResistance:  iNearResistance,
    brokeResistance: iBrokeResistance,
    brokeSupport:    iBrokeSupport,
    patterns,
    sd,
    settings,
    adx:        adxVal.adx,
    plusDI:     adxVal.plusDI,
    minusDI:    adxVal.minusDI,
    bbPercentB: bb.percentB,
    bbWidth:    bb.width,
    stochK:     stoch.k,
    stochD:     stoch.d,
    stochKPrev: stochPrev.k,
    stochDPrev: stochPrev.d,
  };

  const score      = computeScoreBreakdown(scoreInput);
  const confidence = scoreToConfidence(score);
  const signal     = scoreToSignal(score.total, settings.minConfidence, confidence);

  // Trade direction and ATR-based SL/TP
  const direction = score.total >= 0 ? "long" : "short";
  const setup = atrTradeSetup(candles, direction, settings.atrMultiplierSL, settings.atrMultiplierTP);

  // Build human-readable reasons
  const patternLabels = patterns.map(patternLabel);
  const reasons = buildReasons(score, {
    ema20, ema50, rsi,
    macdLine:   macd.macdLine,
    macdSignal: macd.signalLine,
    nearSup:  iNearSupport,
    nearRes:  iNearResistance,
    brokRes:  iBrokeResistance,
    brokSup:  iBrokeSupport,
    patterns: patternLabels,
    highVol,
    sd,
    decimals,
  });

  return {
    pair,
    timeframe,
    timestamp:   now,
    signal,
    confidence,
    score,
    reasons,
    currentPrice,
    entry:       setup.entry,
    stopLoss:    setup.stopLoss,
    takeProfit:  setup.takeProfit,
    riskReward:  setup.riskReward,
    atrValue:    atr,
    indicators: {
      ema20,
      ema50,
      rsi,
      macdLine:         macd.macdLine,
      signalLine:       macd.signalLine,
      histogram:        macd.histogram,
      atr,
      supportLevels:    sr.support,
      resistanceLevels: sr.resistance,
      detectedPatterns: patternLabels,
      sd,
      adx:        adxVal.adx,
      plusDI:     adxVal.plusDI,
      minusDI:    adxVal.minusDI,
      bbUpper:    bb.upper,
      bbMiddle:   bb.middle,
      bbLower:    bb.lower,
      bbWidth:    bb.width,
      bbPercentB: bb.percentB,
      stochK:     stoch.k,
      stochD:     stoch.d,
    },
  };
}

/** Multi-timeframe confirmation: check if higher TF agrees with lower TF signal */
export function higherTFConfirms(
  lowerTFSignal: EngineOutput,
  higherTFCandles: Candle[],
  pair: ForexPair,
  higherTF: Timeframe,
  settings: AppSettings = DEFAULT_SETTINGS
): boolean {
  if (higherTFCandles.length < 60) return false;
  const htfSignal = runSignalEngine(higherTFCandles, pair, higherTF, settings);

  const lBull = lowerTFSignal.score.total > 0;
  const hBull = htfSignal.score.total > 0;
  return lBull === hBull;
}
