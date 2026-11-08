import { candleSchema, isSupportedTimeZone } from "../shared/market.js";
import { averageTrueRangeSeries, bollingerPercentBSeries, exponentialMovingAverage, relativeStrengthIndexSeries, simpleMovingAverage, } from "../shared/indicators.js";
export function runBacktest(candles, request) {
    if (request.fastPeriod >= request.slowPeriod) {
        throw new Error("Fast period must be smaller than slow period");
    }
    if (candles.length < request.slowPeriod + 1)
        throw new Error("Not enough candles for the selected slow period");
    validateInputs(candles, request.timezone);
    const fastValues = pointsByTime(candles, simpleMovingAverage(candles, request.fastPeriod));
    const slowValues = pointsByTime(candles, simpleMovingAverage(candles, request.slowPeriod));
    return simulate(candles, request, (index, positionOpen) => {
        const fast = fastValues[index];
        const slow = slowValues[index];
        if (fast == null || slow == null)
            return null;
        if (positionOpen)
            return fast <= slow ? "exit" : null;
        return fast > slow ? "enter" : null;
    });
}
export function runStrategyBacktest(candles, request) {
    validateInputs(candles, request.timezone);
    const longestPeriod = Math.max(0, ...Object.values(request.script.indicators).flatMap((definition) => "period" in definition ? [definition.period] : []));
    if (candles.length < Math.max(2, longestPeriod + 1)) {
        throw new Error("Not enough candles for the indicators in this script");
    }
    const values = buildIndicatorValues(candles, request.script.indicators);
    const result = simulate(candles, {
        symbol: request.symbol,
        interval: request.interval,
        timezone: request.timezone,
        startingBalance: request.script.startingBalance,
        feeBps: request.script.feeBps,
    }, (index, positionOpen) => {
        if (!conditionMatches(positionOpen ? request.script.exit : request.script.entry, values, index))
            return null;
        return positionOpen ? "exit" : "enter";
    });
    return {
        ...result,
        strategyName: request.script.name,
        indicatorValues: Object.fromEntries(Object.entries(values).map(([name, series]) => [name, series.at(-1) ?? null])),
    };
}
function simulate(candles, request, signalAtClose) {
    const feeRate = request.feeBps / 10_000;
    const trades = [];
    let cash = request.startingBalance;
    let position;
    let pendingAction = null;
    let peakEquity = cash;
    let maxDrawdownPercent = 0;
    for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index];
        if (pendingAction === "enter" && !position) {
            const shares = cash / (candle.open * (1 + feeRate));
            const grossCost = shares * candle.open;
            const entryFee = grossCost * feeRate;
            cash -= grossCost + entryFee;
            position = { shares, entryPrice: candle.open, entryTime: candle.time, entryCost: grossCost + entryFee };
        }
        else if (pendingAction === "exit" && position) {
            const grossProceeds = position.shares * candle.open;
            const exitFee = grossProceeds * feeRate;
            cash += grossProceeds - exitFee;
            trades.push(createTrade(position, candle.time, candle.open, grossProceeds - exitFee));
            position = undefined;
        }
        const equity = cash + (position ? position.shares * candle.close : 0);
        peakEquity = Math.max(peakEquity, equity);
        maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peakEquity - equity) / peakEquity) * 100);
        pendingAction = index < candles.length - 1 ? signalAtClose(index, Boolean(position)) : null;
    }
    const lastCandle = candles[candles.length - 1];
    if (position) {
        const grossProceeds = position.shares * lastCandle.close;
        const exitFee = grossProceeds * feeRate;
        cash += grossProceeds - exitFee;
        trades.push(createTrade(position, lastCandle.time, lastCandle.close, grossProceeds - exitFee));
    }
    peakEquity = Math.max(peakEquity, cash);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peakEquity - cash) / peakEquity) * 100);
    const wins = trades.filter((trade) => trade.pnl > 0).length;
    return {
        symbol: request.symbol,
        interval: request.interval,
        timezone: request.timezone,
        bars: candles.length,
        startingBalance: request.startingBalance,
        endingBalance: cash,
        netReturnPercent: ((cash / request.startingBalance) - 1) * 100,
        maxDrawdownPercent,
        winRatePercent: trades.length === 0 ? 0 : (wins / trades.length) * 100,
        feeBps: request.feeBps,
        trades,
    };
}
function validateInputs(candles, timezone) {
    if (!isSupportedTimeZone(timezone))
        throw new Error("Unsupported IANA timezone");
    for (let index = 0; index < candles.length; index += 1) {
        if (!candleSchema.safeParse(candles[index]).success || (index > 0 && candles[index].time <= candles[index - 1].time)) {
            throw new Error("Candles must have valid prices and strictly increasing UTC timestamps");
        }
    }
}
function buildIndicatorValues(candles, definitions) {
    return Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
        if (definition.kind === "close")
            return [name, candles.map(({ close }) => close)];
        if (definition.kind === "volume")
            return [name, candles.map(({ volume }) => volume)];
        const points = definition.kind === "sma"
            ? simpleMovingAverage(candles, definition.period)
            : definition.kind === "ema"
                ? exponentialMovingAverage(candles, definition.period)
                : definition.kind === "rsi"
                    ? relativeStrengthIndexSeries(candles, definition.period)
                    : definition.kind === "atr"
                        ? averageTrueRangeSeries(candles, definition.period)
                        : bollingerPercentBSeries(candles, definition.period);
        return [name, pointsByTime(candles, points)];
    }));
}
function pointsByTime(candles, points) {
    const values = new Map(points.map(({ time, value }) => [time, value]));
    return candles.map(({ time }) => values.get(time) ?? null);
}
function conditionMatches(condition, indicatorValues, index) {
    const left = resolveOperand(condition.left, indicatorValues, index);
    const right = resolveOperand(condition.right, indicatorValues, index);
    if (left == null || right == null)
        return false;
    if (condition.operator === "above")
        return left > right;
    if (condition.operator === "below")
        return left < right;
    if (index === 0)
        return false;
    const previousLeft = resolveOperand(condition.left, indicatorValues, index - 1);
    const previousRight = resolveOperand(condition.right, indicatorValues, index - 1);
    if (previousLeft == null || previousRight == null)
        return false;
    return condition.operator === "crossesAbove"
        ? previousLeft <= previousRight && left > right
        : previousLeft >= previousRight && left < right;
}
function resolveOperand(operand, indicatorValues, index) {
    if ("value" in operand)
        return operand.value;
    return indicatorValues[operand.indicator]?.[index] ?? null;
}
function createTrade(position, exitTime, exitPrice, netProceeds) {
    const pnl = netProceeds - position.entryCost;
    return {
        entryTime: position.entryTime,
        exitTime,
        entryPrice: position.entryPrice,
        exitPrice,
        pnl,
        returnPercent: (pnl / position.entryCost) * 100,
    };
}
