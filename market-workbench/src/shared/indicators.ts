import type { Candle } from "./market.js";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface IndicatorSnapshot {
  rsi14: number | null;
  atr14: number | null;
  realizedVolatility20: number | null;
  bollingerPercentB: number | null;
}

export function simpleMovingAverage(candles: Candle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let total = 0;
  for (let index = 0; index < candles.length; index += 1) {
    total += candles[index].close;
    if (index >= period) total -= candles[index - period].close;
    if (index >= period - 1) {
      points.push({ time: candles[index].time, value: total / period });
    }
  }
  return points;
}

export function exponentialMovingAverage(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const points: IndicatorPoint[] = [];
  const seed = candles.slice(0, period).reduce((total, candle) => total + candle.close, 0) / period;
  let average = seed;
  const multiplier = 2 / (period + 1);
  points.push({ time: candles[period - 1].time, value: average });

  for (let index = period; index < candles.length; index += 1) {
    average = (candles[index].close - average) * multiplier + average;
    points.push({ time: candles[index].time, value: average });
  }
  return points;
}

export function bollingerBands(candles: Candle[], period = 20, deviations = 2): BollingerPoint[] {
  const bands: BollingerPoint[] = [];
  for (let end = period - 1; end < candles.length; end += 1) {
    const start = end - period + 1;
    let total = 0;
    for (let index = start; index <= end; index += 1) total += candles[index].close;
    const middle = total / period;
    let squaredDifference = 0;
    for (let index = start; index <= end; index += 1) {
      squaredDifference += (candles[index].close - middle) ** 2;
    }
    const spread = deviations * Math.sqrt(squaredDifference / period);
    bands.push({
      time: candles[end].time,
      upper: middle + spread,
      middle,
      lower: middle - spread,
    });
  }
  return bands;
}

export function calculateIndicatorSnapshot(candles: Candle[]): IndicatorSnapshot {
  return {
    rsi14: calculateRsi(candles, 14),
    atr14: calculateAtr(candles, 14),
    realizedVolatility20: calculateRealizedVolatility(candles, 20),
    bollingerPercentB: calculateBollingerPercentB(candles, 20, 2),
  };
}

function calculateRsi(candles: Candle[], period: number): number | null {
  if (candles.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function calculateAtr(candles: Candle[], period: number): number | null {
  if (candles.length <= period) return null;
  let total = 0;
  for (let index = 1; index <= period; index += 1) {
    total += trueRange(candles[index], candles[index - 1].close);
  }
  let average = total / period;
  for (let index = period + 1; index < candles.length; index += 1) {
    average =
      (average * (period - 1) + trueRange(candles[index], candles[index - 1].close)) / period;
  }
  return average;
}

function trueRange(candle: Candle, previousClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  );
}

function calculateRealizedVolatility(candles: Candle[], returnCount: number): number | null {
  if (candles.length <= returnCount) return null;
  const first = candles.length - returnCount - 1;
  const returns: number[] = [];
  for (let index = first + 1; index < candles.length; index += 1) {
    returns.push(Math.log(candles[index].close / candles[index - 1].close));
  }
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

function calculateBollingerPercentB(
  candles: Candle[],
  period: number,
  deviations: number,
): number | null {
  const latest = bollingerBands(candles, period, deviations).at(-1);
  if (!latest) return null;
  const width = latest.upper - latest.lower;
  return width === 0 ? 0.5 : (candles[candles.length - 1].close - latest.lower) / width;
}
