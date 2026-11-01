import assert from "node:assert/strict";
import test from "node:test";
import { getCandles } from "./marketData.js";
import { intervals } from "../shared/market.js";
test("advertises intraday intervals down to one second", () => {
    assert.deepEqual(intervals, [
        "1s",
        "5s",
        "15s",
        "30s",
        "1m",
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
test("uses each selected interval's duration", () => {
    const candles = getCandles("ETH-USD", "15s", 4);
    for (let index = 1; index < candles.length; index += 1) {
        assert.equal(candles[index].time - candles[index - 1].time, 15);
    }
});
