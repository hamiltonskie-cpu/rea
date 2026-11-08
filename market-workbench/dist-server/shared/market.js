import { z } from "zod";
export const intervals = [
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
];
export const simulatedUpdateIntervalMs = 5_000;
export const candleSchema = z
    .object({
    time: z.number().int().nonnegative(),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().finite().nonnegative(),
})
    .refine((candle) => candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close), {
    message: "Candle high and low must contain its open and close",
});
export const candleBatchSchema = z.object({ candles: z.array(candleSchema) });
export const backtestRequestSchema = z
    .object({
    symbol: z.string().min(1).max(20),
    interval: z.enum(intervals),
    fastPeriod: z.number().int().min(2).max(100),
    slowPeriod: z.number().int().min(3).max(200),
    startingBalance: z.number().finite().min(100).max(1_000_000_000),
    feeBps: z.number().finite().min(0).max(100),
    timezone: z.string().min(1).max(100),
})
    .refine((value) => value.fastPeriod < value.slowPeriod, {
    message: "Fast period must be smaller than slow period",
    path: ["fastPeriod"],
});
export const paperOrderRequestSchema = z.object({
    symbol: z.string().min(1).max(20),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().finite().positive().max(1_000_000).refine((value) => Number.isSafeInteger(value * 100_000_000), "Quantity supports at most 8 decimal places"),
});
export function isSupportedTimeZone(timezone) {
    try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
        return true;
    }
    catch {
        return false;
    }
}
