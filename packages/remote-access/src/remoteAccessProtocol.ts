import { z } from 'zod';
import { RemoteAccessError } from './remoteAccessError.js';
import type { RemoteAccessRequest, RemoteAccessResponse } from './types.js';

const requestIdSchema = z.string().trim().min(1).max(128);
const deviceIdSchema = z.string().trim().min(1).max(128);
const walletIdSchema = z.string().trim().min(1).max(128);
const assetIdSchema = z.string().trim().min(1).max(256);
const orderIdSchema = z.string().trim().min(1).max(256);
const emptyParamsSchema = z.object({}).strict();
const positiveNumberSchema = z.number().finite().positive();

const limitOrderSchema = z
  .object({
    assetId: assetIdSchema,
    side: z.enum(['BUY', 'SELL']),
    orderType: z.literal('limit'),
    price: positiveNumberSchema.max(1),
    shares: positiveNumberSchema,
    tickSize: positiveNumberSchema.max(1).optional(),
    negRisk: z.boolean().optional(),
    postOnly: z.boolean().optional(),
    expiration: z.number().int().positive().optional(),
  })
  .strict();

const marketOrderSchema = z
  .object({
    assetId: assetIdSchema,
    side: z.enum(['BUY', 'SELL']),
    orderType: z.literal('market'),
    amount: positiveNumberSchema,
    tickSize: positiveNumberSchema.max(1).optional(),
    negRisk: z.boolean().optional(),
    marketOrderType: z.enum(['FOK', 'FAK']).optional(),
  })
  .strict();

const requestSchema = z.discriminatedUnion('method', [
  z
    .object({
      id: requestIdSchema,
      method: z.literal('auth'),
      params: z
        .object({
          protocolVersion: z.literal(1),
          deviceId: deviceIdSchema,
          token: z.string().min(1).max(4096),
        })
        .strict(),
    })
    .strict(),
  z.object({ id: requestIdSchema, method: z.literal('ping'), params: emptyParamsSchema }).strict(),
  z
    .object({ id: requestIdSchema, method: z.literal('wallet.list'), params: emptyParamsSchema })
    .strict(),
  z
    .object({
      id: requestIdSchema,
      method: z.literal('wallet.getBalance'),
      params: z.object({ walletId: walletIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      id: requestIdSchema,
      method: z.literal('order.list'),
      params: z
        .object({
          walletId: walletIdSchema,
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: requestIdSchema,
      method: z.literal('order.place'),
      params: z
        .object({
          walletId: walletIdSchema,
          order: z.discriminatedUnion('orderType', [limitOrderSchema, marketOrderSchema]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: requestIdSchema,
      method: z.literal('order.cancel'),
      params: z.object({ walletId: walletIdSchema, orderId: orderIdSchema }).strict(),
    })
    .strict(),
]);

class RemoteAccessProtocol {
  public parseRequest(payload: string): RemoteAccessRequest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new RemoteAccessError('INVALID_JSON', 'Request must be valid JSON');
    }

    const result = requestSchema.safeParse(parsed);
    if (!result.success) {
      throw new RemoteAccessError('INVALID_REQUEST', 'Request does not match the protocol');
    }
    return result.data as RemoteAccessRequest;
  }

  public extractRequestId(payload: string): string {
    try {
      const parsed = JSON.parse(payload) as { id?: unknown };
      return typeof parsed?.id === 'string' ? parsed.id.slice(0, 128) : '';
    } catch {
      return '';
    }
  }

  public fingerprint(request: RemoteAccessRequest): string {
    return JSON.stringify({ method: request.method, params: request.params });
  }

  public encodeResponse(response: RemoteAccessResponse): string {
    try {
      return JSON.stringify(response);
    } catch {
      return JSON.stringify({
        id: response.id,
        ok: false,
        error: {
          code: 'SERIALIZATION_FAILED',
          message: 'Response could not be serialized',
        },
      } satisfies RemoteAccessResponse);
    }
  }
}

export { RemoteAccessProtocol };
