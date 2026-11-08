import assert from "node:assert/strict";
import test from "node:test";
import {
  averageTrueRangeSeries,
  bollingerPercentBSeries,
  relativeStrengthIndexSeries,
} from "./indicators.js";
import { strategyScriptSchema } from "./strategyScript.js";
import type { Candle } from "./market.js";

const script = {
  version: 1,
  name: "RSI return",
  indicators: { rsi: { kind: "rsi", period: 14 } },
  entry: { left: { indicator: "rsi" }, operator: "crossesBelow", right: { value: 30 } },
  exit: { left: { indicator: "rsi" }, operator: "crossesAbove", right: { value: 70 } },
  startingBalance: 10_000,
  feeBps: 10,
};

function flatCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index * 60,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 100,
  }));
}

test("accepts a safe versioned indicator strategy and rejects unknown references", () => {
  assert.equal(strategyScriptSchema.safeParse(script).success, true);
  const invalid = structuredClone(script);
  invalid.entry.left.indicator = "missing";
  assert.equal(strategyScriptSchema.safeParse(invalid).success, false);
});

test("builds RSI, ATR, and Bollinger percent-B series on candle timestamps", () => {
  const candles = flatCandles(25);

  assert.equal(relativeStrengthIndexSeries(candles, 14)[0]?.time, candles[14].time);
  assert.equal(relativeStrengthIndexSeries(candles, 14)[0]?.value, 50);
  assert.equal(averageTrueRangeSeries(candles, 14)[0]?.time, candles[14].time);
  assert.equal(averageTrueRangeSeries(candles, 14)[0]?.value, 2);
  assert.equal(bollingerPercentBSeries(candles, 20)[0]?.time, candles[19].time);
  assert.equal(bollingerPercentBSeries(candles, 20)[0]?.value, 0.5);
});