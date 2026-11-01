import { isSupportedTimeZone } from "../shared/market.js";
export function runBacktest(candles, request) {
    if (candles.length < request.slowPeriod + 1) {
        throw new Error("Not enough candles for the selected slow period");
    }
    if (request.fastPeriod >= request.slowPeriod) {
        throw new Error("Fast period must be smaller than slow period");
    }
    if (!isSupportedTimeZone(request.timezone)) {
        throw new Error("Unsupported IANA timezone");
    }
    for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index];
        if (!Number.isFinite(candle.time) ||
            !Number.isFinite(candle.open) ||
            !Number.isFinite(candle.high) ||
            !Number.isFinite(candle.low) ||
            !Number.isFinite(candle.close) ||
            candle.open <= 0 ||
            candle.high < Math.max(candle.open, candle.close) ||
            candle.low > Math.min(candle.open, candle.close) ||
            (index > 0 && candle.time <= candles[index - 1].time)) {
            throw new Error("Candles must have valid prices and strictly increasing UTC timestamps");
        }
    }
    const feeRate = request.feeBps / 10_000;
    const trades = [];
    let cash = request.startingBalance;
    let position;
    let pendingLong = false;
    let peakEquity = cash;
    let maxDrawdownPercent = 0;
    for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index];
        if (pendingLong && !position) {
            const shares = cash / (candle.open * (1 + feeRate));
            const grossCost = shares * candle.open;
            const entryFee = grossCost * feeRate;
            cash -= grossCost + entryFee;
            position = {
                shares,
                entryPrice: candle.open,
                entryTime: candle.time,
                entryCost: grossCost + entryFee,
            };
        }
        else if (!pendingLong && position) {
            const grossProceeds = position.shares * candle.open;
            const exitFee = grossProceeds * feeRate;
            cash += grossProceeds - exitFee;
            trades.push(createTrade(position, candle.time, candle.open, grossProceeds - exitFee));
            position = undefined;
        }
        const equity = cash + (position ? position.shares * candle.close : 0);
        peakEquity = Math.max(peakEquity, equity);
        maxDrawdownPercent = Math.max(maxDrawdownPercent, ((peakEquity - equity) / peakEquity) * 100);
        if (index >= request.slowPeriod - 1 && index < candles.length - 1) {
            const fastAverage = averageClose(candles, index - request.fastPeriod + 1, index);
            const slowAverage = averageClose(candles, index - request.slowPeriod + 1, index);
            pendingLong = fastAverage > slowAverage;
        }
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
function averageClose(candles, from, through) {
    let total = 0;
    for (let index = from; index <= through; index += 1)
        total += candles[index].close;
    return total / (through - from + 1);
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
