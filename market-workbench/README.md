# Fieldnote Markets

An original, full-stack market research workspace with a candlestick chart, selectable display timezone, simulated server-sent candle updates, common technical indicators, statistical readouts, and a moving-average crossover backtest.

The bundled feed is synthetic and for development/demo use only. It is not TradingView data, exchange data, investment advice, or an order-entry system. The app does not connect to a broker. The chart uses the open-source Lightweight Charts library; see the linked project for its Apache-2.0 license and keep its attribution visible.

The chart offers 1s, 5s, 15s, 30s, 1m, 5m, 15m, 30m, 1h, 4h, and 1d intervals. Overlays include SMA 9, SMA 21, EMA 20, and 20-period Bollinger Bands (2 standard deviations). Readouts include Wilder RSI 14, Wilder ATR 14, 20-return realized volatility (not annualized), and Bollinger %B. These are standard independently implemented indicators, not a reconstruction of TradingView's proprietary features.

Use the Overview, Chart, Indicators, and Strategy pages to focus on different levels of analysis. Navigation preserves the selected market, interval, indicator settings, strategy settings and chart stream; the chart stays mounted while its page is in the background so changing pages does not disconnect the feed.

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

## Data and time model

Candles use Unix epoch seconds in UTC throughout the API, chart, and backtest. The selected IANA timezone is only used to format labels; it never shifts stored timestamps or changes strategy signals. This avoids fixed-offset errors around daylight-saving transitions. The demo markets are explicitly synthetic 24/7 instruments, so equity exchange calendars and session gaps are not represented. History is capped at 500 bars; at 1s this is only about eight minutes. The one-second interval is generated demo data, not a promise of real-time exchange data or an available provider's historical coverage.

The chart and backtest read the same in-memory candle series. Live deployment with real quotes requires a licensed provider adapter to supply normalized OHLCV bars and a streaming feed. For exchange-traded instruments, that adapter must also supply the exchange's IANA timezone and session calendar.

## API

- `GET /api/health`
- `GET /api/markets`
- `GET /api/candles?symbol=BTC-USD&interval=5m&limit=240` (intervals listed above, 1-500 bars)
- `GET /api/stream?symbol=BTC-USD&interval=1s` (server-sent events; simulated update cadence is one second)
- `POST /api/backtests`

Backtests are long-only, all-in moving-average crossovers. Signals are calculated from completed closes and execute at the following bar's open. Entry and exit fees are applied in basis points. Slippage, taxes, partial fills, exchange sessions, and broker execution are not modelled.