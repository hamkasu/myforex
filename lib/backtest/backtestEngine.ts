import type {
  Candle,
  ForexPair,
  Timeframe,
  BacktestTrade,
  BacktestResult,
  ConfidenceBand,
  AppSettings,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { runSignalEngine } from "@/lib/signals/signalEngine";

interface OpenTrade {
  entryTime: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  direction: "long" | "short";
  signal: ReturnType<typeof runSignalEngine>["signal"];
  confidence: number;
}

/**
 * Walk-forward backtest:
 * Runs the signal engine on each candle using only prior data (no lookahead).
 * Manages open trades with SL/TP hit detection on subsequent candles.
 */
export function runBacktest(
  candles: Candle[],
  pair: ForexPair,
  timeframe: Timeframe,
  settings: AppSettings = DEFAULT_SETTINGS,
  warmupBars = 60,            // bars needed for indicators to warm up
  signalInterval = 4,         // re-evaluate every N bars
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let openTrade: OpenTrade | null = null;
  const equityCurve: number[] = [0];
  let cumulativeR = 0;
  let maxPeak = 0;
  let maxDrawdown = 0;

  for (let i = warmupBars; i < candles.length; i++) {
    const historicalCandles = candles.slice(0, i + 1);

    // ── Check if open trade hit SL or TP ────────────────────────────────────
    if (openTrade) {
      const c = candles[i];
      let outcome: "win" | "loss" | null = null;
      let exitPrice = 0;

      if (openTrade.direction === "long") {
        if (c.low <= openTrade.stopLoss) {
          outcome = "loss";
          exitPrice = openTrade.stopLoss;
        } else if (c.high >= openTrade.takeProfit) {
          outcome = "win";
          exitPrice = openTrade.takeProfit;
        }
      } else {
        if (c.high >= openTrade.stopLoss) {
          outcome = "loss";
          exitPrice = openTrade.stopLoss;
        } else if (c.low <= openTrade.takeProfit) {
          outcome = "win";
          exitPrice = openTrade.takeProfit;
        }
      }

      if (outcome) {
        const slDist = Math.abs(openTrade.entry - openTrade.stopLoss);
        const priceDiff = openTrade.direction === "long"
          ? exitPrice - openTrade.entry
          : openTrade.entry - exitPrice;
        const pnlR = slDist > 0 ? priceDiff / slDist : 0;

        trades.push({
          entryTime: openTrade.entryTime,
          exitTime: c.time,
          pair,
          timeframe,
          direction: openTrade.direction,
          entry: openTrade.entry,
          exit: exitPrice,
          stopLoss: openTrade.stopLoss,
          takeProfit: openTrade.takeProfit,
          outcome,
          pnlR,
          signal: openTrade.signal,
          confidence: openTrade.confidence,
        });

        cumulativeR += pnlR;
        maxPeak = Math.max(maxPeak, cumulativeR);
        const drawdown = maxPeak - cumulativeR;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        equityCurve.push(cumulativeR);
        openTrade = null;
      }
    }

    // ── Evaluate signal every N bars (if no open trade) ──────────────────────
    if (!openTrade && i % signalInterval === 0) {
      const result = runSignalEngine(historicalCandles, pair, timeframe, settings);

      const isTrade =
        result.signal !== "HOLD" &&
        result.confidence >= settings.minConfidence;

      if (isTrade) {
        const direction: "long" | "short" =
          result.signal === "BUY" || result.signal === "STRONG_BUY" ? "long" : "short";

        openTrade = {
          entryTime: candles[i].time,
          entry: result.entry,
          stopLoss: result.stopLoss,
          takeProfit: result.takeProfit,
          direction,
          signal: result.signal,
          confidence: result.confidence,
        };
      }
    }
  }

  // ── Statistics ────────────────────────────────────────────────────────────
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  const grossWin = trades.filter((t) => t.pnlR > 0).reduce((s, t) => s + t.pnlR, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnlR < 0).reduce((s, t) => s + t.pnlR, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const totalR = trades.reduce((s, t) => s + t.pnlR, 0);
  const avgRR = totalTrades > 0 ? totalR / totalTrades : 0;

  // ── Confidence Calibration ─────────────────────────────────────────────────
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
      trades: bt.length,
      wins: bw,
      winRate: bt.length > 0 ? bw / bt.length : 0,
      avgR: bt.length > 0 ? bt.reduce((s, t) => s + t.pnlR, 0) / bt.length : 0,
    };
  });

  return {
    pair,
    timeframe,
    totalTrades,
    wins,
    losses,
    winRate,
    averageRR: avgRR,
    maxDrawdown,
    profitFactor,
    totalR,
    equityCurve,
    calibration,
    trades,
    runAt: Date.now(),
  };
}
