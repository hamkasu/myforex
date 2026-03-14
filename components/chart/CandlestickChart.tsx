"use client";

import { useEffect, useRef } from "react";
import type { Candle, ForexPair, Timeframe, BacktestTrade } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { calculateEMA } from "@/lib/indicators/ema";
import { chartTimeFormatter, chartTickFormatter } from "@/lib/utils/time";

interface CandlestickChartProps {
  candles: Candle[];
  pair: ForexPair;
  timeframe: Timeframe;
  signal: EngineOutput | null;
  loading: boolean;
  /** When provided, replaces the live signal arrow with entry/TP/exit backtest markers */
  backtestTrades?: BacktestTrade[];
}

export default function CandlestickChart({
  candles, pair, timeframe, signal, loading, backtestTrades,
}: CandlestickChartProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const ema20SeriesRef  = useRef<any>(null);
  const ema50SeriesRef  = useRef<any>(null);
  // Track active price lines so we can remove them before re-drawing
  const priceLinesRef   = useRef<{ series: any; line: any }[]>([]);

  // ── Initialize chart once ────────────────────────────────────────────────
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
          scaleMargins: { top: 0.08, bottom: 0.18 },
        },
        timeScale: {
          borderColor: "#1e2d45",
          timeVisible: timeframe !== "1d",
          secondsVisible: false,
          rightOffset: 5,
          tickMarkFormatter: (time: number, type: number) => chartTickFormatter(time, type),
        },
        localization: {
          timeFormatter: (time: number) => chartTimeFormatter(time, timeframe),
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
        autoSize: true,
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "#22c55e",
        wickDownColor:   "#ef4444",
      });

      const ema20Series = chart.addLineSeries({
        color:            "#f59e0b",
        lineWidth:        1.5,
        title:            "EMA20",
        lastValueVisible: false,
        priceLineVisible: false,
      });

      const ema50Series = chart.addLineSeries({
        color:            "#8b5cf6",
        lineWidth:        1.5,
        title:            "EMA50",
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chartRef.current      = chart;
      candleSeriesRef.current = candleSeries;
      ema20SeriesRef.current  = ema20Series;
      ema50SeriesRef.current  = ema50Series;
    };

    initChart().catch(console.error);

    return () => {
      chart?.remove();
      chartRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // ── Update data + overlays on candle/signal/backtest change ─────────────
  useEffect(() => {
    if (!candles.length || !candleSeriesRef.current) return;

    const closes = candles.map((c) => c.close);
    const ema20  = calculateEMA(closes, 20);
    const ema50  = calculateEMA(closes, 50);

    // Candles
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
      }))
    );

    // EMA lines
    ema20SeriesRef.current?.setData(
      candles.map((c, i) => ({ time: c.time, value: ema20[i] })).filter((d) => !isNaN(d.value))
    );
    ema50SeriesRef.current?.setData(
      candles.map((c, i) => ({ time: c.time, value: ema50[i] })).filter((d) => !isNaN(d.value))
    );

    // ── Remove stale price lines (S&D zones + previous backtest TPs) ──────
    for (const { series, line } of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* already gone */ }
    }
    priceLinesRef.current = [];

    const cs = candleSeriesRef.current;

    // ── Backtest mode: entry/TP/exit markers + TP price lines ─────────────
    if (backtestTrades?.length) {
      const markers: {
        time: number; position: string; color: string; shape: string; text: string;
      }[] = [];

      for (const trade of backtestTrades) {
        const isLong  = trade.direction === "long";
        const entryColor = isLong ? "#22c55e" : "#ef4444";
        const exitColor  = trade.outcome === "win" ? "#22c55e" : "#ef4444";

        // Entry arrow
        markers.push({
          time:     trade.entryTime,
          position: isLong ? "belowBar" : "aboveBar",
          color:    entryColor,
          shape:    isLong ? "arrowUp" : "arrowDown",
          text:     isLong ? "L" : "S",
        });

        // Exit circle — shows outcome and R
        const rLabel = `${trade.pnlR >= 0 ? "+" : ""}${trade.pnlR.toFixed(1)}R`;
        const exitReason = trade.exitReason === "tp" ? "TP" : trade.exitReason === "sl" ? "SL" : "T";
        markers.push({
          time:     trade.exitTime,
          position: isLong ? "aboveBar" : "belowBar",
          color:    exitColor,
          shape:    "circle",
          text:     `${exitReason} ${rLabel}`,
        });

        // TP price line — dashed, labeled with R gain
        const tpLine = cs.createPriceLine({
          price:            trade.takeProfit,
          color:            `${entryColor}99`,
          lineWidth:        1,
          lineStyle:        2,   // dashed
          axisLabelVisible: true,
          title:            `TP ${isLong ? "↑" : "↓"}`,
        });
        priceLinesRef.current.push({ series: cs, line: tpLine });
      }

      // lightweight-charts requires markers sorted by time
      markers.sort((a, b) => a.time - b.time);
      cs.setMarkers(markers);

    } else {
      // ── Live signal mode: S&D zones + current signal arrow ──────────────

      // Draw S&D zones as horizontal dashed price bands
      if (signal?.indicators?.sd) {
        const { supplyZones, demandZones } = signal.indicators.sd;

        const addZoneLine = (price: number, color: string, title: string) => {
          const line = cs.createPriceLine({
            price,
            color,
            lineWidth:        1,
            lineStyle:        2,
            axisLabelVisible: true,
            title,
          });
          priceLinesRef.current.push({ series: cs, line });
        };

        // Demand zones (green) — top 3
        for (const z of demandZones.slice(0, 3)) {
          const opacity = z.status === "fresh" ? "dd" : "88";
          const label   = `D${z.strength === 3 ? "★" : z.strength === 2 ? "+" : ""}`;
          addZoneLine(z.top,    `#22c55e${opacity}`, label);
          addZoneLine(z.bottom, `#22c55e66`,         "");
        }

        // Supply zones (red) — top 3
        for (const z of supplyZones.slice(0, 3)) {
          const opacity = z.status === "fresh" ? "dd" : "88";
          const label   = `S${z.strength === 3 ? "★" : z.strength === 2 ? "+" : ""}`;
          addZoneLine(z.top,    `#ef4444${opacity}`, label);
          addZoneLine(z.bottom, `#ef444466`,         "");
        }
      }

      // Signal arrow on latest candle
      if (signal) {
        const markerTime = candles[candles.length - 1].time;
        const isLong = signal.signal === "BUY" || signal.signal === "STRONG_BUY";
        const isSell = signal.signal === "SELL" || signal.signal === "STRONG_SELL";

        if (isLong || isSell) {
          cs.setMarkers([{
            time:     markerTime,
            position: isLong ? "belowBar" : "aboveBar",
            color:    isLong ? "#22c55e" : "#ef4444",
            shape:    isLong ? "arrowUp" : "arrowDown",
            text:     signal.signal.replace("_", " "),
          }]);
        } else {
          cs.setMarkers([]);
        }
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, signal, backtestTrades]);

  return (
    <div className="card">
      <div className="card-header justify-between flex-wrap gap-y-1">
        <span className="text-sm font-medium text-slate-300">{pair} Chart</span>
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-yellow-500 inline-block rounded" /> EMA20
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-purple-500 inline-block rounded" /> EMA50
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-0.5 inline-block rounded"
              style={{ background: "#22c55edd", borderTop: "1px dashed #22c55e" }}
            /> Demand
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-0.5 inline-block rounded"
              style={{ background: "#ef4444dd", borderTop: "1px dashed #ef4444" }}
            /> Supply
          </span>
          {loading && (
            <span className="spin-slow inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full" />
          )}
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: "340px" }} />
    </div>
  );
}
