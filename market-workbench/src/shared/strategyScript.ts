import { z } from "zod";
import { intervals, type BacktestResult } from "./market.js";

const identifierSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,23}$/);
const periodSchema = z.number().int().min(2).max(200);

export const strategyIndicatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sma"), period: periodSchema }).strict(),
  z.object({ kind: z.literal("ema"), period: periodSchema }).strict(),
  z.object({ kind: z.literal("rsi"), period: periodSchema }).strict(),
  z.object({ kind: z.literal("atr"), period: periodSchema }).strict(),
  z.object({ kind: z.literal("bollingerPercentB"), period: periodSchema }).strict(),
  z.object({ kind: z.literal("close") }).strict(),
  z.object({ kind: z.literal("volume") }).strict(),
]);

export const strategyOperandSchema = z.union([
  z.object({ indicator: identifierSchema }).strict(),
  z.object({ value: z.number().finite() }).strict(),
]);

export const strategyConditionSchema = z.object({
  left: strategyOperandSchema,
  operator: z.enum(["above", "below", "crossesAbove", "crossesBelow"]),
  right: strategyOperandSchema,
}).strict();

export const strategyScriptSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(60),
  indicators: z.record(identifierSchema, strategyIndicatorSchema).refine(
    (indicators) => Object.keys(indicators).length > 0 && Object.keys(indicators).length <= 12,
    "Define between 1 and 12 indicators",
  ),
  entry: strategyConditionSchema,
  exit: strategyConditionSchema,
  startingBalance: z.number().finite().min(100).max(1_000_000_000),
  feeBps: z.number().finite().min(0).max(100),
}).strict().superRefine((script, context) => {
  for (const [conditionName, condition] of [["entry", script.entry], ["exit", script.exit]] as const) {
    for (const operandName of ["left", "right"] as const) {
      const operand = condition[operandName];
      if ("indicator" in operand && !script.indicators[operand.indicator]) {
        context.addIssue({
          code: "custom",
          message: `Unknown indicator: ${operand.indicator}`,
          path: [conditionName, operandName, "indicator"],
        });
      }
    }
  }
});

export const strategyBacktestRequestSchema = z.object({
  symbol: z.string().min(1).max(20),
  interval: z.enum(intervals),
  timezone: z.string().min(1).max(100),
  script: strategyScriptSchema,
}).strict();

export type StrategyIndicatorDefinition = z.infer<typeof strategyIndicatorSchema>;
export type StrategyCondition = z.infer<typeof strategyConditionSchema>;
export type StrategyScript = z.infer<typeof strategyScriptSchema>;
export type StrategyBacktestRequest = z.infer<typeof strategyBacktestRequestSchema>;

export interface StrategyBacktestResult extends BacktestResult {
  strategyName: string;
  indicatorValues: Record<string, number | null>;
}