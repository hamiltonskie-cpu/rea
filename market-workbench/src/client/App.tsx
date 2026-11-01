import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  FlaskConical,
  LineChart,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import MarketChart from "./MarketChart.js";
import type { IndicatorSnapshot } from "../shared/indicators.js";
import type { BacktestResult, Candle, Interval, Market } from "../shared/market.js";
import { intervals } from "../shared/market.js";

const timezoneOptions = [
  "UTC",
  "America/New_York",
  "Europe/London",
  "Europe/Zurich",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const pages = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Chart" },
  { id: "indicators", label: "Indicators" },
  { id: "strategy", label: "Strategy" },
] as const;
type PageId = (typeof pages)[number]["id"];

function activePageFromHash(): PageId {
  const page = window.location.hash.slice(1);
  return pages.some((entry) => entry.id === page) ? (page as PageId) : "overview";
}

export default function App() {
  const [page, setPage] = useState<PageId>(activePageFromHash);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [symbol, setSymbol] = useState("BTC-USD");
  const [interval, setInterval] = useState<Interval>("5m");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [search, setSearch] = useState("");
  const [fastPeriod, setFastPeriod] = useState(9);
  const [slowPeriod, setSlowPeriod] = useState(21);
  const [startingBalance, setStartingBalance] = useState(10_000);
  const [feeBps, setFeeBps] = useState(10);
  const [showFastAverage, setShowFastAverage] = useState(true);
  const [showSlowAverage, setShowSlowAverage] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [feedConnected, setFeedConnected] = useState(false);
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [indicatorSnapshot, setIndicatorSnapshot] = useState<IndicatorSnapshot | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const syncPage = () => setPage(activePageFromHash());
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/markets");
        if (!response.ok) return;
        const body = (await response.json()) as { markets: Market[] };
        if (active) setMarkets(body.markets);
      } catch {
        if (active) setFeedConnected(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedMarket = markets.find((market) => market.symbol === symbol);
  const filteredMarkets = markets.filter((market) =>
    `${market.symbol} ${market.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const price = lastCandle?.close ?? selectedMarket?.price ?? 0;
  const priceChange = lastCandle ? lastCandle.close - lastCandle.open : selectedMarket?.change ?? 0;
  const priceChangePercent = lastCandle
    ? (priceChange / lastCandle.open) * 100
    : selectedMarket?.changePercent ?? 0;

  async function runStrategy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setBacktestError("");
    setBacktest(null);
    try {
      const response = await fetch("/api/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          interval,
          fastPeriod,
          slowPeriod,
          startingBalance,
          feeBps,
          timezone,
        }),
      });
      const body = (await response.json()) as BacktestResult | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Backtest request failed");
      setBacktest(body as BacktestResult);
    } catch (error) {
      setBacktestError(error instanceof Error ? error.message : "Unable to run backtest");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Fieldnote Markets home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-copy"><strong>fieldnote</strong><small>MARKET DESK</small></span>
        </a>
        <div className="topbar-center">
          <span className="workspace-label">RESEARCH WORKSPACE</span>
          <span className="environment-chip"><span /> SIMULATED FEED</span>
        </div>
        <label className="timezone-control">
          <Clock3 size={15} aria-hidden="true" />
          <span className="sr-only">Display timezone</span>
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {!timezoneOptions.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {timezoneOptions.map((zone) => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
      </header>

      <nav className="page-nav" aria-label="Analysis pages">
        {pages.map(({ id, label }) => (
          <a
            aria-current={page === id ? "page" : undefined}
            className={page === id ? "active" : ""}
            href={`#${id}`}
            key={id}
          >
            {label}
          </a>
        ))}
        <span className="page-nav-context">{symbol} · {interval} · shared live session</span>
      </nav>

      <main className="workspace" data-page={page} id="market">
        <aside className="watchlist-pane" aria-label="Market watchlist">
          <div className="pane-heading">
            <div><span className="eyebrow">MARKETS</span><h1>Watchlist</h1></div>
            <button className="icon-button muted-icon" type="button" title="Watchlist filters" aria-label="Watchlist filters">
              <SlidersHorizontal size={17} />
            </button>
          </div>
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a market" aria-label="Find a market" />
            <kbd>/</kbd>
          </label>
          <div className="watchlist-columns"><span>ASSET</span><span>LAST / CHANGE</span></div>
          <div className="market-list">
            {filteredMarkets.map((market) => {
              const isPositive = market.change >= 0;
              return (
                <button
                  className={`market-row${symbol === market.symbol ? " selected" : ""}`}
                  key={market.symbol}
                  onClick={() => { setSymbol(market.symbol); setLastCandle(null); setIndicatorSnapshot(null); setBacktest(null); }}
                  type="button"
                  aria-pressed={symbol === market.symbol}
                >
                  <span className={`coin-mark coin-${market.symbol.split("-")[0].toLowerCase()}`}>{market.symbol.slice(0, 1)}</span>
                  <span className="market-identity"><strong>{market.symbol}</strong><small>{market.name.split(" /")[0]}</small></span>
                  <span className="market-quote"><strong>{formatPrice(market.price, market.symbol)}</strong><small className={isPositive ? "positive-text" : "negative-text"}>{formatPercent(market.changePercent)}</small></span>
                </button>
              );
            })}
            {filteredMarkets.length === 0 && <p className="empty-search">No matching markets</p>}
          </div>
          <div className="watchlist-note"><span className="pulse-dot" /> 24/7 synthetic market session</div>
          <div className="watchlist-bottom">
            <div className="feed-label"><span className={`feed-indicator${feedConnected ? " connected" : ""}`} />Feed connection<strong>{feedConnected ? "Streaming" : "Connecting"}</strong></div>
            <button className="side-link" type="button" onClick={() => window.location.reload()}><Activity size={16} /> Refresh workspace</button>
          </div>
        </aside>

        <section
          aria-hidden={page === "strategy"}
          className={`chart-workspace${page === "strategy" ? " page-background" : ""}`}
          aria-label="Market chart and analysis"
          inert={page === "strategy"}
        >
          <div className="instrument-header">
            <div className="instrument-title">
              <div className="instrument-symbol">{symbol.replace("-", " / ")} <span className="market-status">SPOT</span></div>
              <div className="instrument-name">{selectedMarket?.name ?? "Digital asset"} <span>· {selectedMarket?.venue ?? "SIM-CRYPTO"}</span></div>
            </div>
            <div className="instrument-price-block">
              <strong>{formatPrice(price, symbol)}</strong>
              <span className={priceChange >= 0 ? "positive-text" : "negative-text"}>
                {priceChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {formatPrice(Math.abs(priceChange), symbol)} ({formatPercent(priceChangePercent)})
              </span>
            </div>
          </div>

          <div className="chart-toolbar">
            <div className="interval-switch" role="group" aria-label="Chart interval">
              {intervals.map((value) => (
                <button key={value} className={interval === value ? "active" : ""} onClick={() => { setInterval(value); setLastCandle(null); setIndicatorSnapshot(null); setBacktest(null); }} type="button" aria-pressed={interval === value}>{value}</button>
              ))}
            </div>
            <span className="toolbar-divider" />
            <label className="indicator-toggle"><input type="checkbox" checked={showFastAverage} onChange={(event) => setShowFastAverage(event.target.checked)} /><span className="indicator-dot fast" />SMA 9</label>
            <label className="indicator-toggle"><input type="checkbox" checked={showSlowAverage} onChange={(event) => setShowSlowAverage(event.target.checked)} /><span className="indicator-dot slow" />SMA 21</label>
            <label className="indicator-toggle"><input type="checkbox" checked={showEma} onChange={(event) => setShowEma(event.target.checked)} /><span className="indicator-dot ema" />EMA 20</label>
            <label className="indicator-toggle"><input type="checkbox" checked={showBollinger} onChange={(event) => setShowBollinger(event.target.checked)} /><span className="indicator-dot bands" />BB 20</label>
            <div className="chart-toolbar-spacer" />
            <span className="chart-timezone">{timezone}</span>
          </div>

          <div className="chart-frame">
            <div className="chart-legend">
              <span><i className="legend-candle" /> OHLC · {interval}</span>
              <span className="chart-source"><span className="pulse-dot" /> SIMULATED · 1s updates</span>
            </div>
            <MarketChart
              symbol={symbol}
              interval={interval}
              timezone={timezone}
              showFastAverage={showFastAverage}
              showSlowAverage={showSlowAverage}
              showEma={showEma}
              showBollinger={showBollinger}
              onLastCandle={setLastCandle}
              onIndicatorsChange={setIndicatorSnapshot}
              onFeedStatus={setFeedConnected}
            />
            <div className="ohlc-strip">
              <span>O <strong>{formatPrice(lastCandle?.open ?? price, symbol)}</strong></span>
              <span>H <strong>{formatPrice(lastCandle?.high ?? price, symbol)}</strong></span>
              <span>L <strong>{formatPrice(lastCandle?.low ?? price, symbol)}</strong></span>
              <span>C <strong>{formatPrice(lastCandle?.close ?? price, symbol)}</strong></span>
              <span>VOL <strong>{formatCompact(lastCandle?.volume ?? 0)}</strong></span>
            </div>
          </div>
          <div className="chart-credit">Interactive chart powered by <a href="https://github.com/tradingview/lightweight-charts" target="_blank" rel="noreferrer">Lightweight Charts</a> · Apache-2.0</div>

          <section className="analysis-strip" aria-label="Quick market statistics">
            <div><span>SESSION</span><strong>24h rolling</strong></div>
            <div><span>TIME BASIS</span><strong>UTC source · {timezone} display</strong></div>
            <div><span>LAST UPDATE</span><strong>{lastCandle ? formatTime(lastCandle.time, timezone, interval.endsWith("s")) : "Waiting for feed"}</strong></div>
            <div><span>DATA MODE</span><strong className="simulation-text">Synthetic</strong></div>
          </section>
          <section className="indicator-readout" aria-label="Statistical indicator values">
            <div><span>RSI · 14</span><strong>{formatIndicator(indicatorSnapshot?.rsi14, 1)}</strong></div>
            <div><span>ATR · 14</span><strong>{indicatorSnapshot?.atr14 == null ? "—" : formatPrice(indicatorSnapshot.atr14, symbol)}</strong></div>
            <div><span>REALIZED VOL · 20</span><strong>{indicatorSnapshot?.realizedVolatility20 == null ? "—" : `${indicatorSnapshot.realizedVolatility20.toFixed(2)}%`}</strong></div>
            <div><span>BOLLINGER %B · 20</span><strong>{formatIndicator(indicatorSnapshot?.bollingerPercentB, 2)}</strong></div>
          </section>
        </section>

        <aside
          aria-hidden={page === "chart" || page === "indicators"}
          className={`research-pane${page === "chart" || page === "indicators" ? " page-background" : ""}`}
          aria-label="Strategy backtest"
          inert={page === "chart" || page === "indicators"}
        >
          <div className="research-heading">
            <span className="research-icon"><FlaskConical size={17} /></span>
            <div><span className="eyebrow">RESEARCH</span><h2>Strategy lab</h2></div>
          </div>
          <div className="strategy-name"><div><span>STRATEGY</span><strong>Moving average crossover</strong></div><Sparkles size={16} /></div>
          <form className="strategy-form" onSubmit={runStrategy}>
            <div className="form-grid">
              <label>Fast period<input type="number" min="2" max="100" value={fastPeriod} onChange={(event) => setFastPeriod(Number(event.target.value))} /></label>
              <label>Slow period<input type="number" min="3" max="200" value={slowPeriod} onChange={(event) => setSlowPeriod(Number(event.target.value))} /></label>
            </div>
            <label className="field-label">Starting balance<div className="input-with-prefix"><span>$</span><input type="number" min="100" max="1000000000" step="100" value={startingBalance} onChange={(event) => setStartingBalance(Number(event.target.value))} /></div></label>
            <label className="field-label">Fee per side<div className="input-with-suffix"><input type="number" min="0" max="100" step="1" value={feeBps} onChange={(event) => setFeeBps(Number(event.target.value))} /><span>bps</span></div></label>
            <div className="strategy-rule"><span className="rule-dot" />Long when MA {fastPeriod || "?"} crosses above MA {slowPeriod || "?"}<br /><span className="rule-indent">Exit when it crosses below</span></div>
            <button className="run-button" type="submit" disabled={running}>
              {running ? <span className="spinner" /> : <Play size={15} fill="currentColor" />}
              {running ? "Running test" : "Run backtest"}
            </button>
          </form>

          {backtestError && <p className="form-error" role="alert">{backtestError}</p>}
          {backtest ? (
            <div className="results-block" aria-live="polite">
              <div className="results-title"><span>RESULTS</span><span>{backtest.bars} bars · {backtest.timezone}</span></div>
              <div className="return-summary"><span>Net return</span><strong className={backtest.netReturnPercent >= 0 ? "positive-text" : "negative-text"}>{formatPercent(backtest.netReturnPercent)}</strong></div>
              <div className="metrics-grid">
                <div><span>ENDING BALANCE</span><strong>{formatMoney(backtest.endingBalance)}</strong></div>
                <div><span>MAX DRAWDOWN</span><strong className="negative-text">−{backtest.maxDrawdownPercent.toFixed(2)}%</strong></div>
                <div><span>WIN RATE</span><strong>{backtest.winRatePercent.toFixed(1)}%</strong></div>
                <div><span>ROUND TRIPS</span><strong>{backtest.trades.length}</strong></div>
              </div>
              <div className="trade-list-heading"><span>RECENT TRADES</span><span>P&amp;L</span></div>
              {backtest.trades.length > 0 ? backtest.trades.slice(-4).reverse().map((trade, index) => (
                <div className="trade-row" key={`${trade.entryTime}-${trade.exitTime}-${index}`}>
                  <span><strong>{formatTime(trade.entryTime, timezone, interval.endsWith("s"))}</strong><small>Entry {formatPrice(trade.entryPrice, symbol)} → {formatPrice(trade.exitPrice, symbol)}</small></span>
                  <strong className={trade.pnl >= 0 ? "positive-text" : "negative-text"}>{formatMoney(trade.pnl)}</strong>
                </div>
              )) : <p className="no-trades">No completed trades for these settings.</p>}
            </div>
          ) : (
            <div className="results-empty"><LineChart size={20} /><strong>Results land here</strong><span>Run the strategy against the selected market and interval.</span></div>
          )}

          <div className="research-footnote"><strong>Model assumptions</strong><span>Signal at close, fill at next open. Fees included; slippage and exchange sessions are not modelled.</span></div>
        </aside>

        {page === "indicators" && (
          <section className="indicators-detail" aria-labelledby="indicators-title">
            <header className="page-heading">
              <span className="eyebrow">QUANTITATIVE READOUT</span>
              <h1 id="indicators-title">Indicator desk</h1>
              <p>Current readings for {symbol} on {interval} candles. Values refresh with the shared chart feed.</p>
            </header>
            <div className="indicator-cards">
              <article>
                <span>RELATIVE STRENGTH INDEX · 14</span>
                <strong>{formatIndicator(indicatorSnapshot?.rsi14, 1)}</strong>
                <p>Wilder RSI on closes, bounded from 0 to 100. Conventional 30/70 levels are context, not a signal by themselves.</p>
              </article>
              <article>
                <span>AVERAGE TRUE RANGE · 14</span>
                <strong>{indicatorSnapshot?.atr14 == null ? "—" : formatPrice(indicatorSnapshot.atr14, symbol)}</strong>
                <p>Wilder-smoothed true range in quote-price units; this estimates movement size, not direction.</p>
              </article>
              <article>
                <span>REALIZED VOLATILITY · 20</span>
                <strong>{indicatorSnapshot?.realizedVolatility20 == null ? "—" : `${indicatorSnapshot.realizedVolatility20.toFixed(2)}%`}</strong>
                <p>Standard deviation of the latest 20 log returns, shown as a per-bar percentage and not annualized.</p>
              </article>
              <article>
                <span>BOLLINGER %B · 20</span>
                <strong>{formatIndicator(indicatorSnapshot?.bollingerPercentB, 2)}</strong>
                <p>Close position relative to the 20-period, two-standard-deviation bands. Near 0 or 1 marks a band, not a forecast.</p>
              </article>
            </div>
            <div className="indicator-method-note">
              <strong>Calculation scope</strong>
              <span>All indicators use the selected candle series. At 1s, 500 retained bars cover roughly eight minutes; current values use the available window only.</span>
            </div>
          </section>
        )}
      </main>

      <footer className="statusbar">
        <span><span className="statusbar-dot" /> Research mode · simulated quotes only · no orders</span>
        <span><Clock3 size={13} /> {new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date())} <span className="status-zone">{timezone}</span></span>
      </footer>
    </div>
  );
}

function formatPrice(value: number, symbol: string): string {
  const digits = symbol.startsWith("DOGE") || symbol.startsWith("XRP") ? 4 : symbol.startsWith("BTC") ? 2 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTime(epochSeconds: number, timezone: string, showSeconds = false): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(new Date(epochSeconds * 1_000));
}

function formatIndicator(value: number | null | undefined, digits: number): string {
  return value == null ? "—" : value.toFixed(digits);
}