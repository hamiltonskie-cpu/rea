import express from "express";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { backtestRequestSchema, intervals, isSupportedTimeZone, paperOrderRequestSchema, simulatedUpdateIntervalMs, type Candle, type Interval, type Market } from "../shared/market.js";
import { calculateVolumeProfile } from "../shared/chartStudies.js";
import { strategyBacktestRequestSchema } from "../shared/strategyScript.js";
import { runBacktest, runStrategyBacktest } from "./backtest.js";
import { advanceCandle, getCandles, getMarkets, isKnownMarket } from "./marketData.js";
import { executePaperOrder, getPaperAccount } from "./paperTrading.js";
import { resolvePaperSession } from "./paperSession.js";
import { BINANCE_US_INTERVALS, BinanceUsMarketData } from "./binanceMarketData.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const paperSessionSecret = process.env.PAPER_SESSION_SECRET ?? randomSessionSecret();
const webRoot = resolve(fileURLToPath(new URL("../../dist", import.meta.url)));
const configuredMarketDataMode = process.env.MARKET_DATA_PROVIDER ?? (process.env.NODE_ENV === "production" ? "binance-us" : "simulated");
if (configuredMarketDataMode !== "simulated" && configuredMarketDataMode !== "binance-us") {
  throw new Error("MARKET_DATA_PROVIDER must be simulated or binance-us");
}
const marketDataProvider = configuredMarketDataMode === "binance-us" ? new BinanceUsMarketData() : null;
const supportedIntervals: readonly Interval[] = marketDataProvider ? BINANCE_US_INTERVALS : intervals;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", feed: configuredMarketDataMode, timestamp: Date.now() });
});

app.get("/api/markets", async (_request, response) => {
  try {
    response.json({
      markets: await loadMarkets(),
      feed: configuredMarketDataMode,
      supportedIntervals,
    });
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Market data unavailable"), feed: configuredMarketDataMode });
  }
});

app.get("/api/candles", async (request, response) => {
  const symbol = typeof request.query.symbol === "string" ? request.query.symbol : "BTC-USD";
  const interval = parseInterval(request.query.interval ?? "5m");
  const limitValue = typeof request.query.limit === "string" ? Number(request.query.limit) : 240;

  if (!interval) {
    response.status(400).json({ error: "Unsupported candle interval" });
    return;
  }
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) {
    response.status(400).json({ error: "Candle limit must be between 1 and 500" });
    return;
  }
  if (!isKnownMarket(symbol)) {
    response.status(404).json({ error: "Unknown market symbol" });
    return;
  }

  try {
    response.json({ symbol, interval, candles: await loadCandles(symbol, interval, limitValue) });
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Candle data unavailable"), feed: configuredMarketDataMode });
  }
});

app.get("/api/volume-profile", async (request, response) => {
  const symbol = typeof request.query.symbol === "string" ? request.query.symbol : "BTC-USD";
  const interval = parseInterval(request.query.interval ?? "5m");
  const limitValue = typeof request.query.limit === "string" ? Number(request.query.limit) : 240;
  const binCount = typeof request.query.bins === "string" ? Number(request.query.bins) : 24;

  if (!interval) {
    response.status(400).json({ error: "Unsupported candle interval" });
    return;
  }
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) {
    response.status(400).json({ error: "Candle limit must be between 1 and 500" });
    return;
  }
  if (!Number.isInteger(binCount) || binCount < 8 || binCount > 80) {
    response.status(400).json({ error: "Volume profile bins must be between 8 and 80" });
    return;
  }
  if (!isKnownMarket(symbol)) {
    response.status(404).json({ error: "Unknown market symbol" });
    return;
  }

  try {
    response.json({
      symbol,
      interval,
      ...calculateVolumeProfile(await loadCandles(symbol, interval, limitValue), binCount),
    });
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Volume profile data unavailable") });
  }
});

app.get("/api/stream", async (request, response) => {
  const symbol = typeof request.query.symbol === "string" ? request.query.symbol : "BTC-USD";
  const interval = parseInterval(request.query.interval ?? "5m");
  if (!interval || !isKnownMarket(symbol)) {
    response.status(400).json({ error: "Choose a supported market and interval" });
    return;
  }

  let initialCandles: Candle[];
  try {
    initialCandles = await loadCandles(symbol, interval, 1);
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Market stream unavailable") });
    return;
  }

  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  let lastSentTime = initialCandles.at(-1)?.time ?? 0;
  let sending = false;
  const send = async () => {
    if (sending || response.destroyed) return;
    sending = true;
    try {
      let pending: Candle[];
      if (marketDataProvider) {
        pending = await marketDataProvider.getCandleUpdates(symbol, interval, lastSentTime);
      } else {
        const latest = advanceCandle(symbol, interval);
        pending = getCandles(symbol, interval, 500).filter((candle) => candle.time > lastSentTime);
        if (pending.length === 0) pending.push(latest);
      }
      for (const candle of pending) {
        response.write(`event: candle\ndata: ${JSON.stringify(candle)}\n\n`);
        lastSentTime = Math.max(lastSentTime, candle.time);
      }
    } catch {
      if (!response.destroyed) response.write(`event: feed-error\ndata: {"error":"Market data temporarily unavailable"}\n\n`);
    } finally {
      sending = false;
    }
  };
  void send();
  const timer = setInterval(() => void send(), simulatedUpdateIntervalMs);
  request.on("close", () => clearInterval(timer));
});

app.post("/api/backtests", async (request, response) => {
  const parsed = backtestRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid backtest request" });
    return;
  }
  if (!isKnownMarket(parsed.data.symbol)) {
    response.status(404).json({ error: "Unknown market symbol" });
    return;
  }
  if (!isSupportedTimeZone(parsed.data.timezone)) {
    response.status(400).json({ error: "Choose a supported IANA timezone" });
    return;
  }

  try {
    const candles = await loadCandles(parsed.data.symbol, parsed.data.interval, 500);
    response.json(runBacktest(candles, parsed.data));
  } catch (error) {
    response.status(marketDataProvider ? 502 : 400).json({ error: errorMessage(error, "Backtest failed") });
  }
});

app.post("/api/strategy-backtests", async (request, response) => {
  const parsed = strategyBacktestRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid strategy script" });
    return;
  }
  if (!isKnownMarket(parsed.data.symbol)) {
    response.status(404).json({ error: "Unknown market symbol" });
    return;
  }

  try {
    const candles = await loadCandles(parsed.data.symbol, parsed.data.interval, 500);
    response.json(runStrategyBacktest(candles, parsed.data));
  } catch (error) {
    response.status(marketDataProvider ? 502 : 400).json({ error: errorMessage(error, "Strategy backtest failed") });
  }
});

app.get("/api/paper/account", async (_request, response) => {
  const sessionId = getPaperSessionId(_request, response);
  try {
    response.json(getPaperAccount(sessionId, await loadMarkets()));
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Paper quote data unavailable") });
  }
});

app.post("/api/paper/orders", async (request, response) => {
  const parsed = paperOrderRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid paper order" });
    return;
  }

  let markets: Market[];
  try {
    markets = await loadMarkets();
  } catch (error) {
    response.status(502).json({ error: errorMessage(error, "Paper quote data unavailable") });
    return;
  }
  const market = markets.find(({ symbol }) => symbol === parsed.data.symbol);
  if (!market || !isKnownMarket(parsed.data.symbol)) {
    response.status(404).json({ error: "Unknown market symbol" });
    return;
  }

  try {
    const sessionId = getPaperSessionId(request, response);
    const order = executePaperOrder(sessionId, parsed.data, market.price);
    response.status(201).json({ order, account: getPaperAccount(sessionId, markets) });
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message : "Paper order rejected" });
  }
});

if (existsSync(resolve(webRoot, "index.html"))) {
  app.use(express.static(webRoot, { index: false, maxAge: "1h" }));
  app.get(/.*/, (_request, response) => response.sendFile(resolve(webRoot, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.info(`Market Workbench API listening on ${port}`);
});

function parseInterval(value: unknown): Interval | null {
  return typeof value === "string" && supportedIntervals.some((interval) => interval === value)
    ? (value as Interval)
    : null;
}

async function loadMarkets(): Promise<Market[]> {
  return marketDataProvider ? marketDataProvider.getMarkets() : getMarkets();
}

async function loadCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  return marketDataProvider
    ? marketDataProvider.getCandles(symbol, interval, limit)
    : getCandles(symbol, interval, limit);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getPaperSessionId(request: express.Request, response: express.Response): string {
  const session = resolvePaperSession(
    request.headers.cookie,
    paperSessionSecret,
    process.env.NODE_ENV === "production",
  );
  if (session.setCookie) response.append("Set-Cookie", session.setCookie);
  return session.sessionId;
}

function randomSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}