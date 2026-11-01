import assert from "node:assert/strict";
import test from "node:test";
import { runBacktest } from "./backtest.js";
import type { BacktestRequest, Candle } from "../shared/market.js";

const request: BacktestRequest = {
  symbol: "TEST",
  interval: "1m",
  fastPeriod: 2,
  slowPeriod: 3,
  startingBalance: 10_000,
  feeBps: 10,
  timezone: "America/New_York",
};

function candles(closes: number[], opens: number[] = closes): Candle[] {
  return closes.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: opens[index],
    high: Math.max(close, opens[index]),
    low: Math.min(close, opens[index]),
    close,
    volume: 100,
  }));
}

test("executes a close-derived signal at the next candle open and includes fees", () => {
  const bars = candles([10, 10, 10, 11, 12, 12], [10, 10, 10, 20, 22, 24]);
  const result = runBacktest(bars, request);

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryTime, bars[4].time);
  assert.equal(result.trades[0].entryPrice, bars[4].open);
  assert.equal(result.trades[0].exitTime, bars[5].time);
  assert.ok(result.endingBalance < request.startingBalance);
  assert.ok(Number.isFinite(result.maxDrawdownPercent));
});

test("rejects invalid IANA timezones and unordered candle timestamps", () => {
  assert.throws(() => runBacktest(candles([1, 2, 3, 4]), { ...request, timezone: "Mars/Olympus" }));
  const outOfOrder = candles([1, 2, 3, 4]);
  outOfOrder[2].time = outOfOrder[1].time;
  assert.throws(() => runBacktest(outOfOrder, request));
});

test("does not enter on the signal candle when a future open changes", () => {
  const first = candles([10, 10, 10, 11, 12], [10, 10, 10, 11, 12]);
  const second = candles([10, 10, 10, 11, 12], [10, 10, 10, 11, 30]);

  assert.equal(runBacktest(first, request).trades[0].entryTime, first[4].time);
  assert.equal(runBacktest(second, request).trades[0].entryTime, second[4].time);
  assert.notEqual(runBacktest(first, request).trades[0].entryPrice, runBacktest(second, request).trades[0].entryPrice);
});