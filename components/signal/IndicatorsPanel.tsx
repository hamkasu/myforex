"use client";

import type { Candle } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { Activity } from "lucide-react";
import clsx from "clsx";

interface IndicatorRowProps {
  label: string;
  value: string | number;
  subtext?: string;
  badge?: { text: string; color: string };
}

function IndicatorRow({ label, value, subtext, badge }: IndicatorRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1e2d45] last:border-0">
      <div>
        <div className="text-sm text-slate-300">{label}</div>
        {subtext && <div className="text-xs text-slate-500">{subtext}</div>}
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className={clsx("text-xs px-2 py-0.5 rounded-full", badge.color)}>
            {badge.text}
          </span>
        )}
        <span className="price font-semibold text-white text-sm">{value}</span>
      </div>
    </div>
  );
}

function rsiStatus(rsi: number): { text: string; color: string } {
  if (rsi < 30) return { text: "Oversold", color: "bg-green-600/30 text-green-300" };
  if (rsi < 45) return { text: "Bearish",  color: "bg-red-600/30 text-red-300" };
  if (rsi < 55) return { text: "Neutral",  color: "bg-slate-600/30 text-slate-300" };
  if (rsi < 70) return { text: "Bullish",  color: "bg-green-600/30 text-green-300" };
  return           { text: "Overbought", color: "bg-red-600/30 text-red-300" };
}

function macdStatus(h: number): { text: string; color: string } {
  if (h > 0) return { text: "Bullish", color: "bg-green-600/30 text-green-300" };
  if (h < 0) return { text: "Bearish", color: "bg-red-600/30 text-red-300" };
  return           { text: "Neutral", color: "bg-slate-600/30 text-slate-300" };
}

function emaTrendStatus(ema20: number, ema50: number): { text: string; color: string } {
  if (ema20 > ema50) return { text: "Uptrend",   color: "bg-green-600/30 text-green-300" };
  if (ema20 < ema50) return { text: "Downtrend", color: "bg-red-600/30 text-red-300" };
  return                    { text: "Sideways",  color: "bg-slate-600/30 text-slate-300" };
}

export default function IndicatorsPanel({
  signal,
  candles,
}: {
  signal: EngineOutput;
  candles: Candle[];
}) {
  const ind = signal.indicators;
  const decimals = signal.pair === "GBP/JPY" ? 3 : 5;

  return (
    <div className="card fade-in">
      <div className="card-header">
        <Activity className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-300">Indicators</span>
      </div>

      <div className="px-4 py-1">
        <IndicatorRow
          label="EMA 20"
          value={ind.ema20?.toFixed(decimals) ?? "—"}
          subtext={`EMA 50: ${ind.ema50?.toFixed(decimals) ?? "—"}`}
          badge={emaTrendStatus(ind.ema20, ind.ema50)}
        />

        <IndicatorRow
          label="RSI (14)"
          value={ind.rsi?.toFixed(1) ?? "—"}
          badge={isNaN(ind.rsi) ? undefined : rsiStatus(ind.rsi)}
        />

        <IndicatorRow
          label="MACD"
          value={ind.macdLine?.toFixed(5) ?? "—"}
          subtext={`Signal: ${ind.signalLine?.toFixed(5) ?? "—"} · Hist: ${ind.histogram?.toFixed(5) ?? "—"}`}
          badge={isNaN(ind.histogram) ? undefined : macdStatus(ind.histogram)}
        />

        <IndicatorRow
          label="ATR (14)"
          value={ind.atr?.toFixed(decimals) ?? "—"}
          subtext="Average True Range — volatility measure"
        />

        {/* Support levels */}
        <div className="py-2.5 border-b border-[#1e2d45]">
          <div className="text-sm text-slate-300 mb-1">Support Levels</div>
          {ind.supportLevels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {ind.supportLevels.map((s, i) => (
                <span
                  key={i}
                  className="price text-xs px-2 py-0.5 bg-green-600/20 border border-green-600/30 text-green-300 rounded"
                >
                  {s.toFixed(decimals)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">None detected</span>
          )}
        </div>

        {/* Resistance levels */}
        <div className="py-2.5">
          <div className="text-sm text-slate-300 mb-1">Resistance Levels</div>
          {ind.resistanceLevels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {ind.resistanceLevels.map((r, i) => (
                <span
                  key={i}
                  className="price text-xs px-2 py-0.5 bg-red-600/20 border border-red-600/30 text-red-300 rounded"
                >
                  {r.toFixed(decimals)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">None detected</span>
          )}
        </div>
      </div>
    </div>
  );
}
