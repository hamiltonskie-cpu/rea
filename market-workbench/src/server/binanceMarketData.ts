import { z } from "zod";
import { candleSchema, type Candle, type Interval, type Market } from "../shared/market.js";

const definitions = [
  { symbol: "BTC-USD", exchangeSymbol: "BTCUSD", name: "Bitcoin / U.S. Dollar" },
  { symbol: "ETH-USD", exchangeSymbol: "ETHUSD", name: "Ether / U.S. Dollar" },
  { symbol: "SOL-USD", exchangeSymbol: "SOLUSD", name: "Solana / U.S. Dollar" },
  { symbol: "XRP-USD", exchangeSymbol: "XRPUSD", name: "XRP / U.S. Dollar" },
  { symbol: "DOGE-USD", exchangeSymbol: "DOGEUSD", name: "Dogecoin / U.S. Dollar" },
] as const;

export const BINANCE_US_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const satisfies readonly Interval[];

const tickerSchema = z.array(z.object({
  symbol: z.string(),
  lastPrice: z.coerce.number().finite().positive(),
  priceChange: z.coerce.number().finite(),
  priceChangePercent: z.coerce.number().finite(),
}));

const klineSchema = z.tuple([
  z.coerce.number().int().nonnegative(),
  z.coerce.number().finite().positive(),
  z.coerce.number().finite().positive(),
  z.coerce.number().finite().positive(),
  z.coerce.number().finite().positive(),
  z.coerce.number().finite().nonnegative(),
]).rest(z.unknown());

export class BinanceUsMarketData {
  #fetch: typeof fetch;
  #baseUrl: string;
  #marketCache: Market[] | null = null;
  #marketCacheExpiresAt = 0;
  #candleCache = new Map<string, Candle[]>();

  constructor(fetcher: typeof fetch = fetch, baseUrl = "https://api.binance.us") {
    this.#fetch = fetcher;
    this.#baseUrl = baseUrl;
  }

  isKnownMarket(symbol: string): boolean {
    return definitions.some((market) => market.symbol === symbol);
  }

  async getMarkets(): Promise<Market[]> {
    if (this.#marketCache && Date.now() < this.#marketCacheExpiresAt) return this.#marketCache.map((market) => ({ ...market }));

    const url = new URL("/api/v3/ticker/24hr", this.#baseUrl);
    url.searchParams.set("symbols", JSON.stringify(definitions.map(({ exchangeSymbol }) => exchangeSymbol)));
    const tickers = tickerSchema.safeParse(await this.#getJson(url));
    if (!tickers.success) throw new Error("Binance.US returned an invalid ticker response");
    const tickerBySymbol = new Map(tickers.data.map((ticker) => [ticker.symbol, ticker]));

    this.#marketCache = definitions.map((definition) => {
      const ticker = tickerBySymbol.get(definition.exchangeSymbol);
      if (!ticker) throw new Error(`Binance.US omitted ${definition.exchangeSymbol}`);
      return {
        symbol: definition.symbol,
        name: definition.name,
        venue: "BINANCE.US",
        quoteAsset: "USD",
        price: ticker.lastPrice,
        change: ticker.priceChange,
        changePercent: ticker.priceChangePercent,
      };
    });
    this.#marketCacheExpiresAt = Date.now() + 4_000;
    return this.#marketCache.map((market) => ({ ...market }));
  }

  async getCandles(symbol: string, interval: Interval, limit = 240): Promise<Candle[]> {
    const definition = this.#definition(symbol);
    this.#assertInterval(interval);
    const candles = await this.#getKlines(definition.exchangeSymbol, interval, Math.min(500, limit));
    this.#candleCache.set(`${symbol}:${interval}`, candles);
    return candles.slice(-limit);
  }

  async getCandleUpdates(symbol: string, interval: Interval, afterTime: number): Promise<Candle[]> {
    const definition = this.#definition(symbol);
    this.#assertInterval(interval);
    const url = this.#klinesUrl(definition.exchangeSymbol, interval, 500);
    url.searchParams.set("startTime", String(afterTime * 1_000));
    const candles = await this.#parseKlines(await this.#getJson(url));
    if (candles.length === 0) return [];

    const key = `${symbol}:${interval}`;
    const cached = this.#candleCache.get(key) ?? [];
    for (const candle of candles) {
      const last = cached.at(-1);
      if (!last || candle.time > last.time) cached.push(candle);
      else if (candle.time === last.time) cached[cached.length - 1] = candle;
    }
    if (cached.length > 500) cached.splice(0, cached.length - 500);
    this.#candleCache.set(key, cached);

    const newCandles = candles.filter((candle) => candle.time > afterTime);
    return newCandles.length > 0 ? newCandles : [candles[candles.length - 1]];
  }

  #definition(symbol: string) {
    const definition = definitions.find((market) => market.symbol === symbol);
    if (!definition) throw new Error("Unknown market symbol");
    return definition;
  }

  #assertInterval(interval: Interval): void {
    if (!BINANCE_US_INTERVALS.includes(interval as (typeof BINANCE_US_INTERVALS)[number])) {
      throw new Error(`Binance.US does not support the ${interval} interval`);
    }
  }

  #klinesUrl(symbol: string, interval: Interval, limit: number): URL {
    const url = new URL("/api/v3/klines", this.#baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(limit));
    return url;
  }

  async #getKlines(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    return this.#parseKlines(await this.#getJson(this.#klinesUrl(symbol, interval, limit)));
  }

  async #parseKlines(value: unknown): Promise<Candle[]> {
    if (!Array.isArray(value)) throw new Error("Binance.US returned an invalid candle response");
    return value.map((row) => {
      const parsed = klineSchema.safeParse(row);
      if (!parsed.success) throw new Error("Binance.US returned an invalid candle row");
      const [timeMilliseconds, open, high, low, close, volume] = parsed.data;
      const candle = candleSchema.safeParse({
        time: Math.floor(timeMilliseconds / 1_000),
        open,
        high,
        low,
        close,
        volume,
      });
      if (!candle.success) throw new Error("Binance.US returned invalid OHLCV values");
      return candle.data;
    });
  }

  async #getJson(url: URL): Promise<unknown> {
    const response = await this.#fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Binance.US data request failed (${response.status})`);
    return response.json();
  }
}