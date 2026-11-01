import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { backtestRequestSchema, intervals, isSupportedTimeZone, type Interval } from "../shared/market.js";
import { runBacktest } from "./backtest.js";
import { advanceCandle, getCandles, getMarkets, isKnownMarket } from "./marketData.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const webRoot = resolve(fileURLToPath(new URL("../../dist", import.meta.url)));

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", feed: "simulated", timestamp: Date.now() });
});

app.get("/api/markets", (_request, response) => {
  response.json({ markets: getMarkets(), feed: "simulated" });
});

app.get("/api/candles", (request, response) => {
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

  response.json({ symbol, interval, candles: getCandles(symbol, interval, limitValue) });
});

app.get("/api/stream", (request, response) => {
  const symbol = typeof request.query.symbol === "string" ? request.query.symbol : "BTC-USD";
  const interval = parseInterval(request.query.interval ?? "5m");
  if (!interval || !isKnownMarket(symbol)) {
    response.status(400).json({ error: "Choose a supported market and interval" });
    return;
  }

  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  const send = () => {
    response.write(`event: candle\ndata: ${JSON.stringify(advanceCandle(symbol, interval))}\n\n`);
  };
  send();
  const timer = setInterval(send, 1_000);
  request.on("close", () => clearInterval(timer));
});

app.post("/api/backtests", (request, response) => {
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
    const candles = getCandles(parsed.data.symbol, parsed.data.interval, 500);
    response.json(runBacktest(candles, parsed.data));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Backtest failed" });
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
  return typeof value === "string" && intervals.some((interval) => interval === value)
    ? (value as Interval)
    : null;
}