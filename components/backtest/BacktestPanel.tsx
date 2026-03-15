"use client";

import { useState, useCallback } from "react";
import type { Candle, ForexPair, Timeframe, AppSettings, BacktestResult, BacktestTrade } from "@/types";
import { runBacktest } from "@/lib/backtest/backtestEngine";
import { fmtUnixDateTime } from "@/lib/utils/time";
import { TestTube2, Play, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import clsx from "clsx";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[#0a0e1a] rounded-lg p-3 text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={clsx("text-base font-bold price", color ?? "text-white")}>{value}</div>
    </div>
  );
}

function EquityCurve({ curve }: { curve: number[] }) {
  if (curve.length < 2) return null;
  const w = 400, h = 80;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const pts = curve
    .map((v, i) => {
      const x = (i / (curve.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const zeroY = h - ((0 - min) / range) * h;
  const final = curve[curve.length - 1];
  const lineColor = final >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div className="mt-4">
      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
        <BarChart2 className="w-3 h-3" /> Equity Curve (cumulative R)
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="#1e2d45" strokeWidth={1} />
        <polyline fill="none" stroke={lineColor} strokeWidth={1.5} points={pts} />
      </svg>
    </div>
  );
}

function WalkForwardPanel({ wf }: { wf: BacktestResult["walkForward"] }) {
  if (!wf) return null;
  const { inSample: is, outOfSample: oos } = wf;
  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "R";
  const pct  = (n: number) => (n * 100).toFixed(0) + "%";

  return (
    <div className="mt-4">
      <div className="text-xs text-slate-400 mb-2">Walk-Forward (70% IS / 30% OOS)</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "In-Sample", stats: is },
          { label: "Out-of-Sample", stats: oos },
        ].map(({ label, stats }) => (
          <div key={label} className="bg-[#0a0e1a] rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className="text-xs text-white">{stats.trades} trades</div>
            <div className="text-xs text-slate-300">WR {pct(stats.winRate)}</div>
            <div className={clsx("text-xs font-bold", stats.totalR >= 0 ? "text-green-400" : "text-red-400")}>
              {fmt(stats.totalR)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const isLong = trade.direction === "long";
  const isWin  = trade.outcome === "win";
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-800 text-xs">
      <span className={clsx("font-bold w-8 shrink-0", isLong ? "text-green-400" : "text-red-400")}>
        {isLong ? "LONG" : "SHORT"}
      </span>
      <span className="text-slate-400 shrink-0">{fmtUnixDateTime(trade.entryTime)}</span>
      <span className="text-slate-500 shrink-0">→</span>
      <span className="text-slate-400 shrink-0">{fmtUnixDateTime(trade.exitTime)}</span>
      <span className="ml-auto shrink-0 text-slate-400">{trade.confidence}%</span>
      <span className={clsx("font-bold w-16 text-right shrink-0", isWin ? "text-green-400" : "text-red-400")}>
        {trade.pnlR >= 0 ? "+" : ""}{trade.pnlR.toFixed(2)}R
      </span>
      <span className="text-slate-600 shrink-0 capitalize">{trade.exitReason ?? ""}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface BacktestPanelProps {
  candles:   Candle[];
  pair:      ForexPair;
  timeframe: Timeframe;
  settings:  AppSettings;
  onResult?: (result: BacktestResult) => void;
}

export default function BacktestPanel({
  candles, pair, timeframe, settings, onResult,
}: BacktestPanelProps) {
  const [result,  setResult]  = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (!candles.length) { setError("No candle data loaded."); return; }
    setRunning(true);
    setError(null);
    try {
      // Run in a microtask so the UI can update before the heavy computation
      const res = await new Promise<BacktestResult>((resolve) =>
        setTimeout(() => resolve(runBacktest(candles, pair, timeframe, settings)), 0)
      );
      setResult(res);
      onResult?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
    } finally {
      setRunning(false);
    }
  }, [candles, pair, timeframe, settings, onResult]);

  const wins   = result?.wins   ?? 0;
  const losses = result?.losses ?? 0;
  const total  = result?.totalTrades ?? 0;
  const winBar = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <TestTube2 className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-300">Backtest — {pair} {timeframe}</span>
        <button
          onClick={handleRun}
          disabled={running || !candles.length}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors"
        >
          {running ? (
            <span className="spin-slow inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {running ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* No result yet */}
      {!result && !running && (
        <div className="p-6 text-center text-slate-500 text-sm">
          Press <strong className="text-slate-400">Run Backtest</strong> to simulate the signal engine on historical candles.
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="p-4 space-y-4">
          {/* Key stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Trades"       value={total} />
            <StatBox
              label="Win Rate"
              value={`${(result.winRate * 100).toFixed(0)}%`}
              color={result.winRate >= 0.5 ? "text-green-400" : result.winRate >= 0.4 ? "text-yellow-400" : "text-red-400"}
            />
            <StatBox
              label="Total R"
              value={`${result.totalR >= 0 ? "+" : ""}${result.totalR.toFixed(2)}R`}
              color={result.totalR >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatBox label="Avg R/Trade"  value={`${result.averageRR >= 0 ? "+" : ""}${result.averageRR.toFixed(2)}R`} />
            <StatBox label="Max Drawdown" value={`-${result.maxDrawdown.toFixed(2)}R`} color="text-orange-400" />
            <StatBox
              label="Profit Factor"
              value={isFinite(result.profitFactor) ? result.profitFactor.toFixed(2) : "∞"}
              color={result.profitFactor >= 1.5 ? "text-green-400" : result.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}
            />
          </div>

          {/* W/L bar */}
          {total > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span className="flex items-center gap-1 text-green-400">
                  <TrendingUp className="w-3 h-3" /> {wins}W
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  {losses}L <TrendingDown className="w-3 h-3" />
                </span>
              </div>
              <div className="w-full h-2 bg-red-900/40 rounded overflow-hidden">
                <div className="h-full bg-green-500 rounded" style={{ width: `${winBar}%` }} />
              </div>
            </div>
          )}

          {/* Equity curve */}
          <EquityCurve curve={result.equityCurve} />

          {/* Walk-forward */}
          <WalkForwardPanel wf={result.walkForward} />

          {/* Trade log */}
          {result.trades.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-slate-400 mb-2">Trade Log ({result.trades.length} trades)</div>
              <div className="max-h-48 overflow-y-auto">
                {result.trades.map((t, idx) => (
                  <TradeRow key={idx} trade={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
