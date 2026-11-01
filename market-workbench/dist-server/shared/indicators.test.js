import assert from "node:assert/strict";
import test from "node:test";
import { bollingerBands, calculateIndicatorSnapshot, exponentialMovingAverage, simpleMovingAverage, } from "./indicators.js";
function candles(closes) {
    return closes.map((close, index) => ({
        time: 1_700_000_000 + index,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1,
    }));
}
test("calculates SMA and seeded EMA values over closed prices", () => {
    const bars = candles([1, 2, 3, 4]);
    assert.deepEqual(simpleMovingAverage(bars, 3), [
        { time: bars[2].time, value: 2 },
        { time: bars[3].time, value: 3 },
    ]);
    assert.deepEqual(exponentialMovingAverage(bars, 3), [
        { time: bars[2].time, value: 2 },
        { time: bars[3].time, value: 3 },
    ]);
});
test("returns stable statistical readings for a flat price series", () => {
    const snapshot = calculateIndicatorSnapshot(candles(Array.from({ length: 25 }, () => 100)));
    assert.equal(snapshot.rsi14, 50);
    assert.equal(snapshot.atr14, 0);
    assert.equal(snapshot.realizedVolatility20, 0);
    assert.equal(snapshot.bollingerPercentB, 0.5);
    assert.deepEqual(bollingerBands(candles(Array.from({ length: 20 }, () => 100))).at(-1), {
        time: 1_700_000_019,
        upper: 100,
        middle: 100,
        lower: 100,
    });
});
test("reports RSI at the upper bound during uninterrupted gains", () => {
    const snapshot = calculateIndicatorSnapshot(candles(Array.from({ length: 15 }, (_, i) => i + 1)));
    assert.equal(snapshot.rsi14, 100);
});
test("leaves indicators unknown until enough bars are available", () => {
    const snapshot = calculateIndicatorSnapshot(candles([1, 2, 3]));
    assert.deepEqual(snapshot, {
        rsi14: null,
        atr14: null,
        realizedVolatility20: null,
        bollingerPercentB: null,
    });
});
