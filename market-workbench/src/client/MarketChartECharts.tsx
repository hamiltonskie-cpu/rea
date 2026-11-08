import { useEffect, useRef } from "react";
import { CandlestickChart, LineChart } from "echarts/charts";
import {
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import type { EChartsOption } from "echarts";
import { CanvasRenderer } from "echarts/renderers";
import { FIBONACCI_RETRACEMENTS, fibonacciRetracementLevels } from "../shared/chartStudies.js";
import { consumeCandleStreamEvent } from "../shared/candleStream.js";
import {
  bollingerBands,
  calculateIndicatorSnapshot,
  exponentialMovingAverage,
  simpleMovingAverage,
  type IndicatorSnapshot,
} from "../shared/indicators.js";
import { candleBatchSchema, type Candle, type Interval } from "../shared/market.js";

use([
  CanvasRenderer,
  CandlestickChart,
  LineChart,
  GridComponent,
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  TooltipComponent,
]);

interface MarketChartProps {
  symbol: string;
  interval: Interval;
  timezone: string;
  showFastAverage: boolean;
  showSlowAverage: boolean;
  showEma: boolean;
  showBollinger: boolean;
  showFibonacci: boolean;
  onLastCandle: (candle: Candle) => void;
  onIndicatorsChange: (snapshot: IndicatorSnapshot) => void;
  onFeedStatus: (connected: boolean) => void;
}

interface VisibleStudies {
  fast: boolean;
  slow: boolean;
  ema: boolean;
  bollinger: boolean;
  fibonacci: boolean;
}

export default function MarketChartECharts({
  symbol,
  interval,
  timezone,
  showFastAverage,
  showSlowAverage,
  showEma,
  showBollinger,
  showFibonacci,
  onLastCandle,
  onIndicatorsChange,
  onFeedStatus,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const renderChartRef = useRef<() => void>(() => undefined);
  const visibleStudiesRef = useRef<VisibleStudies>({
    fast: showFastAverage,
    slow: showSlowAverage,
    ema: showEma,
    bollinger: showBollinger,
    fibonacci: showFibonacci,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    let source: EventSource | undefined;
    const chart = init(container, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);
    chart.setOption(createBaseOption(interval, timezone, () => candlesRef.current));

    const renderChart = () => {
      const candles = candlesRef.current;
      chart.setOption({
        xAxis: { data: candles.map(({ time }) => String(time)) },
        series: createSeries(candles, visibleStudiesRef.current),
      });
      onIndicatorsChange(calculateIndicatorSnapshot(candles));
    };
    renderChartRef.current = renderChart;

    const connect = async () => {
      try {
        const response = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=240`,
        );
        if (!response.ok) throw new Error("Candle request failed");
        const body = candleBatchSchema.safeParse(await response.json());
        if (!body.success) throw new Error("Candle response contained invalid data");
        if (!active) return;
        candlesRef.current = body.data.candles;
        renderChart();
        const lastCandle = candlesRef.current.at(-1);
        if (lastCandle) onLastCandle(lastCandle);

        source = new EventSource(
          `/api/stream?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
        );
        source.onopen = () => onFeedStatus(true);
        source.onerror = () => onFeedStatus(false);
        source.addEventListener("feed-error", () => onFeedStatus(false));
        source.addEventListener("candle", (event) => {
          if (!active) return;
          consumeCandleStreamEvent(
            (event as MessageEvent<string>).data,
            (candle) => {
              const candles = candlesRef.current;
              const last = candles.at(-1);
              if (!last || candle.time > last.time) candles.push(candle);
              else if (candle.time === last.time) candles[candles.length - 1] = candle;
              else return;
              if (candles.length > 500) candles.shift();

              renderChart();
              onLastCandle(candle);
            },
            onFeedStatus,
          );
        });
      } catch {
        if (active) onFeedStatus(false);
      }
    };

    void connect();
    return () => {
      active = false;
      source?.close();
      resizeObserver.disconnect();
      chart.dispose();
      if (chartRef.current === chart) chartRef.current = null;
      renderChartRef.current = () => undefined;
    };
  }, [interval, onFeedStatus, onIndicatorsChange, onLastCandle, symbol, timezone]);

  useEffect(() => {
    visibleStudiesRef.current = {
      fast: showFastAverage,
      slow: showSlowAverage,
      ema: showEma,
      bollinger: showBollinger,
      fibonacci: showFibonacci,
    };
    renderChartRef.current();
  }, [showBollinger, showEma, showFastAverage, showFibonacci, showSlowAverage]);

  return <div className="market-chart" ref={containerRef} aria-label={`${symbol} ${interval} candlestick chart`} />;
}

function createBaseOption(interval: Interval, timezone: string, getCandles: () => Candle[]): EChartsOption {
  return {
    animation: false,
    backgroundColor: "#fbfcf8",
    grid: { left: 62, right: 22, top: 34, bottom: 42 },
    xAxis: {
      type: "category",
      data: [],
      boundaryGap: true,
      axisLine: { lineStyle: { color: "#e4e9e1" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#77817a",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: string) => formatTick(Number(value), interval, timezone),
      },
      splitLine: { show: false },
      axisPointer: {
        label: {
          backgroundColor: "#27382f",
          formatter: ({ value }) => formatFullTime(Number(value), timezone, interval),
        },
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: true, lineStyle: { color: "#e4e9e1" } },
      axisTick: { show: false },
      axisLabel: { color: "#77817a", fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
      splitLine: { lineStyle: { color: "#edf0e9" } },
      axisPointer: { label: { backgroundColor: "#27382f" } },
    },
    axisPointer: { type: "cross", link: [{ xAxisIndex: "all" }] },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "#ffffff",
      borderColor: "#dfe5dc",
      textStyle: { color: "#23332b", fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
      formatter: (raw) => {
        const points = Array.isArray(raw) ? raw : [raw];
        const axisValue = points[0]?.name;
        const candle = getCandles().find((value) => String(value.time) === String(axisValue));
        if (!candle) return "";
        return [
          formatFullTime(candle.time, timezone, interval),
          `O ${formatPrice(candle.open)}`,
          `H ${formatPrice(candle.high)}`,
          `L ${formatPrice(candle.low)}`,
          `C ${formatPrice(candle.close)}`,
          `VOL ${formatCompact(candle.volume)}`,
        ].join("<br/>");
      },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "slider", xAxisIndex: 0, height: 12, bottom: 4, showDetail: false, borderColor: "#e4e9e1" },
    ],
    series: [],
  };
}

function createSeries(candles: Candle[], visible: VisibleStudies): NonNullable<EChartsOption["series"]> {
  const bands = bollingerBands(candles);
  const fibonacciLevels = fibonacciRetracementLevels(candles);
  const firstPrice = candles[0]?.time;
  const lastPrice = candles.at(-1)?.time;
  const fibonacciColors = ["#a68a51", "#6e8c78", "#69809a", "#987b9c", "#b0785e", "#6d8d91", "#a68a51"];

  return [
    {
      id: "ohlc",
      name: "OHLC",
      type: "candlestick",
      data: candles.map(({ open, close, low, high }) => [open, close, low, high]),
      itemStyle: { color: "#207d5a", color0: "#d46352", borderColor: "#207d5a", borderColor0: "#d46352" },
    },
    createLineSeries("sma-9", "SMA 9", "#d49c30", candles, simpleMovingAverage(candles, 9), visible.fast),
    createLineSeries("sma-21", "SMA 21", "#4779a8", candles, simpleMovingAverage(candles, 21), visible.slow),
    createLineSeries("ema-20", "EMA 20", "#a65c95", candles, exponentialMovingAverage(candles, 20), visible.ema),
    createLineSeries("bb-upper", "BB upper", "#8ba6a2", candles, bands.map(({ time, upper }) => ({ time, value: upper })), visible.bollinger),
    createLineSeries("bb-lower", "BB lower", "#8ba6a2", candles, bands.map(({ time, lower }) => ({ time, value: lower })), visible.bollinger),
    ...FIBONACCI_RETRACEMENTS.map(({ label }, index) => {
      const level = fibonacciLevels[index];
      const data = candles.map((candle) =>
        level && (candle.time === firstPrice || candle.time === lastPrice) ? level.price : null,
      );
      return {
        id: `fibonacci-${index}`,
        name: label,
        type: "line" as const,
        data,
        connectNulls: true,
        showSymbol: false,
        silent: true,
        lineStyle: { color: fibonacciColors[index] ?? "#8a806d", width: 1, type: "dashed" as const, opacity: visible.fibonacci ? 0.9 : 0 },
      };
    }),
  ];
}

function createLineSeries(
  id: string,
  name: string,
  color: string,
  candles: Candle[],
  points: { time: number; value: number }[],
  visible: boolean,
) {
  const values = new Map(points.map(({ time, value }) => [time, value]));
  return {
    id,
    name,
    type: "line" as const,
    data: candles.map(({ time }) => values.get(time) ?? null),
    showSymbol: false,
    connectNulls: false,
    silent: !visible,
    lineStyle: { color, width: 1.5, opacity: visible ? 1 : 0 },
  };
}

function formatTick(epochSeconds: number, interval: Interval, timezone: string): string {
  const date = new Date(epochSeconds * 1_000);
  const options: Intl.DateTimeFormatOptions =
    interval === "1d"
      ? { month: "short", day: "numeric" }
      : interval.endsWith("s")
        ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
        : interval === "1h" || interval === "4h"
          ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
          : { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("en", { ...options, timeZone: timezone }).format(date);
}

function formatFullTime(epochSeconds: number, timezone: string, interval: Interval): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(interval.endsWith("s") ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(new Date(epochSeconds * 1_000));
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}