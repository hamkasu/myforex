import type {
  Candle,
  ForexPair,
  Timeframe,
  BacktestTrade,
  BacktestResult,
  ConfidenceBand,
  AppSettings,
  WFStats,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { runSignalEngine } from "@/lib/signals/signalEngine";
import { calculateATR } from "@/lib/indicators/atr";

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

// ── Open trade state ──────────────────────────────────────────────────────────

interface OpenTrade {
  entryTime:     number;
  entryBarIndex: number;
  entry:         number;
  stopLoss:      number;
  takeProfit:    number;
  direction:     "long" | "short";
  signal:        BacktestTrade["signal"];
  confidence:    number;
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Clean, straightforward backtest engine:
 *  - Evaluates every bar after warmup (no bar-skip sampling)
 *  - No regime gates, no HTF alignment filters, no S&D direction gates
 *  - Enters at bar close when signal ≠ HOLD and confidence ≥ minConfidence
 *  - SL/TP sized by ATR × user multipliers
 *  - One trade at a time; exits on SL, TP, or max-hold timeout
 *  - Walk-forward 70/30 in-sample / out-of-sample split
 */
export function runBacktest(
  candles: Candle[],
  pair: ForexPair,
  timeframe: Timeframe,
  settings: AppSettings = DEFAULT_SETTINGS,
  warmupBars  = 60,
  maxHoldBars = 30,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let openTrade: OpenTrade | null = null;
  const equityCurve: number[] = [0];
  let cumulativeR = 0;
  let maxPeak     = 0;
  let maxDrawdown = 0;

  const atrArr = calculateATR(candles, 14);

  for (let i = warmupBars; i < candles.length; i++) {
    const c = candles[i];

    // ── 1. Check open trade exit ──────────────────────────────────────────────
    if (openTrade) {
      let outcome:    "win" | "loss" | null = null;
      let exitPrice   = 0;
      let exitReason: BacktestTrade["exitReason"] = "sl";
      const barsHeld  = i - openTrade.entryBarIndex;

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

      // Time-based exit: close trade at bar close after maxHoldBars
      if (!outcome && barsHeld >= maxHoldBars) {
        exitPrice  = c.close;
        exitReason = "timeout";
        const diff = openTrade.direction === "long"
          ? exitPrice - openTrade.entry
          : openTrade.entry - exitPrice;
        outcome = diff >= 0 ? "win" : "loss";
      }

      if (outcome) {
        const slDist    = Math.abs(openTrade.entry - openTrade.stopLoss);
        const priceDiff = openTrade.direction === "long"
          ? exitPrice - openTrade.entry
          : openTrade.entry - exitPrice;
        const pnlR = slDist > 0 ? priceDiff / slDist : 0;

        trades.push({
          entryTime:  openTrade.entryTime,
          exitTime:   c.time,
          pair,
          timeframe,
          direction:  openTrade.direction,
          entry:      openTrade.entry,
          exit:       exitPrice,
          stopLoss:   openTrade.stopLoss,
          takeProfit: openTrade.takeProfit,
          outcome,
          pnlR,
          signal:     openTrade.signal,
          confidence: openTrade.confidence,
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

    // ── 2. Skip if trade already open ────────────────────────────────────────
    if (openTrade) continue;

    // ── 3. Evaluate signal on all bars up to and including bar i ─────────────
    const historicalCandles = candles.slice(0, i + 1);
    const result = runSignalEngine(historicalCandles, pair, timeframe, settings);

    if (result.signal === "HOLD" || result.confidence < settings.minConfidence) continue;

    const direction: "long" | "short" =
      result.signal === "BUY" || result.signal === "STRONG_BUY" ? "long" : "short";

    // ── 4. Size SL/TP from ATR ────────────────────────────────────────────────
    const currentATR = atrArr[i];
    const entry      = c.close;

    let slDist: number;
    let tpDist: number;

    if (!isNaN(currentATR) && currentATR > 0) {
      slDist = currentATR * settings.atrMultiplierSL;
      tpDist = currentATR * settings.atrMultiplierTP;
    } else {
      // Fallback: use signal engine's own levels
      slDist = Math.abs(result.stopLoss - result.entry);
      tpDist = Math.abs(result.takeProfit - result.entry);
    }

    const stopLoss   = direction === "long" ? entry - slDist : entry + slDist;
    const takeProfit = direction === "long" ? entry + tpDist : entry - tpDist;

    openTrade = {
      entryTime:     c.time,
      entryBarIndex: i,
      entry,
      stopLoss,
      takeProfit,
      direction,
      signal:        result.signal,
      confidence:    result.confidence,
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

  // ── Confidence calibration bands ─────────────────────────────────────────
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

  // ── Walk-forward 70/30 split ──────────────────────────────────────────────
  const boundary  = candles[Math.floor(candles.length * 0.7)].time;
  const isTrades  = trades.filter((t) => t.entryTime <= boundary);
  const oosTrades = trades.filter((t) => t.entryTime >  boundary);
  const walkForward = {
    inSample:    buildWFStats(isTrades),
    outOfSample: buildWFStats(oosTrades),
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
    runAt:      Date.now(),
    walkForward,
    regimeFiltered: 0,
    htfFiltered:    0,
    sdFiltered:     0,
  };
}
