import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { simulatedUpdateIntervalMs, type Market, type PaperAccountSnapshot, type PaperOrder } from "../shared/market.js";

interface PaperTradePanelProps {
  markets: Market[];
  selectedSymbol: string;
  timezone: string;
}

interface PaperOrderResponse {
  order: PaperOrder;
  account: PaperAccountSnapshot;
}

export default function PaperTradePanel({ markets, selectedSymbol, timezone }: PaperTradePanelProps) {
  const [symbol, setSymbol] = useState(selectedSymbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("0.01");
  const [account, setAccount] = useState<PaperAccountSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setSymbol(selectedSymbol), [selectedSymbol]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/paper/account");
        if (!response.ok) throw new Error("Paper account request failed");
        const snapshot = (await response.json()) as PaperAccountSnapshot;
        if (active) setAccount(snapshot);
      } catch {
        if (active) setError("Paper account is unavailable");
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, simulatedUpdateIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedMarket = markets.find((market) => market.symbol === symbol);
  const quoteSource = selectedMarket?.venue === "BINANCE.US" ? "current Binance.US quote" : "current synthetic quote";
  const position = account?.positions.find((entry) => entry.symbol === symbol);
  const numericQuantity = Number(quantity);
  const estimateNotional = selectedMarket && Number.isFinite(numericQuantity) && numericQuantity > 0
    ? roundMoney(selectedMarket.price * numericQuantity)
    : 0;
  const estimateFee = roundMoney(estimateNotional * 0.001);

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/paper/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, side, quantity: numericQuantity }),
      });
      const body = (await response.json()) as PaperOrderResponse | { error: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Paper order rejected");
      const result = body as PaperOrderResponse;
      setAccount(result.account);
      setMessage(`${result.order.side.toUpperCase()} ${formatQuantity(result.order.quantity)} ${symbol} filled at ${formatPrice(result.order.price, symbol)}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to place paper order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="paper-terminal">
      <header className="paper-terminal-header">
        <div>
          <span className="eyebrow">SIMULATED EXECUTION</span>
          <h2>Paper account</h2>
          <p>Paper orders fill at the {quoteSource}. No broker is connected and no exchange order is submitted.</p>
        </div>
        <span className="paper-mode-tag">PAPER ONLY</span>
      </header>

      <section className="paper-metrics" aria-label="Paper account summary">
        <div><span>EQUITY</span><strong>{formatMoney(account?.equity ?? 0)}</strong></div>
        <div><span>AVAILABLE CASH</span><strong>{formatMoney(account?.cash ?? 0)}</strong></div>
        <div><span>REALIZED P&amp;L</span><strong className={pnlClass(account?.realizedPnl ?? 0)}>{formatMoney(account?.realizedPnl ?? 0)}</strong></div>
        <div><span>OPEN P&amp;L</span><strong className={pnlClass(account?.unrealizedPnl ?? 0)}>{formatMoney(account?.unrealizedPnl ?? 0)}</strong></div>
        <div><span>FEES PAID</span><strong>{formatMoney(account?.totalFees ?? 0)}</strong></div>
      </section>

      <div className="paper-layout">
        <form className="paper-ticket" onSubmit={submitOrder}>
          <div className="paper-section-heading"><h3>Market order</h3><span>10 bps fee</span></div>
          <label className="field-label">Market
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
              {markets.map((market) => <option value={market.symbol} key={market.symbol}>{market.symbol}</option>)}
            </select>
          </label>
          <div className="paper-side-switch" role="group" aria-label="Paper order side">
            <button type="button" className={side === "buy" ? "buy-selected" : ""} aria-pressed={side === "buy"} onClick={() => setSide("buy")}><ArrowUpRight size={14} /> Buy</button>
            <button type="button" className={side === "sell" ? "sell-selected" : ""} aria-pressed={side === "sell"} onClick={() => setSide("sell")}><ArrowDownRight size={14} /> Sell</button>
          </div>
          <label className="field-label">Quantity
            <input type="number" min="0.00000001" max="1000000" step="0.00000001" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          {side === "sell" && <p className="paper-available">Available to sell: {formatQuantity(position?.quantity ?? 0)} {symbol}</p>}
          <div className="paper-estimate">
            <span>Reference price</span><strong>{selectedMarket ? formatPrice(selectedMarket.price, symbol) : "—"}</strong>
            <span>Estimated value</span><strong>{formatMoney(estimateNotional)}</strong>
            <span>Estimated fee</span><strong>{formatMoney(estimateFee)}</strong>
          </div>
          <button className={`paper-submit ${side}`} type="submit" disabled={submitting || !markets.length || !Number.isFinite(numericQuantity) || numericQuantity <= 0}>
            {submitting ? "Submitting paper order" : `Place paper ${side}`}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="paper-success" role="status">{message}</p>}
          <p className="paper-ticket-note">Simulated fill at the displayed quote · price may move before the request reaches the server.</p>
        </form>

        <section className="paper-table-section" aria-labelledby="paper-positions-title">
          <div className="paper-section-heading"><h3 id="paper-positions-title">Open positions</h3><span>{account?.positions.length ?? 0}</span></div>
          {account?.positions.length ? (
            <div className="paper-table-scroll">
              <table className="paper-table">
                <thead><tr><th>Market</th><th>Quantity</th><th>Avg. entry</th><th>Mark</th><th>Value</th><th>Open P&amp;L</th></tr></thead>
                <tbody>{account.positions.map((entry) => (
                  <tr key={entry.symbol}>
                    <td>{entry.symbol}</td>
                    <td>{formatQuantity(entry.quantity)}</td>
                    <td>{formatPrice(entry.averageEntryPrice, entry.symbol)}</td>
                    <td>{formatPrice(entry.markPrice, entry.symbol)}</td>
                    <td>{formatMoney(entry.marketValue)}</td>
                    <td className={pnlClass(entry.unrealizedPnl)}>{formatMoney(entry.unrealizedPnl)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="paper-empty">No open positions.</p>}
        </section>
      </div>

      <section className="paper-table-section paper-order-history" aria-labelledby="paper-orders-title">
        <div className="paper-section-heading"><h3 id="paper-orders-title">Recent paper orders</h3><span>{account?.recentOrders.length ?? 0}</span></div>
        {account?.recentOrders.length ? (
          <div className="paper-table-scroll">
            <table className="paper-table">
              <thead><tr><th>Time · {timezone}</th><th>Market</th><th>Side</th><th>Quantity</th><th>Fill</th><th>Fee</th><th>Cash impact</th></tr></thead>
              <tbody>{account.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>{formatTime(order.time, timezone)}</td>
                  <td>{order.symbol}</td>
                  <td className={order.side === "buy" ? "positive-text" : "negative-text"}>{order.side.toUpperCase()}</td>
                  <td>{formatQuantity(order.quantity)}</td>
                  <td>{formatPrice(order.price, order.symbol)}</td>
                  <td>{formatMoney(order.fee)}</td>
                  <td className={order.cashImpact < 0 ? "negative-text" : "positive-text"}>{formatMoney(order.cashImpact)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="paper-empty">Your paper fills will appear here.</p>}
      </section>

      <p className="paper-disclaimer">The account starts with $10,000 simulated cash and exists only in this server process. Restarting the app resets the account. No real funds or live orders are involved.</p>
    </div>
  );
}

function formatPrice(value: number, symbol: string): string {
  const digits = symbol.startsWith("XRP") || symbol.startsWith("DOGE") ? 4 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}

function formatTime(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pnlClass(value: number): string {
  return value >= 0 ? "positive-text" : "negative-text";
}