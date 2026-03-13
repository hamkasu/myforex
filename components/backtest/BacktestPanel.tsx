"use client";

import { useState, useCallback } from "react";
import type { Candle, ForexPair, Timeframe, AppSettings, BacktestResult } from "@/types";
import { runBacktest } from "@/lib/backtest/backtestEngine";
import { fmtUnixDate, fmtDateTime } from "@/lib/utils/time";
import { saveBacktestResult, getBacktestResults } from "@/lib/storage/storage";
import { TestTube2, Play, TrendingUp, TrendingDown, BarChart2, Target } from "lucide-react";
import type { ConfidenceBand } from "@/types";
import clsx from "clsx";

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
          // Color: green if win rate > 50%, yellow if 40–50%, red below
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
      {/* 50% reference line label */}
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
        {/* Zero line */}
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
        {/* Equity line */}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={isPositive ? "#22c55e" : "#ef4444"}
          strokeWidth={2}
        />
        {/* Area fill */}
        <polygon
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
          fill={isPositive ? "#22c55e" : "#ef4444"}
          fillOpacity={0.1}
        />
      </svg>
    </div>
  );
}

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

    // Run in next tick to avoid blocking UI
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
