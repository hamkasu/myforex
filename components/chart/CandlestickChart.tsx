"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle, ForexPair } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { calculateEMA } from "@/lib/indicators/ema";
import { calculateATR } from "@/lib/indicators/atr";

interface CandlestickChartProps {
  candles: Candle[];
  pair: ForexPair;
  signal: EngineOutput | null;
  loading: boolean;
}

export default function CandlestickChart({
  candles, pair, signal, loading,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const ema20SeriesRef = useRef<any>(null);
  const ema50SeriesRef = useRef<any>(null);

  // ── Initialize chart ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let chart: any;

    const initChart = async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");

      chart = createChart(containerRef.current!, {
        layout: {
          background: { type: ColorType.Solid, color: "#0a0e1a" },
          textColor: "#64748b",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1e2d45" },
          horzLines: { color: "#1e2d45" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#3b82f6", labelBackgroundColor: "#1e40af" },
          horzLine: { color: "#3b82f6", labelBackgroundColor: "#1e40af" },
        },
        rightPriceScale: {
          borderColor: "#1e2d45",
          textColor: "#64748b",
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
          borderColor: "#1e2d45",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
        autoSize: true,
      });

      // Candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      // EMA 20
      const ema20Series = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 1.5,
        title: "EMA20",
        lastValueVisible: false,
        priceLineVisible: false,
      });

      // EMA 50
      const ema50Series = chart.addLineSeries({
        color: "#8b5cf6",
        lineWidth: 1.5,
        title: "EMA50",
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      ema20SeriesRef.current = ema20Series;
      ema50SeriesRef.current = ema50Series;
    };

    initChart().catch(console.error);

    return () => {
      chart?.remove();
      chartRef.current = null;
    };
  }, []);

  // ── Update data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!candles.length || !candleSeriesRef.current) return;

    const closes = candles.map((c) => c.close);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);

    // Candles
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // EMA lines
    const ema20Data = candles
      .map((c, i) => ({ time: c.time, value: ema20[i] }))
      .filter((d) => !isNaN(d.value));
    ema20SeriesRef.current?.setData(ema20Data);

    const ema50Data = candles
      .map((c, i) => ({ time: c.time, value: ema50[i] }))
      .filter((d) => !isNaN(d.value));
    ema50SeriesRef.current?.setData(ema50Data);

    // Signal markers
    if (signal && chartRef.current) {
      const markerTime = candles[candles.length - 1].time;
      const isLong = signal.signal === "BUY" || signal.signal === "STRONG_BUY";
      const isSell = signal.signal === "SELL" || signal.signal === "STRONG_SELL";

      if (isLong || isSell) {
        candleSeriesRef.current.setMarkers([
          {
            time: markerTime,
            position: isLong ? "belowBar" : "aboveBar",
            color: isLong ? "#22c55e" : "#ef4444",
            shape: isLong ? "arrowUp" : "arrowDown",
            text: signal.signal.replace("_", " "),
          },
        ]);
      } else {
        candleSeriesRef.current.setMarkers([]);
      }
    }

    // Fit visible range
    chartRef.current?.timeScale().fitContent();
  }, [candles, signal]);

  return (
    <div className="card">
      <div className="card-header justify-between">
        <span className="text-sm font-medium text-slate-300">{pair} Chart</span>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-yellow-500 inline-block rounded" />
            EMA20
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-purple-500 inline-block rounded" />
            EMA50
          </span>
          {loading && (
            <span className="spin-slow inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full" />
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: "320px" }}
      />
    </div>
  );
}
