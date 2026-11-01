const marketDefinitions = [
    { symbol: "BTC-USD", name: "Bitcoin / U.S. Dollar", venue: "SIM-CRYPTO", base: 67_420, volatility: 0.005 },
    { symbol: "ETH-USD", name: "Ether / U.S. Dollar", venue: "SIM-CRYPTO", base: 3_510, volatility: 0.007 },
    { symbol: "SOL-USD", name: "Solana / U.S. Dollar", venue: "SIM-CRYPTO", base: 148.2, volatility: 0.01 },
    { symbol: "XRP-USD", name: "XRP / U.S. Dollar", venue: "SIM-CRYPTO", base: 0.53, volatility: 0.009 },
    { symbol: "DOGE-USD", name: "Dogecoin / U.S. Dollar", venue: "SIM-CRYPTO", base: 0.17, volatility: 0.012 },
];
const intervalSeconds = {
    "1s": 1,
    "5s": 5,
    "15s": 15,
    "30s": 30,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1_800,
    "1h": 3_600,
    "4h": 14_400,
    "1d": 86_400,
};
const cache = new Map();
const seedBySymbol = new Map(marketDefinitions.map(({ symbol }) => [symbol, hash(symbol)]));
export function getMarkets() {
    return marketDefinitions.map((definition) => {
        const candles = getCandles(definition.symbol, "1m", 2);
        const latest = advanceCandle(definition.symbol, "1m");
        const previous = candles[0];
        const change = latest.close - previous.close;
        return {
            symbol: definition.symbol,
            name: definition.name,
            venue: definition.venue,
            price: latest.close,
            change,
            changePercent: (change / previous.close) * 100,
        };
    });
}
export function getCandles(symbol, interval, limit = 240) {
    const definition = marketDefinitions.find((market) => market.symbol === symbol);
    if (!definition)
        throw new Error("Unknown market symbol");
    const key = `${symbol}:${interval}`;
    let candles = cache.get(key);
    if (!candles) {
        candles = generateCandles(symbol, definition.base, definition.volatility, interval, 500);
        cache.set(key, candles);
    }
    return candles.slice(-Math.max(1, Math.min(500, limit)));
}
export function advanceCandle(symbol, interval) {
    const definition = marketDefinitions.find((market) => market.symbol === symbol);
    if (!definition)
        throw new Error("Unknown market symbol");
    const candles = getCandles(symbol, interval, 500);
    const duration = intervalSeconds[interval];
    const bucket = Math.floor(Date.now() / 1_000 / duration) * duration;
    const latest = candles[candles.length - 1];
    if (bucket > latest.time) {
        const stored = cache.get(`${symbol}:${interval}`);
        const firstBucket = Math.max(latest.time + duration, bucket - 499 * duration);
        let previous = latest;
        for (let time = firstBucket; time <= bucket; time += duration) {
            previous = makeNextCandle(symbol, previous, time, definition.volatility);
            stored?.push(previous);
        }
        if (stored && stored.length > 500)
            stored.splice(0, stored.length - 500);
        return previous;
    }
    const tick = nextNoise(symbol, latest.time + Math.floor(Date.now() / 1_000));
    const close = Math.max(0.000001, latest.close * (1 + tick * definition.volatility * 0.22));
    latest.high = Math.max(latest.high, close);
    latest.low = Math.min(latest.low, close);
    latest.close = close;
    latest.volume += Math.abs(tick) * 8;
    return latest;
}
export function isKnownMarket(symbol) {
    return marketDefinitions.some((market) => market.symbol === symbol);
}
function generateCandles(symbol, base, volatility, interval, count) {
    const duration = intervalSeconds[interval];
    const end = Math.floor(Date.now() / 1_000 / duration) * duration;
    const candles = [];
    let close = base;
    let seed = seedBySymbol.get(symbol) ?? hash(symbol);
    for (let index = count - 1; index >= 0; index -= 1) {
        const time = end - index * duration;
        const open = close;
        seed = (seed * 16_807) % 2_147_483_647;
        const random = seed / 2_147_483_647 - 0.5;
        const wave = Math.sin((count - index) * 0.17) * 0.0007;
        close = Math.max(0.000001, open * (1 + wave + random * volatility));
        const spread = Math.abs(close - open) + open * volatility * 0.2;
        candles.push({
            time,
            open,
            high: Math.max(open, close) + spread * 0.35,
            low: Math.max(0.000001, Math.min(open, close) - spread * 0.35),
            close,
            volume: 25 + Math.abs(random) * 500,
        });
    }
    return candles;
}
function makeNextCandle(symbol, previous, time, volatility) {
    const open = previous.close;
    const change = nextNoise(symbol, time) * volatility;
    const close = Math.max(0.000001, open * (1 + change));
    const spread = Math.abs(close - open) + open * volatility * 0.15;
    return {
        time,
        open,
        high: Math.max(open, close) + spread * 0.35,
        low: Math.max(0.000001, Math.min(open, close) - spread * 0.35),
        close,
        volume: 25 + Math.abs(change) * 100_000,
    };
}
function nextNoise(symbol, salt) {
    const seed = ((seedBySymbol.get(symbol) ?? hash(symbol)) + Math.abs(Math.trunc(salt))) % 2_147_483_646;
    return (seed / 2_147_483_646) * 2 - 1;
}
function hash(value) {
    let result = 0;
    for (const character of value)
        result = (result * 31 + character.charCodeAt(0)) % 2_147_483_646;
    return Math.max(1, result);
}
