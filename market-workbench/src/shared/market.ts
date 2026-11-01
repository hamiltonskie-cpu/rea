import { z } from "zod";

export const intervals = [
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
] as const;
export type Interval = (typeof intervals)[number];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Market {
  symbol: string;
  name: string;
  venue: string;
  price: number;
  change: number;
  changePercent: number;
}

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

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  returnPercent: number;
}

export interface BacktestResult {
  symbol: string;
  interval: Interval;
  timezone: string;
  bars: number;
  startingBalance: number;
  endingBalance: number;
  netReturnPercent: number;
  maxDrawdownPercent: number;
  winRatePercent: number;
  feeBps: number;
  trades: BacktestTrade[];
}

export function isSupportedTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}