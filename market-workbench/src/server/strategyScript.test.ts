import assert from "node:assert/strict";
import test from "node:test";
import type { Candle } from "../shared/market.js";
import type { StrategyBacktestRequest } from "../shared/strategyScript.js";
import { runStrategyBacktest } from "./backtest.js";

const request: StrategyBacktestRequest = {
  symbol: "TEST-USD",
  interval: "1m",
  timezone: "UTC",
  script: {
    version: 1,
    name: "Close threshold",
    indicators: { close: { kind: "close" } },
    entry: { left: { indicator: "close" }, operator: "above", right: { value: 10 } },
    exit: { left: { indicator: "close" }, operator: "above", right: { value: 11 } },
    startingBalance: 10_000,
    feeBps: 10,
  },
};

function candles(closes: number[], opens: number[]): Candle[] {
  return closes.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: opens[index] ?? close,
    high: Math.max(close, opens[index] ?? close),
    low: Math.min(close, opens[index] ?? close),
    close,
    volume: 100,
  }));
}

test("runs scripted close conditions with next-open fills and fees", () => {
  const bars = candles([9, 11, 12, 9], [9, 11, 20, 30]);
  const result = runStrategyBacktest(bars, request);

  assert.equal(result.strategyName, "Close threshold");
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, bars[2].open);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, bars[3].open);
  assert.equal(result.indicatorValues.close, bars[3].close);
  assert.equal(result.feeBps, 10);
});

test("does not trigger a threshold crossing when RSI remains above its entry level", () => {
  const scriptRequest = structuredClone(request);
  scriptRequest.script.indicators = { rsi: { kind: "rsi", period: 14 } };
  scriptRequest.script.entry.left = { indicator: "rsi" };
  scriptRequest.script.exit.left = { indicator: "rsi" };
  scriptRequest.script.entry.operator = "crossesBelow";
  scriptRequest.script.exit.operator = "crossesAbove";
  scriptRequest.script.entry.right = { value: 30 };
  scriptRequest.script.exit.right = { value: 70 };
  const result = runStrategyBacktest(candles(Array.from({ length: 20 }, (_, index) => 10 + index), []), scriptRequest);

  assert.equal(result.trades.length, 0);
  assert.equal(result.indicatorValues.rsi, 100);
});