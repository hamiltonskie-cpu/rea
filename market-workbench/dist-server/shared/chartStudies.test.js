import assert from "node:assert/strict";
import test from "node:test";
import { digitalRoot, DOUBLING_DIGITAL_ROOT_CYCLE, calculateVolumeProfile, fibonacciRetracementLevels, MULTIPLES_OF_THREE_DIGITAL_ROOT_CYCLE, } from "./chartStudies.js";
test("calculates Fibonacci retracement prices from recent candle extremes", () => {
    const levels = fibonacciRetracementLevels([
        { high: 100, low: 50 },
        { high: 80, low: 60 },
    ]);
    assert.deepEqual(levels.map(({ label }) => label), [
        "Fib 0%",
        "Fib 23.6%",
        "Fib 38.2%",
        "Fib 50%",
        "Fib 61.8%",
        "Fib 78.6%",
        "Fib 100%",
    ]);
    assert.ok(Math.abs((levels[4]?.price ?? 0) - 69.1) < 1e-10);
});
test("limits Fibonacci extremes to the selected lookback", () => {
    const levels = fibonacciRetracementLevels([
        { high: 100, low: 50 },
        { high: 20, low: 15 },
    ], 1);
    assert.equal(levels[0]?.price, 20);
    assert.equal(levels[3]?.price, 17.5);
    assert.equal(levels[6]?.price, 15);
});
test("returns no Fibonacci levels for empty or flat data", () => {
    assert.deepEqual(fibonacciRetracementLevels([]), []);
    assert.deepEqual(fibonacciRetracementLevels([{ high: 10, low: 10 }]), []);
});
test("calculates decimal digital roots for integers", () => {
    assert.equal(digitalRoot(0), 0);
    assert.equal(digitalRoot(369), 9);
    assert.equal(digitalRoot(123), 6);
    assert.equal(digitalRoot(-12), 3);
    assert.throws(() => digitalRoot(1.5), RangeError);
});
test("exposes the modulo-nine doubling and multiples-of-three cycles", () => {
    assert.deepEqual(DOUBLING_DIGITAL_ROOT_CYCLE, [1, 2, 4, 8, 7, 5]);
    assert.deepEqual(MULTIPLES_OF_THREE_DIGITAL_ROOT_CYCLE, [3, 6, 9]);
});
test("bins OHLCV volume by typical price and expands the 70% value area from the POC", () => {
    const profile = calculateVolumeProfile([
        { low: 0, high: 0.9, close: 0.3, volume: 10 },
        { low: 1, high: 1.9, close: 1.3, volume: 30 },
        { low: 2, high: 2.9, close: 2.3, volume: 40 },
        { low: 3, high: 3.9, close: 3.3, volume: 20 },
    ], 4);
    assert.equal(profile.totalVolume, 100);
    assert.equal(profile.pointOfControl, profile.bins[2]?.midpoint);
    assert.equal(profile.bins[1]?.inValueArea, true);
    assert.equal(profile.bins[2]?.inValueArea, true);
    assert.equal(profile.valueAreaLow, profile.bins[1]?.low);
    assert.equal(profile.valueAreaHigh, profile.bins[2]?.high);
});
test("handles empty, flat-price, and zero-volume profiles", () => {
    assert.equal(calculateVolumeProfile([]).pointOfControl, null);
    assert.equal(calculateVolumeProfile([{ low: 5, high: 5, close: 5, volume: 4 }]).pointOfControl, 5);
    assert.equal(calculateVolumeProfile([{ low: 1, high: 2, close: 1.5, volume: 0 }]).pointOfControl, null);
});
test("rejects invalid volume-profile configuration and candle values", () => {
    assert.throws(() => calculateVolumeProfile([], 0), RangeError);
    assert.throws(() => calculateVolumeProfile([], 24, 0), RangeError);
    assert.throws(() => calculateVolumeProfile([{ low: 2, high: 1, close: 1.5, volume: 2 }]), RangeError);
});
