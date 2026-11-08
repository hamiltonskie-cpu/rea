export const PAPER_STARTING_CASH = 10_000;
export const PAPER_FEE_BPS = 10;
const MAX_RECENT_ORDERS = 250;
const MAX_PAPER_ACCOUNTS = 5_000;
const accounts = new Map();
export function resetPaperAccount(accountId) {
    accounts.set(accountId, { state: createState(), lastAccess: Date.now() });
}
export function executePaperOrder(accountId, request, price) {
    if (!Number.isFinite(price) || price <= 0)
        throw new Error("A valid simulated market price is required");
    const state = getState(accountId);
    const quantity = request.quantity;
    const notional = roundMoney(quantity * price);
    if (notional <= 0)
        throw new Error("Order notional must be at least one cent");
    const fee = roundMoney(notional * PAPER_FEE_BPS / 10_000);
    const position = state.positions.get(request.symbol);
    let cashImpact;
    if (request.side === "buy") {
        const totalCost = roundMoney(notional + fee);
        if (totalCost > state.cash)
            throw new Error("Insufficient paper cash for this order");
        const previousQuantity = position?.quantity ?? 0;
        const nextQuantity = previousQuantity + quantity;
        const previousCost = previousQuantity * (position?.averageEntryPrice ?? 0);
        state.positions.set(request.symbol, {
            quantity: nextQuantity,
            averageEntryPrice: (previousCost + totalCost) / nextQuantity,
        });
        state.cash = roundMoney(state.cash - totalCost);
        cashImpact = -totalCost;
    }
    else {
        if (!position || quantity > position.quantity)
            throw new Error("Sell quantity exceeds the paper position");
        state.realizedPnl = roundMoney(state.realizedPnl + quantity * (price - position.averageEntryPrice) - fee);
        state.cash = roundMoney(state.cash + notional - fee);
        cashImpact = roundMoney(notional - fee);
        const remainingQuantity = roundQuantity(position.quantity - quantity);
        if (remainingQuantity === 0)
            state.positions.delete(request.symbol);
        else
            state.positions.set(request.symbol, { ...position, quantity: remainingQuantity });
    }
    state.totalFees = roundMoney(state.totalFees + fee);
    const order = {
        id: `PAPER-${String(state.nextOrderId++).padStart(6, "0")}`,
        symbol: request.symbol,
        side: request.side,
        quantity,
        price,
        notional,
        fee,
        cashImpact,
        time: Date.now(),
    };
    state.recentOrders.unshift(order);
    if (state.recentOrders.length > MAX_RECENT_ORDERS)
        state.recentOrders.length = MAX_RECENT_ORDERS;
    return { ...order };
}
export function getPaperAccount(accountId, markets) {
    const state = getState(accountId);
    const positions = [...state.positions.entries()].map(([symbol, position]) => {
        const markPrice = markets.find((market) => market.symbol === symbol)?.price ?? position.averageEntryPrice;
        const marketValue = roundMoney(position.quantity * markPrice);
        return {
            symbol,
            quantity: position.quantity,
            averageEntryPrice: position.averageEntryPrice,
            markPrice,
            marketValue,
            unrealizedPnl: roundMoney(marketValue - position.quantity * position.averageEntryPrice),
        };
    });
    const unrealizedPnl = roundMoney(positions.reduce((total, position) => total + position.unrealizedPnl, 0));
    const equity = roundMoney(state.cash + positions.reduce((total, position) => total + position.marketValue, 0));
    return {
        startingCash: PAPER_STARTING_CASH,
        cash: state.cash,
        equity,
        realizedPnl: state.realizedPnl,
        unrealizedPnl,
        totalPnl: roundMoney(equity - PAPER_STARTING_CASH),
        totalFees: state.totalFees,
        positions,
        recentOrders: state.recentOrders.map((order) => ({ ...order })),
    };
}
function createState() {
    return {
        cash: PAPER_STARTING_CASH,
        realizedPnl: 0,
        totalFees: 0,
        nextOrderId: 1,
        positions: new Map(),
        recentOrders: [],
    };
}
function getState(accountId) {
    let account = accounts.get(accountId);
    if (!account) {
        if (accounts.size >= MAX_PAPER_ACCOUNTS) {
            let oldestId;
            let oldestAccess = Number.POSITIVE_INFINITY;
            for (const [candidateId, candidate] of accounts) {
                if (candidate.lastAccess < oldestAccess) {
                    oldestAccess = candidate.lastAccess;
                    oldestId = candidateId;
                }
            }
            if (oldestId)
                accounts.delete(oldestId);
        }
        account = { state: createState(), lastAccess: Date.now() };
        accounts.set(accountId, account);
    }
    account.lastAccess = Date.now();
    return account.state;
}
function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function roundQuantity(value) {
    return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}
