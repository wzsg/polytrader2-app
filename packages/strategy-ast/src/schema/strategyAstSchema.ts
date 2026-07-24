import { z } from 'zod';
import {
  canonicalDecimalStringSchema,
  identifierSchema,
  timestampStringSchema,
} from './strategyValueSchemas.js';
import { STRATEGY_AST_SCHEMA_VERSION, type StrategyAstDocument } from '../types.js';

const runtimeValueSchema = z.union([z.boolean(), z.string(), z.number().finite(), z.null()]);
const valueTypeSchema = z.enum([
  'boolean',
  'decimal',
  'integer',
  'string',
  'orderSide',
  'timestamp',
  'duration',
]);

const valueDefinitionSchema = z
  .object({
    type: valueTypeSchema,
    nullable: z.boolean().optional(),
    defaultValue: runtimeValueSchema.optional(),
    minimum: z.union([canonicalDecimalStringSchema, z.number().finite()]).optional(),
    maximum: z.union([canonicalDecimalStringSchema, z.number().finite()]).optional(),
    description: z.string().max(1_000).optional(),
  })
  .strict();

const stateDefinitionSchema = z
  .object({
    type: valueTypeSchema,
    nullable: z.boolean().optional(),
    initialValue: runtimeValueSchema,
  })
  .strict();

const nodeIdShape = { id: identifierSchema };

const expressionSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ ...nodeIdShape, kind: z.literal('literal.boolean'), value: z.boolean() }).strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('literal.decimal'),
        value: canonicalDecimalStringSchema,
      })
      .strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('literal.integer'),
        value: z.number().int().safe(),
      })
      .strict(),
    z.object({ ...nodeIdShape, kind: z.literal('literal.string'), value: z.string() }).strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('literal.orderSide'),
        value: z.enum(['BUY', 'SELL']),
      })
      .strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('literal.timestamp'),
        value: timestampStringSchema,
      })
      .strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('literal.duration'),
        value: z.number().int().nonnegative().safe(),
      })
      .strict(),
    z.object({ ...nodeIdShape, kind: z.literal('parameter'), name: identifierSchema }).strict(),
    z.object({ ...nodeIdShape, kind: z.literal('state'), name: identifierSchema }).strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('reference'),
        source: z.enum(['orderBook', 'account', 'position', 'market', 'trade', 'event']),
        field: z.enum([
          'bestBid',
          'bestAsk',
          'midpoint',
          'spread',
          'tickSize',
          'availableBalance',
          'openOrderCount',
          'size',
          'averagePrice',
          'currentValue',
          'cashPnl',
          'active',
          'closed',
          'volume',
          'volume24hr',
          'liquidity',
          'price',
          'side',
          'sequence',
          'occurredAt',
        ]),
        outcome: z.literal('selected').optional(),
      })
      .strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('compare'),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
        left: expressionSchema,
        right: expressionSchema,
      })
      .strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('logical'),
        operator: z.enum(['all', 'any']),
        items: z.array(expressionSchema).min(1).max(64),
      })
      .strict(),
    z.object({ ...nodeIdShape, kind: z.literal('not'), operand: expressionSchema }).strict(),
    z
      .object({
        ...nodeIdShape,
        kind: z.literal('arithmetic'),
        operator: z.enum(['add', 'subtract', 'multiply', 'divide']),
        left: expressionSchema,
        right: expressionSchema,
      })
      .strict(),
    z.object({ ...nodeIdShape, kind: z.literal('exists'), operand: expressionSchema }).strict(),
  ]),
);

const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ ...nodeIdShape, kind: z.literal('strategy.started') }).strict(),
  z.object({ ...nodeIdShape, kind: z.literal('strategy.stopping') }).strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('orderBook.changed'),
      outcome: z.literal('selected'),
    })
    .strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('trade.received'),
      outcome: z.literal('selected'),
    })
    .strict(),
  z.object({ ...nodeIdShape, kind: z.literal('account.changed') }).strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('timer.interval'),
      intervalMs: z.number().int().min(100).max(86_400_000),
    })
    .strict(),
]);

const limitOrderSchema = z
  .object({
    orderType: z.literal('limit'),
    price: expressionSchema,
    shares: expressionSchema,
    postOnly: z.boolean().optional(),
    expiration: expressionSchema.optional(),
  })
  .strict();

const marketOrderSchema = z
  .object({
    orderType: z.literal('market'),
    amount: expressionSchema,
    marketOrderType: z.enum(['FOK', 'FAK']).optional(),
  })
  .strict();

const actionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('order.place'),
      asset: z.literal('selected'),
      side: z.enum(['BUY', 'SELL']),
      order: z.discriminatedUnion('orderType', [limitOrderSchema, marketOrderSchema]),
    })
    .strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('state.set'),
      name: identifierSchema,
      value: expressionSchema,
    })
    .strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('state.increment'),
      name: identifierSchema,
      amount: expressionSchema,
    })
    .strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('log.write'),
      level: z.enum(['debug', 'info', 'warn', 'error']),
      message: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      ...nodeIdShape,
      kind: z.literal('strategy.stop'),
      reason: z.string().max(2_000).optional(),
    })
    .strict(),
]);

const ruleSchema = z
  .object({
    id: identifierSchema,
    trigger: triggerSchema,
    condition: expressionSchema.optional(),
    actions: z.array(actionSchema).min(1).max(64),
    policy: z
      .object({
        cooldownMs: z.number().int().nonnegative().max(86_400_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const riskPolicySchema = z
  .object({
    maximumOpenOrders: z.number().int().nonnegative().safe().optional(),
    maximumPositionShares: canonicalDecimalStringSchema.optional(),
    maximumOrderValue: canonicalDecimalStringSchema.optional(),
    minimumOrderIntervalMs: z.number().int().nonnegative().safe().optional(),
  })
  .strict();

const strategyAstSchema = z
  .object({
    schemaVersion: z.literal(STRATEGY_AST_SCHEMA_VERSION),
    parameters: z.record(identifierSchema, valueDefinitionSchema),
    state: z.record(identifierSchema, stateDefinitionSchema),
    rules: z.array(ruleSchema).min(1).max(256),
    riskPolicy: riskPolicySchema,
  })
  .strict() as z.ZodType<StrategyAstDocument>;

export { strategyAstSchema };
