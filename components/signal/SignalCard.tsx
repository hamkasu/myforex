"use client";

import type { SignalType } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { fmtUnixTime } from "@/lib/utils/time";
import clsx from "clsx";

// Exported helpers used by TopBar and others
export function signalColor(signal: SignalType): string {
  switch (signal) {
    case "STRONG_BUY": return "bg-green-600 text-white";
    case "BUY":        return "bg-green-600/30 text-green-300 border border-green-600";
    case "HOLD":       return "bg-yellow-600/30 text-yellow-300 border border-yellow-600";
    case "SELL":       return "bg-red-600/30 text-red-300 border border-red-600";
    case "STRONG_SELL":return "bg-red-600 text-white";
  }
}

export function signalLabel(signal: SignalType): string {
  return signal.replace("_", " ");
}

function SignalIcon({ signal }: { signal: SignalType }) {
  if (signal === "STRONG_BUY" || signal === "BUY")
    return <TrendingUp className="w-6 h-6" />;
  if (signal === "STRONG_SELL" || signal === "SELL")
    return <TrendingDown className="w-6 h-6" />;
  return <Minus className="w-6 h-6" />;
}

function ConfidenceBar({ confidence, signal }: { confidence: number; signal: SignalType }) {
  const color =
    signal === "STRONG_BUY" || signal === "BUY"
      ? "bg-green-500"
      : signal === "STRONG_SELL" || signal === "SELL"
      ? "bg-red-500"
      : "bg-yellow-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Confidence</span>
        <span className="price font-semibold text-white">{confidence}%</span>
      </div>
      <div className="confidence-bar">
        <div
          className={clsx("confidence-fill", color)}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}

interface ScoreRowProps {
  label: string;
  value: number;
  max?: number;
}

function ScoreRow({ label, value, max = 2 }: ScoreRowProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const bars = Math.round(Math.abs(value));

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-0.5 flex-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "h-2 flex-1 rounded-sm",
              isPositive && i < bars ? "bg-green-500" :
              isNegative && i < bars ? "bg-red-500" :
              "bg-[#1e2d45]"
            )}
          />
        ))}
      </div>
      <span className={clsx(
        "price w-8 text-right font-medium",
        isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-slate-500"
      )}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

export default function SignalCard({ signal }: { signal: EngineOutput }) {
  const isBuy  = signal.signal === "BUY" || signal.signal === "STRONG_BUY";
  const isSell = signal.signal === "SELL" || signal.signal === "STRONG_SELL";

  return (
    <div className="card fade-in">
      {/* Header badge */}
      <div className={clsx(
        "flex items-center justify-between px-4 py-3 rounded-t-xl",
        isBuy  ? "bg-green-600/20 border-b border-green-600/30" :
        isSell ? "bg-red-600/20 border-b border-red-600/30" :
        "bg-yellow-600/10 border-b border-yellow-600/20"
      )}>
        <div className="flex items-center gap-2">
          <div className={clsx(
            "p-1.5 rounded-lg",
            isBuy  ? "bg-green-600 text-white" :
            isSell ? "bg-red-600 text-white" :
            "bg-yellow-600/40 text-yellow-300"
          )}>
            <SignalIcon signal={signal.signal} />
          </div>
          <div>
            <div className={clsx(
              "text-lg font-bold tracking-wide",
              isBuy  ? "text-green-400" :
              isSell ? "text-red-400" :
              "text-yellow-400"
            )}>
              {signalLabel(signal.signal)}
            </div>
            <div className="text-xs text-slate-400">
              {signal.pair} · {signal.timeframe}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="price text-xl font-bold text-white">
            {signal.currentPrice.toFixed(signal.pair === "GBP/JPY" ? 3 : 5)}
          </div>
          <div className="text-xs text-slate-400">
            {fmtUnixTime(signal.timestamp)}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Confidence */}
        <ConfidenceBar confidence={signal.confidence} signal={signal.signal} />

        {/* Score breakdown */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Score Breakdown
          </div>
          <ScoreRow label="Trend"           value={signal.score.trendScore} />
          <ScoreRow label="Momentum"        value={signal.score.momentumScore} />
          <ScoreRow label="Breakout/S&R"    value={signal.score.breakoutScore} />
          <ScoreRow label="Supply & Demand" value={signal.score.sdScore} />
          <ScoreRow label="ADX Filter"      value={signal.score.adxScore} max={1} />
          <ScoreRow label="Bollinger Band"  value={signal.score.bbScore} />
          <ScoreRow label="Pattern"         value={signal.score.patternBonus} max={1} />
          {signal.score.volatilityPenalty !== 0 && (
            <ScoreRow label="Volatility" value={signal.score.volatilityPenalty} />
          )}
          <div className="flex justify-between items-center pt-1 border-t border-[#1e2d45] text-xs">
            <span className="text-slate-400 font-medium">Total Score</span>
            <span className={clsx(
              "price font-bold",
              signal.score.total > 0 ? "text-green-400" :
              signal.score.total < 0 ? "text-red-400" :
              "text-slate-400"
            )}>
              {signal.score.total > 0 ? `+${signal.score.total.toFixed(1)}` : signal.score.total.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Why section */}
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Why This Signal
          </div>
          <ul className="space-y-1.5">
            {signal.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <span className={clsx(
                  "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                  isBuy  ? "bg-green-500" :
                  isSell ? "bg-red-500" :
                  "bg-yellow-500"
                )} />
                {reason}
              </li>
            ))}
          </ul>
        </div>

        {/* Detected patterns */}
        {signal.indicators.detectedPatterns.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {signal.indicators.detectedPatterns.map((p, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-blue-600/20 border border-blue-600/40 text-blue-300 text-xs rounded-full"
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* When to Long / Short */}
        <WhenToTrade signal={signal} />

        {/* Disclaimer */}
        <p className="text-xs text-slate-500 italic">
          ⚠ Educational tool only. Not financial advice.
        </p>
      </div>
    </div>
  );
}

// ── When to Long / When to Short ─────────────────────────────────────────────

interface Condition { label: string; met: boolean }

function ConditionList({ conditions, color }: { conditions: Condition[]; color: "green" | "red" }) {
  return (
    <>
      {conditions.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className={clsx(
            "mt-px font-bold shrink-0",
            c.met
              ? color === "green" ? "text-green-400" : "text-red-400"
              : "text-slate-600"
          )}>
            {c.met ? "✓" : "✗"}
          </span>
          <span className={c.met ? "text-slate-200" : "text-slate-500"}>{c.label}</span>
        </div>
      ))}
    </>
  );
}

function WhenToTrade({ signal }: { signal: EngineOutput }) {
  const { indicators: ind, score } = signal;
  const rsi = isNaN(ind.rsi) ? 50 : ind.rsi;
  const macdBull = ind.macdLine > ind.signalLine;

  const adxTrending  = !isNaN(ind.adx) && ind.adx > 20;
  const stochOversold  = !isNaN(ind.stochK) && ind.stochK < 30;
  const stochOverbought = !isNaN(ind.stochK) && ind.stochK > 70;
  const bbLow  = !isNaN(ind.bbPercentB) && ind.bbPercentB <= 0.2;
  const bbHigh = !isNaN(ind.bbPercentB) && ind.bbPercentB >= 0.8;

  const longConditions: Condition[] = [
    { label: "Uptrend active — EMA20 above EMA50",         met: score.trendScore > 0 },
    { label: "ADX > 20 — market is trending",              met: adxTrending },
    { label: "RSI building strength (40–70)",              met: rsi >= 40 && rsi < 70 },
    { label: "Stochastic oversold or bullish cross (< 30)", met: stochOversold },
    { label: "MACD bullish — above signal line",           met: macdBull },
    { label: "At support / broke resistance / BB low",     met: score.breakoutScore > 0 || bbLow },
    { label: "Price in demand zone",                       met: score.sdScore > 0 },
  ];

  const shortConditions: Condition[] = [
    { label: "Downtrend active — EMA20 below EMA50",       met: score.trendScore < 0 },
    { label: "ADX > 20 — market is trending",              met: adxTrending },
    { label: "RSI showing weakness (30–60)",               met: rsi > 30 && rsi <= 60 },
    { label: "Stochastic overbought or bearish cross (> 70)", met: stochOverbought },
    { label: "MACD bearish — below signal line",           met: !macdBull },
    { label: "At resistance / broke support / BB high",    met: score.breakoutScore < 0 || bbHigh },
    { label: "Price in supply zone",                       met: score.sdScore < 0 },
  ];

  const longMet  = longConditions.filter(c => c.met).length;
  const shortMet = shortConditions.filter(c => c.met).length;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
        When to Trade
      </div>

      {/* Long */}
      <div className="rounded-lg bg-green-600/10 border border-green-600/20 p-3 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
            <TrendingUp className="w-3.5 h-3.5" /> GO LONG (BUY)
          </span>
          <span className={clsx(
            "text-xs font-medium",
            longMet >= 4 ? "text-green-300" : longMet >= 2 ? "text-yellow-400" : "text-slate-500"
          )}>
            {longMet}/{longConditions.length} met
          </span>
        </div>
        <ConditionList conditions={longConditions} color="green" />
      </div>

      {/* Short */}
      <div className="rounded-lg bg-red-600/10 border border-red-600/20 p-3 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <TrendingDown className="w-3.5 h-3.5" /> GO SHORT (SELL)
          </span>
          <span className={clsx(
            "text-xs font-medium",
            shortMet >= 4 ? "text-red-300" : shortMet >= 2 ? "text-yellow-400" : "text-slate-500"
          )}>
            {shortMet}/{shortConditions.length} met
          </span>
        </div>
        <ConditionList conditions={shortConditions} color="red" />
      </div>
    </div>
  );
}
