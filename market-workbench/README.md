# Fieldnote Markets

An original, full-stack market research workspace with a candlestick chart, selectable display timezone, simulated server-sent candle updates, common technical indicators, statistical readouts, a strategy editor/backtester, and simulated paper trading.

Local development uses a synthetic feed by default. The Render demo uses Binance.US public USD spot quotes and candles; its intervals are limited to those Binance.US publishes. The app has no broker connection; its Paper page executes simulated market orders only. All implemented features are available without an in-app subscription or usage paywall. The chart uses Apache ECharts; keep its Apache-2.0 license and NOTICE with redistributions.

The chart offers 1s, 5s, 15s, 30s, 1m, 2m, 3m, 4m, 5m, 15m, 30m, 1h, 4h, and 1d simulator intervals. Binance.US live mode exposes 1m and higher intervals supported by that provider. Layouts compare one, two, or four independently selected markets with a shared interval and timezone. Overlays include SMA 9, SMA 21, EMA 20, 20-period Bollinger Bands (2 standard deviations), and Fibonacci retracements over the latest 100 bars. Readouts include Wilder RSI 14, Wilder ATR 14, 20-return realized volatility (not annualized), Bollinger %B, and an estimated OHLCV volume profile. The modulo-9 number study demonstrates digital-root cycles and is not a trading signal.

Use the Overview, Chart, Indicators, Strategy, Paper, and Studio pages to focus on different levels of analysis. Studio accepts a versioned JSON strategy definition with named SMA, EMA, RSI, ATR, Bollinger %B, close, and volume series, plus threshold/crossover rules. It does not execute arbitrary JavaScript. Navigation preserves the selected market, interval, indicator settings, strategy source, and chart stream.

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite serves the client and proxies `/api` requests to the local Express API on port `8787`.

## Production

```bash
npm ci
npm run build
PORT=3000 npm start
```

The Express process serves both the built frontend and API on the same origin. `Dockerfile` builds a deployable container; run it with `docker build -t fieldnote-markets .` and `docker run --rm -p 3000:3000 fieldnote-markets`.

For a no-cost demo deployment, connect this repository to Render using the root `render.yaml` Blueprint. Render assigns a free `onrender.com` subdomain; this is a provider subdomain, not a separately registered custom domain. Render's free web services sleep after 15 minutes without inbound traffic, have ephemeral storage, and are not intended for production. The demo's in-memory feed resets when the service restarts.

## Data and time model

Candles use Unix epoch seconds in UTC throughout the API, chart, and backtest. The selected IANA timezone is only used to format labels; it never shifts stored timestamps or changes strategy signals. This avoids fixed-offset errors around daylight-saving transitions. The demo markets are explicitly synthetic 24/7 instruments, so equity exchange calendars and session gaps are not represented. History is capped at 500 bars; at 1s this is only about eight minutes. The one-second interval is generated demo data, not a promise of real-time exchange data or an available provider's historical coverage.

Charts and backtests use the selected provider's normalized candles. The simulator updates every five seconds and fills skipped one-second bars in bounded batches; Binance.US live mode polls supported candles every five seconds and reports feed errors instead of falling back to simulated quotes. The volume profile assigns each bar's volume to its typical price, (high + low + close) / 3; it is an estimate, not trade-level volume-at-price. Exchange trading calendars are not modelled.

## API

- `GET /api/health`
- `GET /api/markets`
- `GET /api/candles?symbol=BTC-USD&interval=5m&limit=240` (intervals listed above, 1-500 bars)
- `GET /api/volume-profile?symbol=BTC-USD&interval=5m&limit=240&bins=24` (OHLCV typical-price estimate with point of control and 70% value area)
- `GET /api/stream?symbol=BTC-USD&interval=1s` (server-sent events; simulated update cadence is five seconds)
- `POST /api/backtests`
- `POST /api/strategy-backtests` (schema-validated JSON indicator conditions; close signals fill at the next bar open)
- `GET /api/paper/account` (process-local simulated cash, positions, P&amp;L, and recent fills)
- `POST /api/paper/orders` (simulated market buys/sells at the current synthetic quote; 10 bps fee)

Backtests are long-only, all-in moving-average crossovers. Signals are calculated from completed closes and execute at the following bar's open. Entry and exit fees are applied in basis points. Slippage, taxes, partial fills, exchange sessions, and broker execution are not modelled.