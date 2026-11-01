import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  bollingerBands,
  calculateIndicatorSnapshot,
  exponentialMovingAverage,
  simpleMovingAverage,
  type IndicatorSnapshot,
} from "../shared/indicators.js";
import type { Candle, Interval } from "../shared/market.js";

interface MarketChartProps {
  symbol: string;
  interval: Interval;
  timezone: string;
  showFastAverage: boolean;
  showSlowAverage: boolean;
  showEma: boolean;
  showBollinger: boolean;
  onLastCandle: (candle: Candle) => void;
  onIndicatorsChange: (snapshot: IndicatorSnapshot) => void;
  onFeedStatus: (connected: boolean) => void;
}

export default function MarketChart({
  symbol,
  interval,
  timezone,
  showFastAverage,
  showSlowAverage,
  showEma,
  showBollinger,
  onLastCandle,
  onIndicatorsChange,
  onFeedStatus,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorSeriesRef = useRef<{
    fast?: ISeriesApi<"Line">;
    slow?: ISeriesApi<"Line">;
    ema?: ISeriesApi<"Line">;
    upper?: ISeriesApi<"Line">;
    lower?: ISeriesApi<"Line">;
  }>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    let source: EventSource | undefined;
    let candles: Candle[] = [];
    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#fbfcf8" },
        textColor: "#77817a",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#edf0e9" },
        horzLines: { color: "#edf0e9" },
      },
      rightPriceScale: { borderColor: "#e4e9e1" },
      timeScale: {
        borderColor: "#e4e9e1",
        timeVisible: interval !== "1d",
        secondsVisible: interval.endsWith("s"),
        tickMarkFormatter: (time: Time) => formatTick(time, interval, timezone),
      },
      localization: {
        timeFormatter: (time: Time) => formatFullTime(time, timezone, interval),
      },
      crosshair: {
        vertLine: { color: "#87948a", labelBackgroundColor: "#27382f" },
        horzLine: { color: "#87948a", labelBackgroundColor: "#27382f" },
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#207d5a",
      downColor: "#d46352",
      borderUpColor: "#207d5a",
      borderDownColor: "#d46352",
      wickUpColor: "#207d5a",
      wickDownColor: "#d46352",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const fastLine = chart.addSeries(LineSeries, {
      color: "#d49c30",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showFastAverage,
    });
    const slowLine = chart.addSeries(LineSeries, {
      color: "#4779a8",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showSlowAverage,
    });
    const emaLine = chart.addSeries(LineSeries, {
      color: "#a65c95",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showEma,
    });
    const upperBand = chart.addSeries(LineSeries, {
      color: "#8ba6a2",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showBollinger,
    });
    const lowerBand = chart.addSeries(LineSeries, {
      color: "#8ba6a2",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showBollinger,
    });
    indicatorSeriesRef.current = {
      fast: fastLine,
      slow: slowLine,
      ema: emaLine,
      upper: upperBand,
      lower: lowerBand,
    };

    const renderIndicators = () => {
      fastLine.setData(toChartLine(simpleMovingAverage(candles, 9)));
      slowLine.setData(toChartLine(simpleMovingAverage(candles, 21)));
      emaLine.setData(toChartLine(exponentialMovingAverage(candles, 20)));
      const bands = bollingerBands(candles);
      upperBand.setData(toChartLine(bands.map(({ time, upper }) => ({ time, value: upper }))));
      lowerBand.setData(toChartLine(bands.map(({ time, lower }) => ({ time, value: lower }))));
      onIndicatorsChange(calculateIndicatorSnapshot(candles));
    };

    const connect = async () => {
      try {
        const response = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=240`,
        );
        if (!response.ok) throw new Error("Candle request failed");
        const body = (await response.json()) as { candles: Candle[] };
        if (!active) return;
        candles = body.candles;
        candleSeries.setData(candles.map(toChartCandle));
        renderIndicators();
        chart.timeScale().fitContent();
        if (candles.length > 0) onLastCandle(candles[candles.length - 1]);

        source = new EventSource(
          `/api/stream?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
        );
        source.onopen = () => onFeedStatus(true);
        source.onerror = () => onFeedStatus(false);
        source.addEventListener("candle", (event) => {
          const candle = JSON.parse((event as MessageEvent<string>).data) as Candle;
          const last = candles[candles.length - 1];
          if (!last || candle.time > last.time) candles.push(candle);
          else if (candle.time === last.time) candles[candles.length - 1] = candle;
          else return;
          if (candles.length > 500) candles.shift();

          candleSeries.update(toChartCandle(candle));
          renderIndicators();
          onLastCandle(candle);
        });
      } catch {
        if (active) onFeedStatus(false);
      }
    };

    void connect();
    return () => {
      active = false;
      source?.close();
      indicatorSeriesRef.current = {};
      chart.remove();
    };
  }, [interval, onFeedStatus, onIndicatorsChange, onLastCandle, symbol, timezone]);

  useEffect(() => {
    indicatorSeriesRef.current.fast?.applyOptions({ visible: showFastAverage });
    indicatorSeriesRef.current.slow?.applyOptions({ visible: showSlowAverage });
    indicatorSeriesRef.current.ema?.applyOptions({ visible: showEma });
    indicatorSeriesRef.current.upper?.applyOptions({ visible: showBollinger });
    indicatorSeriesRef.current.lower?.applyOptions({ visible: showBollinger });
  }, [showBollinger, showEma, showFastAverage, showSlowAverage]);

  return <div className="market-chart" ref={containerRef} aria-label={`${symbol} ${interval} candlestick chart`} />;
}

function toChartCandle(candle: Candle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toChartLine(points: { time: number; value: number }[]) {
  return points.map(({ time, value }) => ({ time: time as UTCTimestamp, value }));
}

function formatTick(time: Time, interval: Interval, timezone: string): string {
  const date = new Date(Number(time) * 1_000);
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

function formatFullTime(time: Time, timezone: string, interval: Interval): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(interval.endsWith("s") ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(new Date(Number(time) * 1_000));
}