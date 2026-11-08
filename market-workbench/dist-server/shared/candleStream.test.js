import assert from "node:assert/strict";
import test from "node:test";
import { consumeCandleStreamEvent } from "./candleStream.js";
const validCandle = JSON.stringify({
    time: 1_700_000_000,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 12,
});
test("a valid candle restores feed status after an invalid event", () => {
    const statuses = [];
    const candles = [];
    const onFeedStatus = (connected) => statuses.push(connected);
    const onCandle = (candle) => candles.push(candle.time);
    assert.equal(consumeCandleStreamEvent("{broken", onCandle, onFeedStatus), false);
    assert.equal(consumeCandleStreamEvent(validCandle, onCandle, onFeedStatus), true);
    assert.deepEqual(statuses, [false, true]);
    assert.deepEqual(candles, [1_700_000_000]);
});
test("invalid candle data is not delivered and leaves the feed offline", () => {
    const statuses = [];
    let delivered = false;
    const result = consumeCandleStreamEvent(JSON.stringify({ time: 1, open: 10, high: 9, low: 11, close: 10, volume: 1 }), () => { delivered = true; }, (connected) => statuses.push(connected));
    assert.equal(result, false);
    assert.equal(delivered, false);
    assert.deepEqual(statuses, [false]);
});
