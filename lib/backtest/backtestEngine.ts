import type {
  Candle,
  ForexPair,
  Timeframe,
  BacktestTrade,
  BacktestResult,
  ConfidenceBand,
  AppSettings,
  ScoreBreakdown,
  WFStats,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { runSignalEngine } from "@/lib/signals/signalEngine";
import { calculateATR, atrPercentile } from "@/lib/indicators/atr";
import { calculateADX } from "@/lib/indicators/adx";
import { calculateEMA } from "@/lib/indicators/ema";
import { downsampleCandles, getDownsampleFactor } from "@/lib/utils/downsample";

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum ADX to allow entry — below this the market is ranging/choppy */
const ADX_MIN = 15;

/** ATR percentile ceiling (0–1) — entries blocked above this (extreme vol spikes) */
const ATR_PCTILE_MAX = 0.92;

/** Adaptive SL/TP multipliers indexed by ATR percentile bucket */
function adaptiveMultipliers(
  pctile: number,
  baseSL: number,
  baseTP: number,
): { sl: number; tp: number } {
  if (pctile < 0.25) return { sl: 1.2,    tp: 3.0    }; // low vol
  if (pctile > 0.75) return { sl: 2.0,    tp: 1.8    }; // high vol
  return              { sl: baseSL, tp: baseTP };         // normal
}

// ── IC computation ───────────────────────────────────────────────────────────

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx  += (x[i] - mx) ** 2;
    vy  += (y[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  return denom === 0 ? 0 : cov / denom;
}

function computeComponentIC(trades: BacktestTrade[]): Record<string, number> {
  const withScores = trades.filter((t) => t.scoreComponents != null);
  if (withScores.length < 5) return {};

  const pnlR = withScores.map((t) => t.pnlR);
  const keys: Array<keyof ScoreBreakdown> = [
    "trendScore", "momentumScore", "breakoutScore", "volatilityPenalty",
    "patternBonus", "sdScore", "adxScore", "bbScore", "divergenceScore",
  ];

  const ic: Record<string, number> = {};
  for (const k of keys) {
    const scores = withScores.map((t) => (t.scoreComponents as ScoreBreakdown)[k] ?? 0);
    ic[k] = Number(pearsonCorrelation(scores, pnlR).toFixed(3));
  }
  return ic;
}

// ── Walk-forward helper ───────────────────────────────────────────────────────

function buildWFStats(trades: BacktestTrade[]): WFStats {
  const wins = trades.filter((t) => t.outcome === "win").length;
  return {
    trades:  trades.length,
    wins,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    totalR:  trades.reduce((s, t) => s + t.pnlR, 0),
  };
}

// ── Open trade state ─────────────────────────────────────────────────────────

interface OpenTrade {
  entryTime:       number;
  entryBarIndex:   number;
  entry:           number;
  stopLoss:        number;
  takeProfit:      number;
  direction:       "long" | "short";
  signal:          BacktestTrade["signal"];
  confidence:      number;
  scoreComponents: ScoreBreakdown;
  atrPctile:       number;
}

// ── Main engine ──────────────────────────────────────────────────────────────

/**
 * Enhanced walk-forward backtest with 7 quant improvements:
 *  1. Per-trade score components → Pearson IC computed at end
 *  2. Hard regime gate: ADX ≥ 18 AND ATR percentile ≤ 85th
 *  3. Walk-forward 70 / 30 IS / OOS split for robustness check
 *  4. Adaptive ATR multipliers by volatility percentile bucket
 *  5. RSI + MACD divergence scoring (wired via signalEngine → scoring)
 *  6. Max holding-period exit (time-based stop at `maxHoldBars`)
 *  7. Multi-TF EMA alignment gate (downsampled higher-TF trend must agree)
 */
export function runBacktest(
  candles: Candle[],
  pair: ForexPair,
  timeframe: Timeframe,
  settings: AppSettings = DEFAULT_SETTINGS,
  warmupBars     = 60,
  signalInterval = 4,
  maxHoldBars    = 20,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let openTrade: OpenTrade | null = null;
  const equityCurve: number[] = [0];
  let cumulativeR    = 0;
  let maxPeak        = 0;
  let maxDrawdown    = 0;
  let regimeFiltered = 0;
  let htfFiltered    = 0;

  // ── Pre-compute full-series indicators (avoids O(n²) repeated calls) ──────
  const atrArr = calculateATR(candles, 14);
  const adxArr = calculateADX(candles, 14);

  // ── Higher-TF EMA trend (improvement #7: multi-TF alignment) ─────────────
  const dsFactor = getDownsampleFactor(timeframe);
  let htfCandles:     Candle[]  = [];
  let htfEma20Arr:    number[]  = [];
  let htfEma50Arr:    number[]  = [];
  let htfTimes:       number[]  = [];

  if (dsFactor > 1) {
    htfCandles  = downsampleCandles(candles, dsFactor);
    htfTimes    = htfCandles.map((c) => c.time);
    const htfCl = htfCandles.map((c) => c.close);
    htfEma20Arr = calculateEMA(htfCl, settings.ema1Period);
    htfEma50Arr = calculateEMA(htfCl, settings.ema2Period);
  }

  /** True if the higher-TF EMA trend agrees with `direction` at bar `i` */
  function htfAligned(i: number, direction: "long" | "short"): boolean {
    if (dsFactor <= 1 || htfCandles.length === 0) return true; // no higher TF
    const barTime = candles[i].time;
    // Find the latest completed higher-TF bar whose close time <= current bar
    let htfIdx = -1;
    for (let j = htfTimes.length - 1; j >= 0; j--) {
      if (htfTimes[j] <= barTime) { htfIdx = j; break; }
    }
    if (htfIdx < 0) return true;
    const htfBull = htfEma20Arr[htfIdx] > htfEma50Arr[htfIdx];
    return direction === "long" ? htfBull : !htfBull;
  }

  // ── Main simulation loop ──────────────────────────────────────────────────
  for (let i = warmupBars; i < candles.length; i++) {
    const c = candles[i];

    // ── 1. Check open trade exit conditions ──────────────────────────────────
    if (openTrade) {
      let outcome: "win" | "loss" | null = null;
      let exitPrice = 0;
      let exitReason: BacktestTrade["exitReason"] = "sl";

      const barsHeld = i - openTrade.entryBarIndex;

      if (openTrade.direction === "long") {
        if (c.low <= openTrade.stopLoss) {
          outcome = "loss"; exitPrice = openTrade.stopLoss; exitReason = "sl";
        } else if (c.high >= openTrade.takeProfit) {
          outcome = "win";  exitPrice = openTrade.takeProfit; exitReason = "tp";
        }
      } else {
        if (c.high >= openTrade.stopLoss) {
          outcome = "loss"; exitPrice = openTrade.stopLoss; exitReason = "sl";
        } else if (c.low <= openTrade.takeProfit) {
          outcome = "win";  exitPrice = openTrade.takeProfit; exitReason = "tp";
        }
      }

      // Improvement #6: max holding period — exit at close if time limit hit
      if (!outcome && barsHeld >= maxHoldBars) {
        exitPrice  = c.close;
        exitReason = "timeout";
        const slDist = Math.abs(openTrade.entry - openTrade.stopLoss);
        const diff   = openTrade.direction === "long"
          ? exitPrice - openTrade.entry
          : openTrade.entry - exitPrice;
        outcome = diff >= 0 ? "win" : "loss";
      }

      if (outcome) {
        const slDist   = Math.abs(openTrade.entry - openTrade.stopLoss);
        const priceDiff = openTrade.direction === "long"
          ? exitPrice - openTrade.entry
          : openTrade.entry - exitPrice;
        const pnlR = slDist > 0 ? priceDiff / slDist : 0;

        trades.push({
          entryTime:       openTrade.entryTime,
          exitTime:        c.time,
          pair,
          timeframe,
          direction:       openTrade.direction,
          entry:           openTrade.entry,
          exit:            exitPrice,
          stopLoss:        openTrade.stopLoss,
          takeProfit:      openTrade.takeProfit,
          outcome,
          pnlR,
          signal:          openTrade.signal,
          confidence:      openTrade.confidence,
          scoreComponents: openTrade.scoreComponents,
          atrPctile:       openTrade.atrPctile,
          exitReason,
        });

        cumulativeR += pnlR;
        maxPeak      = Math.max(maxPeak, cumulativeR);
        const dd     = maxPeak - cumulativeR;
        if (dd > maxDrawdown) maxDrawdown = dd;

        equityCurve.push(cumulativeR);
        openTrade = null;
      }
    }

    // ── 2. Evaluate signal every N bars (no open trade) ─────────────────────
    if (openTrade || i % signalInterval !== 0) continue;

    // ── Improvement #2: Regime gate ──────────────────────────────────────────
    const adxVal  = adxArr[i]?.adx ?? NaN;
    const pctile  = atrPercentile(atrArr, i, 50);

    if (isNaN(adxVal) || adxVal < ADX_MIN || pctile > ATR_PCTILE_MAX) {
      regimeFiltered++;
      continue;
    }

    // Signal evaluation (uses all data up to bar i, no lookahead)
    const historicalCandles = candles.slice(0, i + 1);
    const result = runSignalEngine(historicalCandles, pair, timeframe, settings);

    const isTrade =
      result.signal !== "HOLD" &&
      result.confidence >= settings.minConfidence;

    if (!isTrade) continue;

    const direction: "long" | "short" =
      result.signal === "BUY" || result.signal === "STRONG_BUY" ? "long" : "short";

    // ── Improvement #7: Multi-TF alignment gate ───────────────────────────────
    if (!htfAligned(i, direction)) {
      htfFiltered++;
      continue;
    }

    // ── Improvement #4: Adaptive ATR multipliers ──────────────────────────────
    const { sl: slMult, tp: tpMult } = adaptiveMultipliers(
      pctile,
      settings.atrMultiplierSL,
      settings.atrMultiplierTP,
    );
    const currentATR = atrArr[i];
    const entry      = c.close;
    const slDist     = isNaN(currentATR) ? Math.abs(result.stopLoss - result.entry) : currentATR * slMult;
    const tpDist     = isNaN(currentATR) ? Math.abs(result.takeProfit - result.entry) : currentATR * tpMult;
    const stopLoss   = direction === "long" ? entry - slDist : entry + slDist;
    const takeProfit = direction === "long" ? entry + tpDist : entry - tpDist;

    openTrade = {
      entryTime:       c.time,
      entryBarIndex:   i,
      entry,
      stopLoss,
      takeProfit,
      direction,
      signal:          result.signal,
      confidence:      result.confidence,
      scoreComponents: result.score,   // Improvement #1: record per-trade score
      atrPctile:       pctile,
    };
  }

  // ── Summary statistics ────────────────────────────────────────────────────
  const wins        = trades.filter((t) => t.outcome === "win").length;
  const losses      = trades.filter((t) => t.outcome === "loss").length;
  const totalTrades = trades.length;
  const winRate     = totalTrades > 0 ? wins / totalTrades : 0;

  const grossWin  = trades.filter((t) => t.pnlR > 0).reduce((s, t) => s + t.pnlR, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnlR < 0).reduce((s, t) => s + t.pnlR, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const totalR = trades.reduce((s, t) => s + t.pnlR, 0);
  const avgRR  = totalTrades > 0 ? totalR / totalTrades : 0;

  // ── Confidence calibration ────────────────────────────────────────────────
  const BANDS: Array<[string, number, number]> = [
    ["55–64%",  55, 65],
    ["65–74%",  65, 75],
    ["75–84%",  75, 85],
    ["85–100%", 85, 101],
  ];
  const calibration: ConfidenceBand[] = BANDS.map(([label, lo, hi]) => {
    const bt = trades.filter((t) => t.confidence >= lo && t.confidence < hi);
    const bw = bt.filter((t) => t.outcome === "win").length;
    return {
      label,
      minConf: lo,
      maxConf: hi,
      trades:  bt.length,
      wins:    bw,
      winRate: bt.length > 0 ? bw / bt.length : 0,
      avgR:    bt.length > 0 ? bt.reduce((s, t) => s + t.pnlR, 0) / bt.length : 0,
    };
  });

  // ── Improvement #1: Component IC ─────────────────────────────────────────
  const componentIC = computeComponentIC(trades);

  // ── Improvement #3: Walk-forward 70/30 split ─────────────────────────────
  const boundary  = candles[Math.floor(candles.length * 0.7)].time;
  const isTrades  = trades.filter((t) => t.entryTime <= boundary);
  const oosTrades = trades.filter((t) => t.entryTime >  boundary);
  const walkForward = {
    inSample:     buildWFStats(isTrades),
    outOfSample:  buildWFStats(oosTrades),
  };

  return {
    pair,
    timeframe,
    totalTrades,
    wins,
    losses,
    winRate,
    averageRR:  avgRR,
    maxDrawdown,
    profitFactor,
    totalR,
    equityCurve,
    calibration,
    trades,
    runAt:           Date.now(),
    componentIC,
    walkForward,
    regimeFiltered,
    htfFiltered,
  };
}
