import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import type { Interval } from "../shared/market.js";
import type { StrategyBacktestResult } from "../shared/strategyScript.js";

const storageKey = "fieldnote.strategy-script.v1";
const starterScript = `{
  "version": 1,
  "name": "RSI return",
  "indicators": {
    "rsi": { "kind": "rsi", "period": 14 },
    "trend": { "kind": "ema", "period": 21 }
  },
  "entry": {
    "left": { "indicator": "rsi" },
    "operator": "crossesBelow",
    "right": { "value": 30 }
  },
  "exit": {
    "left": { "indicator": "rsi" },
    "operator": "crossesAbove",
    "right": { "value": 70 }
  },
  "startingBalance": 10000,
  "feeBps": 10
}`;

interface StrategyStudioProps {
  active: boolean;
  symbol: string;
  interval: Interval;
  timezone: string;
}

export default function StrategyStudio({ active, symbol, interval, timezone }: StrategyStudioProps) {
  const [source, setSource] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) ?? starterScript;
    } catch {
      return starterScript;
    }
  });
  const [result, setResult] = useState<StrategyBacktestResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, source);
    } catch {
      return;
    }
  }, [source]);

  async function runScript(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    let script: unknown;
    try {
      script = JSON.parse(source);
    } catch {
      setError("Fix the JSON syntax before running this strategy.");
      return;
    }

    setRunning(true);
    try {
      const response = await fetch("/api/strategy-backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval, timezone, script }),
      });
      const body = (await response.json()) as StrategyBacktestResult | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Strategy run failed");
      setResult(body as StrategyBacktestResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run this strategy");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="strategy-studio" hidden={!active} aria-labelledby="strategy-studio-title">
      <header className="page-heading">
        <span className="eyebrow">VERSIONED STRATEGY SPEC · {symbol} · {interval}</span>
        <h1 id="strategy-studio-title">Strategy Studio</h1>
      </header>
      <div className="studio-layout">
        <form className="studio-editor" onSubmit={runScript}>
          <div className="studio-editor-heading"><h2>Strategy source</h2><span>JSON · no executable code</span></div>
          <CodeMirror
            aria-label="Strategy JSON editor"
            value={source}
            height="430px"
            extensions={[json()]}
            onChange={(value) => { setSource(value); setResult(null); }}
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          />
          <div className="studio-editor-footer">
            <span>Signals use completed bars and fill at the next bar open.</span>
            <button className="run-button" type="submit" disabled={running}>
              {running ? <span className="spinner" /> : null}
              {running ? "Running strategy" : "Run backtest"}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>

        <section className="studio-results" aria-live="polite" aria-label="Strategy results">
          {result ? (
            <>
              <div className="studio-results-heading"><div><span className="eyebrow">BACKTEST</span><h2>{result.strategyName}</h2></div><span>{result.bars} bars · {result.timezone}</span></div>
              <div className="studio-metrics">
                <div><span>NET RETURN</span><strong className={pnlClass(result.netReturnPercent)}>{formatPercent(result.netReturnPercent)}</strong></div>
                <div><span>ENDING BALANCE</span><strong>{formatMoney(result.endingBalance)}</strong></div>
                <div><span>MAX DRAWDOWN</span><strong className="negative-text">−{result.maxDrawdownPercent.toFixed(2)}%</strong></div>
                <div><span>WIN RATE</span><strong>{result.winRatePercent.toFixed(1)}%</strong></div>
                <div><span>TRADES</span><strong>{result.trades.length}</strong></div>
              </div>
              <div className="studio-indicator-values">
                <h3>Latest indicator values</h3>
                {Object.entries(result.indicatorValues).map(([name, value]) => (
                  <div key={name}><span>{name}</span><strong>{value == null ? "—" : value.toFixed(4)}</strong></div>
                ))}
              </div>
              <div className="studio-trades">
                <h3>Completed trades</h3>
                {result.trades.length ? result.trades.slice(-20).reverse().map((trade, index) => (
                  <div className="studio-trade-row" key={`${trade.entryTime}-${trade.exitTime}-${index}`}>
                    <span>{formatTime(trade.entryTime, timezone)} → {formatTime(trade.exitTime, timezone)}</span>
                    <span>{formatPrice(trade.entryPrice, symbol)} → {formatPrice(trade.exitPrice, symbol)}</span>
                    <strong className={pnlClass(trade.pnl)}>{formatMoney(trade.pnl)}</strong>
                  </div>
                )) : <p className="paper-empty">No trades matched this strategy.</p>}
              </div>
              <p className="paper-disclaimer">Long-only simulation · {result.feeBps} bps per side · no slippage or broker execution.</p>
            </>
          ) : (
            <div className="studio-empty"><span className="eyebrow">READY</span><strong>Strategy results</strong><span>Run the current definition against {symbol} · {interval} candles.</span></div>
          )}
        </section>
      </div>
    </section>
  );
}

function formatPrice(value: number, symbol: string): string {
  const digits = symbol.startsWith("XRP") || symbol.startsWith("DOGE") ? 4 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatTime(epochSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochSeconds * 1_000));
}

function pnlClass(value: number): string {
  return value >= 0 ? "positive-text" : "negative-text";
}