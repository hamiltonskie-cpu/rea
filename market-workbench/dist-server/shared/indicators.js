export function simpleMovingAverage(candles, period) {
    const points = [];
    let total = 0;
    for (let index = 0; index < candles.length; index += 1) {
        total += candles[index].close;
        if (index >= period)
            total -= candles[index - period].close;
        if (index >= period - 1) {
            points.push({ time: candles[index].time, value: total / period });
        }
    }
    return points;
}
export function exponentialMovingAverage(candles, period) {
    if (candles.length < period)
        return [];
    const points = [];
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
export function bollingerBands(candles, period = 20, deviations = 2) {
    const bands = [];
    for (let end = period - 1; end < candles.length; end += 1) {
        const start = end - period + 1;
        let total = 0;
        for (let index = start; index <= end; index += 1)
            total += candles[index].close;
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
export function calculateIndicatorSnapshot(candles) {
    return {
        rsi14: relativeStrengthIndexSeries(candles, 14).at(-1)?.value ?? null,
        atr14: averageTrueRangeSeries(candles, 14).at(-1)?.value ?? null,
        realizedVolatility20: calculateRealizedVolatility(candles, 20),
        bollingerPercentB: bollingerPercentBSeries(candles, 20).at(-1)?.value ?? null,
    };
}
export function relativeStrengthIndexSeries(candles, period) {
    if (candles.length <= period)
        return [];
    let gains = 0;
    let losses = 0;
    for (let index = 1; index <= period; index += 1) {
        const change = candles[index].close - candles[index - 1].close;
        gains += Math.max(change, 0);
        losses += Math.max(-change, 0);
    }
    let averageGain = gains / period;
    let averageLoss = losses / period;
    const points = [{ time: candles[period].time, value: rsiValue(averageGain, averageLoss) }];
    for (let index = period + 1; index < candles.length; index += 1) {
        const change = candles[index].close - candles[index - 1].close;
        averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
        averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
        points.push({ time: candles[index].time, value: rsiValue(averageGain, averageLoss) });
    }
    return points;
}
export function averageTrueRangeSeries(candles, period) {
    if (candles.length <= period)
        return [];
    let total = 0;
    for (let index = 1; index <= period; index += 1) {
        total += trueRange(candles[index], candles[index - 1].close);
    }
    let average = total / period;
    const points = [{ time: candles[period].time, value: average }];
    for (let index = period + 1; index < candles.length; index += 1) {
        average =
            (average * (period - 1) + trueRange(candles[index], candles[index - 1].close)) / period;
        points.push({ time: candles[index].time, value: average });
    }
    return points;
}
function trueRange(candle, previousClose) {
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
}
function calculateRealizedVolatility(candles, returnCount) {
    if (candles.length <= returnCount)
        return null;
    const first = candles.length - returnCount - 1;
    const returns = [];
    for (let index = first + 1; index < candles.length; index += 1) {
        returns.push(Math.log(candles[index].close / candles[index - 1].close));
    }
    const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
    const variance = returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance) * 100;
}
export function bollingerPercentBSeries(candles, period, deviations = 2) {
    return bollingerBands(candles, period, deviations).map((band, index) => {
        const width = band.upper - band.lower;
        return {
            time: band.time,
            value: width === 0 ? 0.5 : (candles[period - 1 + index].close - band.lower) / width,
        };
    });
}
function rsiValue(averageGain, averageLoss) {
    if (averageLoss === 0)
        return averageGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + averageGain / averageLoss);
}
