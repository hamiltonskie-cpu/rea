import assert from "node:assert/strict";
import test from "node:test";
import { getCandles } from "./marketData.js";
import { candleSchema, intervals, simulatedUpdateIntervalMs } from "../shared/market.js";
test("advertises intraday intervals down to one second", () => {
    assert.deepEqual(intervals, [
        "1s",
        "5s",
        "15s",
        "30s",
        "1m",
        "2m",
        "3m",
        "4m",
        "5m",
        "15m",
        "30m",
        "1h",
        "4h",
        "1d",
    ]);
});
test("generates one-second candles at one-second UTC boundaries", () => {
    const candles = getCandles("XRP-USD", "1s", 5);
    assert.equal(candles.length, 5);
    for (let index = 1; index < candles.length; index += 1) {
        assert.equal(candles[index].time - candles[index - 1].time, 1);
    }
    assert.ok(candles.every((candle) => Number.isInteger(candle.time)));
});
test("generates each supported interval at its correct UTC duration", () => {
    const cases = [
        ["15s", 15],
        ["2m", 120],
        ["3m", 180],
        ["4m", 240],
    ];
    for (const [interval, duration] of cases) {
        const candles = getCandles("ETH-USD", interval, 4);
        for (let index = 1; index < candles.length; index += 1) {
            assert.equal(candles[index].time - candles[index - 1].time, duration);
        }
    }
});
test("uses a shared five-second update cadence and rejects malformed candles", () => {
    assert.equal(simulatedUpdateIntervalMs, 5_000);
    assert.equal(candleSchema.safeParse({ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 5 }).success, true);
    assert.equal(candleSchema.safeParse({ time: 1, open: 10, high: 10, low: 11, close: 11, volume: 5 }).success, false);
});
