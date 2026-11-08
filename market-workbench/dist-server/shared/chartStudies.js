export const FIBONACCI_RETRACEMENTS = [
    { ratio: 0, label: "Fib 0%" },
    { ratio: 0.236, label: "Fib 23.6%" },
    { ratio: 0.382, label: "Fib 38.2%" },
    { ratio: 0.5, label: "Fib 50%" },
    { ratio: 0.618, label: "Fib 61.8%" },
    { ratio: 0.786, label: "Fib 78.6%" },
    { ratio: 1, label: "Fib 100%" },
];
export function fibonacciRetracementLevels(candles, lookback = 100) {
    if (!Number.isInteger(lookback) || lookback < 1) {
        throw new RangeError("Fibonacci lookback must be a positive integer");
    }
    const recentCandles = candles.slice(-lookback);
    if (recentCandles.length === 0)
        return [];
    const high = Math.max(...recentCandles.map(({ high: value }) => value));
    const low = Math.min(...recentCandles.map(({ low: value }) => value));
    if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low)
        return [];
    return FIBONACCI_RETRACEMENTS.map(({ ratio, label }) => ({
        ratio,
        label,
        price: high - (high - low) * ratio,
    }));
}
export function calculateVolumeProfile(candles, binCount = 24, valueAreaPercent = 0.7) {
    if (!Number.isInteger(binCount) || binCount < 1 || binCount > 100) {
        throw new RangeError("Volume profile bins must be an integer from 1 to 100");
    }
    if (!Number.isFinite(valueAreaPercent) || valueAreaPercent <= 0 || valueAreaPercent > 1) {
        throw new RangeError("Value area must be greater than 0 and at most 1");
    }
    if (candles.some(({ high, low, close, volume }) => ![high, low, close, volume].every(Number.isFinite) || high < low || volume < 0)) {
        throw new RangeError("Volume profile requires finite OHLCV values and non-negative volume");
    }
    if (candles.length === 0) {
        return { bins: [], totalVolume: 0, pointOfControl: null, valueAreaLow: null, valueAreaHigh: null };
    }
    const low = Math.min(...candles.map(({ low: value }) => value));
    const high = Math.max(...candles.map(({ high: value }) => value));
    const totalVolume = candles.reduce((total, candle) => total + candle.volume, 0);
    if (high === low) {
        const bin = {
            low,
            high,
            midpoint: low,
            volume: totalVolume,
            relativeVolume: totalVolume > 0 ? 1 : 0,
            inValueArea: totalVolume > 0,
        };
        return {
            bins: [bin],
            totalVolume,
            pointOfControl: totalVolume > 0 ? low : null,
            valueAreaLow: totalVolume > 0 ? low : null,
            valueAreaHigh: totalVolume > 0 ? high : null,
        };
    }
    const width = (high - low) / binCount;
    const volumes = Array.from({ length: binCount }, () => 0);
    for (const candle of candles) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        const index = Math.min(binCount - 1, Math.floor((typicalPrice - low) / width));
        volumes[index] = (volumes[index] ?? 0) + candle.volume;
    }
    const totalBinnedVolume = volumes.reduce((total, volume) => total + volume, 0);
    if (totalBinnedVolume === 0) {
        return {
            bins: volumes.map((_, index) => makeVolumeProfileBin(low, high, width, index, 0, 0, false)),
            totalVolume: 0,
            pointOfControl: null,
            valueAreaLow: null,
            valueAreaHigh: null,
        };
    }
    let pointOfControlIndex = 0;
    for (let index = 1; index < volumes.length; index += 1) {
        if ((volumes[index] ?? 0) > (volumes[pointOfControlIndex] ?? 0))
            pointOfControlIndex = index;
    }
    let lowerIndex = pointOfControlIndex;
    let upperIndex = pointOfControlIndex;
    let valueAreaVolume = volumes[pointOfControlIndex] ?? 0;
    const targetVolume = totalBinnedVolume * valueAreaPercent;
    while (valueAreaVolume < targetVolume) {
        const nextLowerVolume = lowerIndex > 0 ? volumes[lowerIndex - 1] ?? -1 : -1;
        const nextUpperVolume = upperIndex < volumes.length - 1 ? volumes[upperIndex + 1] ?? -1 : -1;
        if (nextLowerVolume < 0 && nextUpperVolume < 0)
            break;
        if (nextLowerVolume >= nextUpperVolume) {
            lowerIndex -= 1;
            valueAreaVolume += nextLowerVolume;
        }
        else {
            upperIndex += 1;
            valueAreaVolume += nextUpperVolume;
        }
    }
    const bins = volumes.map((volume, index) => makeVolumeProfileBin(low, high, width, index, volume, Math.max(...volumes), index >= lowerIndex && index <= upperIndex));
    return {
        bins,
        totalVolume: totalBinnedVolume,
        pointOfControl: bins[pointOfControlIndex]?.midpoint ?? null,
        valueAreaLow: bins[lowerIndex]?.low ?? null,
        valueAreaHigh: bins[upperIndex]?.high ?? null,
    };
}
function makeVolumeProfileBin(low, high, width, index, volume, maximumVolume, inValueArea) {
    const binLow = low + index * width;
    const binHigh = index === 0 && high === low ? high : low + (index + 1) * width;
    return {
        low: binLow,
        high: binHigh,
        midpoint: (binLow + binHigh) / 2,
        volume,
        relativeVolume: maximumVolume > 0 ? volume / maximumVolume : 0,
        inValueArea,
    };
}
export function digitalRoot(value) {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError("Digital root requires a safe integer");
    }
    const absoluteValue = Math.abs(value);
    return absoluteValue === 0 ? 0 : ((absoluteValue - 1) % 9) + 1;
}
export const DOUBLING_DIGITAL_ROOT_CYCLE = [1, 2, 4, 8, 7, 5];
export const MULTIPLES_OF_THREE_DIGITAL_ROOT_CYCLE = [3, 6, 9];
