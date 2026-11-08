import assert from "node:assert/strict";
import test from "node:test";
import { BINANCE_US_INTERVALS, BinanceUsMarketData } from "./binanceMarketData.js";

const tickers = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD"].map((symbol) => ({
  symbol,
  lastPrice: "100.5",
  priceChange: "1.5",
  priceChangePercent: "1.51",
}));

const klines = [
  [1_700_000_000_000, "100", "105", "99", "104", "10", 1_700_000_059_999, "0", 1, "0", "0", "0"],
  [1_700_000_060_000, "104", "106", "103", "105", "12", 1_700_000_119_999, "0", 1, "0", "0", "0"],
];

function provider(fetcher?: typeof fetch): BinanceUsMarketData {
  return new BinanceUsMarketData(fetcher ?? (async (input) => {
    const url = new URL(String(input));
    return Response.json(url.pathname.endsWith("ticker/24hr") ? tickers : klines);
  }), "https://binance.test");
}

test("maps public USD tickers into the app's market contract", async () => {
  const markets = await provider().getMarkets();

  assert.equal(markets.length, 5);
  assert.equal(markets[0]?.symbol, "BTC-USD");
  assert.equal(markets[0]?.quoteAsset, "USD");
  assert.equal(markets[0]?.venue, "BINANCE.US");
  assert.equal(markets[0]?.price, 100.5);
});

test("normalizes public klines to UTC seconds and OHLCV values", async () => {
  const candles = await provider().getCandles("BTC-USD", "1m", 2);

  assert.equal(candles.length, 2);
  assert.equal(candles[0]?.time, 1_700_000_000);
  assert.equal(candles[0]?.close, 104);
  assert.equal(candles[1]?.volume, 12);
});

test("restricts live intervals to those published by Binance.US", async () => {
  assert.deepEqual(BINANCE_US_INTERVALS, ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
  await assert.rejects(() => provider().getCandles("BTC-USD", "5s", 10), /does not support/);
});

test("rejects malformed public candle rows", async () => {
  const badProvider = provider(async () => Response.json([[1_700_000_000_000, "100", "98", "99", "97", "1"]]));
  await assert.rejects(() => badProvider.getCandles("BTC-USD", "1m", 2), /invalid OHLCV/);
});