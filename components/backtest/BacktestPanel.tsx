"use client";

import { useState, useCallback } from "react";
import type { Candle, ForexPair, Timeframe, AppSettings, BacktestResult } from "@/types";
import { runBacktest } from "@/lib/backtest/backtestEngine";
import { fmtUnixDate, fmtDateTime } from "@/lib/utils/time";
import { saveBacktestResult, getBacktestResults } from "@/lib/storage/storage";
import {
  TestTube2, Play, TrendingUp, TrendingDown,
  BarChart2, Target, ShieldAlert, SplitSquareHorizontal, FlaskConical,
} from "lucide-react";
import type { ConfidenceBand } from "@/types";
import clsx from "clsx";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={clsx("price text-base font-bold", color ?? "text-white")}>{value}</div>
    </div>
  );
}

function CalibrationChart({ bands }: { bands: ConfidenceBand[] }) {
  const active = bands.filter((b) => b.trades > 0);
  if (active.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
        <Target className="w-3 h-3" /> Confidence Calibration
        <span className="text-slate-600 ml-1">— does higher confidence = higher win rate?</span>
      </div>
      <div className="space-y-2">
        {bands.map((b) => {
          const isEmpty = b.trades === 0;
          const wr = b.winRate * 100;
          const barColor = isEmpty ? "bg-slate-700"
            : wr >= 50 ? "bg-green-500"
            : wr >= 40 ? "bg-yellow-500"
            : "bg-red-500";

          return (
            <div key={b.label}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-400 w-16">{b.label}</span>
                {isEmpty ? (
                  <span className="text-slate-600 italic">no trades</span>
                ) : (
                  <span className="flex gap-3">
                    <span className="text-slate-500">{b.trades} trades</span>
                    <span className={clsx(
                      "font-medium",
                      wr >= 50 ? "text-green-400" : wr >= 40 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {wr.toFixed(0)}% WR
                    </span>
                    <span className={clsx(
                      "price font-medium",
                      b.avgR >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {b.avgR >= 0 ? "+" : ""}{b.avgR.toFixed(2)}R avg
                    </span>
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-[#1e2d45] rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full transition-all", barColor)}
                  style={{ width: isEmpty ? "0%" : `${wr}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex mt-1">
        <div className="w-16" />
        <div className="flex-1 relative">
          <div className="absolute left-1/2 -translate-x-1/2 text-[10px] text-slate-600">
            ← 50% break-even →
          </div>
        </div>
      </div>
    </div>
  );
}

function EquityCurve({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 400;
  const height = 80;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const isPositive = data[data.length - 1] >= data[0];

  return (
    <div className="mt-2">
      <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
        <BarChart2 className="w-3 h-3" /> Equity Curve (R)
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg bg-[#0a0e1a]"
        style={{ height: 80 }}
        preserveAspectRatio="none"
      >
        {min < 0 && max > 0 && (
          <line
            x1={0}
            y1={height - ((0 - min) / range) * height}
            x2={width}
            y2={height - ((0 - min) / range) * height}
            stroke="#243450"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={isPositive ? "#22c55e" : "#ef4444"}
          strokeWidth={2}
        />
        <polygon
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
          fill={isPositive ? "#22c55e" : "#ef4444"}
          fillOpacity={0.1}
        />
      </svg>
    </div>
  );
}

// ── Walk-Forward section ──────────────────────────────────────────────────────

function WalkForwardPanel({ result }: { result: BacktestResult }) {
  const wf = result.walkForward;
  if (!wf) return null;

  const col = (r: number) => r >= 0 ? "text-green-400" : "text-red-400";
  const wr  = (w: number) => `${(w * 100).toFixed(1)}%`;

  return (
    <div className="rounded-lg bg-[#0a0e1a] p-3">
      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
        <SplitSquareHorizontal className="w-3 h-3" />
        Walk-Forward Validation (70 % IS / 30 % OOS)
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Header */}
        <div className="text-slate-500 font-medium">In-Sample (train)</div>
        <div className="text-slate-500 font-medium">Out-of-Sample (test)</div>

        {/* Trades */}
        <div className="text-slate-300">{wf.inSample.trades} trades</div>
        <div className="text-slate-300">{wf.outOfSample.trades} trades</div>

        {/* Win rate */}
        <div className={clsx("font-bold", wf.inSample.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>
          {wr(wf.inSample.winRate)} WR
        </div>
        <div className={clsx("font-bold", wf.outOfSample.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>
          {wr(wf.outOfSample.winRate)} WR
        </div>

        {/* Total R */}
        <div className={clsx("price font-bold", col(wf.inSample.totalR))}>
          {wf.inSample.totalR >= 0 ? "+" : ""}{wf.inSample.totalR.toFixed(2)}R
        </div>
        <div className={clsx("price font-bold", col(wf.outOfSample.totalR))}>
          {wf.outOfSample.totalR >= 0 ? "+" : ""}{wf.outOfSample.totalR.toFixed(2)}R
        </div>
      </div>
      {/* OOS quality hint */}
      {wf.outOfSample.trades > 0 && (
        <p className="text-[10px] text-slate-600 mt-2 italic">
          {wf.outOfSample.winRate >= wf.inSample.winRate * 0.85
            ? "✓ OOS performance is consistent with in-sample — strategy shows robustness."
            : "⚠ OOS win rate drops more than 15% vs in-sample — possible overfitting."}
        </p>
      )}
    </div>
  );
}

// ── Component IC table ────────────────────────────────────────────────────────

const IC_LABELS: Record<string, string> = {
  trendScore:        "Trend (EMA)",
  momentumScore:     "Momentum (RSI/MACD/Stoch)",
  breakoutScore:     "Breakout (S/R)",
  volatilityPenalty: "Vol. Penalty (ATR)",
  patternBonus:      "Candle Pattern",
  sdScore:           "Supply & Demand",
  adxScore:          "ADX Regime",
  bbScore:           "Bollinger Bands",
  divergenceScore:   "Divergence (RSI/MACD)",
};

function ComponentICTable({ ic }: { ic: Record<string, number> }) {
  const entries = Object.entries(ic)
    .filter(([, v]) => isFinite(v))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg bg-[#0a0e1a] p-3">
      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
        <FlaskConical className="w-3 h-3" />
        Score Component Information Coefficients
        <span className="text-slate-600 ml-1">— Pearson corr. vs PnL(R)</span>
      </div>
      <div className="space-y-1.5">
        {entries.map(([key, ic]) => {
          const label  = IC_LABELS[key] ?? key;
          const pct    = Math.abs(ic) * 100;
          const color  = ic > 0.1 ? "bg-green-500"
                       : ic < -0.1 ? "bg-red-500"
                       : "bg-slate-600";
          const label2 = Math.abs(ic) >= 0.2 ? "HIGH"
                       : Math.abs(ic) >= 0.1 ? "MED"
                       : "WEAK";
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-400 truncate max-w-[55%]">{label}</span>
                <span className="flex items-center gap-2">
                  <span className={clsx(
                    "text-[10px] font-medium",
                    Math.abs(ic) >= 0.2 ? "text-green-400"
                    : Math.abs(ic) >= 0.1 ? "text-yellow-400"
                    : "text-slate-500"
                  )}>{label2}</span>
                  <span className={clsx(
                    "price font-medium",
                    ic >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {ic >= 0 ? "+" : ""}{ic.toFixed(3)}
                  </span>
                </span>
              </div>
              <div className="h-1 bg-[#1e2d45] rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full", color)}
                  style={{ width: `${Math.min(100, pct * 5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Regime filter badge ───────────────────────────────────────────────────────

function RegimeBadge({ result }: { result: BacktestResult }) {
  const rf = result.regimeFiltered ?? 0;
  const hf = result.htfFiltered ?? 0;
  const sf = result.sdFiltered    ?? 0;
  if (rf === 0 && hf === 0 && sf === 0) return null;

  return (
    <div className="rounded-lg bg-[#0a0e1a] p-3">
      <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
        <ShieldAlert className="w-3 h-3 text-yellow-400" />
        Entry Filters Applied
      </div>
      <div className="flex flex-wrap gap-2 text-xs mb-2">
        {rf > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#1e2d45] text-yellow-300">
            {rf} skipped — extreme volatility spike (ATR &gt; 95th pctile)
          </span>
        )}
        {sf > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#1e2d45] text-purple-300">
            {sf} skipped — S&amp;D zone counter-direction
          </span>
        )}
        {hf > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#1e2d45] text-blue-300">
            {hf} skipped — higher-TF trend conflict
          </span>
        )}
      </div>
      {sf > 0 && (
        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
          <span className="text-purple-400 font-medium">S&amp;D gate (highest priority):</span>{" "}
          never trade against a confirmed zone — longs blocked inside supply zones, shorts blocked
          inside demand zones. S&amp;D also contributes ±4 pts to score (double all other factors).
        </p>
      )}
      {rf > 0 && (
        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
          <span className="text-slate-400 font-medium">Volatility gate:</span> entries skipped when
          ATR exceeds the 95th percentile — flash crashes or news spikes where SL/TP levels are
          unreliable. ADX influence applied through score (−1 when ADX &lt; 20).
        </p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BacktestPanel({
  candles,
  pair,
  timeframe,
  settings,
}: {
  candles: Candle[];
  pair: ForexPair;
  timeframe: Timeframe;
  settings: AppSettings;
}) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [savedResults] = useState<BacktestResult[]>(getBacktestResults);

  const handleRun = useCallback(async () => {
    if (candles.length < 80) return;
    setRunning(true);

    await new Promise((r) => setTimeout(r, 0));
    try {
      const res = runBacktest(candles, pair, timeframe, settings);
      setResult(res);
      saveBacktestResult(res);
    } catch (err) {
      console.error("Backtest error:", err);
    } finally {
      setRunning(false);
    }
  }, [candles, pair, timeframe, settings]);

  const current = result;

  return (
    <div className="card fade-in">
      <div className="card-header justify-between">
        <div className="flex items-center gap-2">
          <TestTube2 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Backtest</span>
          <span className="text-xs text-slate-500">{pair} · {timeframe}</span>
        </div>
        <button
          onClick={handleRun}
          disabled={running || candles.length < 80}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
        >
          <Play className="w-3 h-3" />
          {running ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {candles.length < 80 && (
        <div className="px-4 py-4 text-sm text-yellow-400">
          ⚠ Need at least 80 candles for backtesting. Load more data first.
        </div>
      )}

      {current && (
        <div className="p-4 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatBox label="Total Trades"  value={current.totalTrades} />
            <StatBox
              label="Win Rate"
              value={`${(current.winRate * 100).toFixed(1)}%`}
              color={current.winRate >= 0.5 ? "text-green-400" : "text-red-400"}
            />
            <StatBox
              label="Profit Factor"
              value={isFinite(current.profitFactor) ? current.profitFactor.toFixed(2) : "∞"}
              color={current.profitFactor >= 1.5 ? "text-green-400" :
                     current.profitFactor >= 1   ? "text-yellow-400" : "text-red-400"}
            />
            <StatBox
              label="Total R"
              value={`${current.totalR >= 0 ? "+" : ""}${current.totalR.toFixed(2)}R`}
              color={current.totalR >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatBox
              label="Avg RR"
              value={current.averageRR.toFixed(2)}
              color={current.averageRR >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatBox
              label="Max Drawdown"
              value={`${current.maxDrawdown.toFixed(2)}R`}
              color="text-red-400"
            />
          </div>

          {/* W/L bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-400" />
                {current.wins} wins
              </span>
              <span className="flex items-center gap-1">
                {current.losses} losses
                <TrendingDown className="w-3 h-3 text-red-400" />
              </span>
            </div>
            {current.totalTrades > 0 && (
              <div className="h-2 bg-[#1e2d45] rounded-full overflow-hidden flex">
                <div
                  className="bg-green-500 h-full"
                  style={{ width: `${(current.wins / current.totalTrades) * 100}%` }}
                />
                <div
                  className="bg-red-500 h-full"
                  style={{ width: `${(current.losses / current.totalTrades) * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* Equity curve */}
          <EquityCurve data={current.equityCurve} />

          {/* Walk-forward validation */}
          <WalkForwardPanel result={current} />

          {/* Regime filter badge */}
          <RegimeBadge result={current} />

          {/* Component IC table */}
          {current.componentIC && Object.keys(current.componentIC).length > 0 && (
            <ComponentICTable ic={current.componentIC} />
          )}

          {/* Confidence calibration */}
          <CalibrationChart bands={current.calibration} />

          {/* Last few trades */}
          {current.trades.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">Recent Trades</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {current.trades.slice(-10).reverse().map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs px-2 py-1.5 bg-[#0a0e1a] rounded"
                  >
                    <span className={clsx(
                      "font-medium",
                      t.direction === "long" ? "text-green-400" : "text-red-400"
                    )}>
                      {t.direction === "long" ? "▲" : "▼"} {t.direction.toUpperCase()}
                    </span>
                    <span className="price text-slate-400">
                      {fmtUnixDate(t.entryTime)}
                      {t.exitReason === "timeout" && (
                        <span className="ml-1 text-slate-600">[⏱]</span>
                      )}
                    </span>
                    <span className={clsx(
                      "price font-bold",
                      t.pnlR >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {t.pnlR >= 0 ? "+" : ""}{t.pnlR.toFixed(2)}R
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 italic">
            Backtest results are simulated and do not guarantee future performance.
            Run at: {fmtDateTime(new Date(current.runAt))}
          </p>
        </div>
      )}

      {!current && savedResults.length > 0 && (
        <div className="px-4 pb-4">
          <div className="text-xs text-slate-400 mb-2">Previous Results</div>
          <div className="space-y-1">
            {savedResults.slice(0, 5).map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs px-3 py-2 bg-[#0a0e1a] rounded"
              >
                <span className="text-slate-300">{r.pair} · {r.timeframe}</span>
                <span className="price text-slate-400">
                  {(r.winRate * 100).toFixed(0)}% WR
                </span>
                <span className={clsx(
                  "price font-bold",
                  r.totalR >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {r.totalR >= 0 ? "+" : ""}{r.totalR.toFixed(1)}R
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
