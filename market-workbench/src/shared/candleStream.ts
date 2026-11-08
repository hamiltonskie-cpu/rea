import { candleSchema, type Candle } from "./market.js";

export function consumeCandleStreamEvent(
  payload: string,
  onCandle: (candle: Candle) => void,
  onFeedStatus: (connected: boolean) => void,
): boolean {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
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
  } catch {
    onFeedStatus(false);
    return false;
  }
  onFeedStatus(true);
  return true;
}