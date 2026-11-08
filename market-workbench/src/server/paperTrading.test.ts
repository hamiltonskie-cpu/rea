import assert from "node:assert/strict";
import test from "node:test";
import type { Market } from "../shared/market.js";
import { executePaperOrder, getPaperAccount, PAPER_FEE_BPS, PAPER_STARTING_CASH, resetPaperAccount } from "./paperTrading.js";

const marks: Market[] = [{
  symbol: "BTC-USD",
  name: "Bitcoin / U.S. Dollar",
  venue: "SIM-CRYPTO",
  price: 110,
  change: 0,
  changePercent: 0,
}];
const testAccount = "paper-test-account";

test("starts with a simulated cash balance and no positions", () => {
  resetPaperAccount(testAccount);
  const account = getPaperAccount(testAccount, marks);

  assert.equal(account.startingCash, PAPER_STARTING_CASH);
  assert.equal(account.cash, PAPER_STARTING_CASH);
  assert.equal(account.equity, PAPER_STARTING_CASH);
  assert.deepEqual(account.positions, []);
  assert.deepEqual(account.recentOrders, []);
});

test("buys at the supplied mark, charges a fee, and marks open P&L", () => {
  resetPaperAccount(testAccount);
  const order = executePaperOrder(testAccount, { symbol: "BTC-USD", side: "buy", quantity: 2 }, 100);
  const account = getPaperAccount(testAccount, marks);

  assert.equal(order.price, 100);
  assert.equal(order.fee, 0.2);
  assert.equal(order.cashImpact, -200.2);
  assert.equal(account.cash, 9_799.8);
  assert.equal(account.positions[0]?.quantity, 2);
  assert.equal(account.positions[0]?.markPrice, 110);
  assert.equal(account.positions[0]?.unrealizedPnl, 19.8);
  assert.equal(account.totalFees, 0.2);
});

test("sells only held quantity and tracks realized P&L and fees", () => {
  resetPaperAccount(testAccount);
  executePaperOrder(testAccount, { symbol: "BTC-USD", side: "buy", quantity: 2 }, 100);
  const sell = executePaperOrder(testAccount, { symbol: "BTC-USD", side: "sell", quantity: 1 }, 110);
  const account = getPaperAccount(testAccount, marks);

  assert.equal(sell.fee, 0.11);
  assert.equal(account.cash, 9_909.69);
  assert.equal(account.realizedPnl, 9.79);
  assert.equal(account.positions[0]?.quantity, 1);
  assert.equal(account.recentOrders.length, 2);
  assert.equal(PAPER_FEE_BPS, 10);
});

test("rejects insufficient cash and selling more than the open paper position", () => {
  resetPaperAccount(testAccount);
  assert.throws(
    () => executePaperOrder(testAccount, { symbol: "BTC-USD", side: "buy", quantity: 1_000 }, 100),
    /Insufficient paper cash/,
  );
  assert.throws(
    () => executePaperOrder(testAccount, { symbol: "BTC-USD", side: "sell", quantity: 0.01 }, 100),
    /Sell quantity exceeds/,
  );
  assert.equal(getPaperAccount(testAccount, marks).cash, PAPER_STARTING_CASH);
});

test("keeps anonymous browser paper accounts isolated", () => {
  resetPaperAccount("browser-one");
  resetPaperAccount("browser-two");
  executePaperOrder("browser-one", { symbol: "BTC-USD", side: "buy", quantity: 1 }, 100);

  assert.equal(getPaperAccount("browser-one", marks).positions.length, 1);
  assert.equal(getPaperAccount("browser-two", marks).positions.length, 0);
});