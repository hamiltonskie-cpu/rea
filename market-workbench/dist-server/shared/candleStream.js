import { candleSchema } from "./market.js";
export function consumeCandleStreamEvent(payload, onCandle, onFeedStatus) {
    let value;
    try {
        value = JSON.parse(payload);
    }
    catch {
        onFeedStatus(false);
        return false;
    }
    const parsed = candleSchema.safeParse(value);
    if (!parsed.success) {
        onFeedStatus(false);
        return false;
    }
    try {
        onCandle(parsed.data);
    }
    catch {
        onFeedStatus(false);
        return false;
    }
    onFeedStatus(true);
    return true;
}
