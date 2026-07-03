import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CachedAccountOrder } from '@polytrader/repository-contract';
import type {
  AccountOrderCreateInput,
  AccountOrderExchangeUpdateInput,
  AccountOrderStatus,
  AccountOrderUpdateInput,
  ClobOrder,
  ClobTrade,
  ClobTradeMakerOrder,
  DataPosition,
  StrategyPlaceOrderInput,
} from '@polytrader/shared';
import { getDb, getSqlite } from '../client.js';
import { walletOrders, walletPositions, walletTrades, events, markets } from '../schema/index.js';

interface AccountMarketReference {
  marketId: string | null;
  eventId: string | null;
}

class SqliteAccountDataRepository {
  public getCachedOrderByExchangeOrderId(
    walletId: string,
    exchangeOrderId: string,
  ): CachedAccountOrder | null {
    const row = getDb()
      .select({
        walletId: walletOrders.walletId,
        orderId: walletOrders.orderId,
        conditionId: walletOrders.conditionId,
        marketId: walletOrders.marketId,
        eventId: walletOrders.eventId,
        eventTitle: events.title,
        eventIcon: events.image,
        marketQuestion: markets.question,
        marketGroupItemTitle: markets.groupItemTitle,
        marketIcon: markets.icon,
        marketImage: markets.image,
        marketClobTokenIds: markets.clobTokenIds,
        marketClobTokenIds0: markets.clobTokenIds0,
        marketClobTokenIds1: markets.clobTokenIds1,
        marketOutcomes: markets.outcomes,
        marketOutcomes0: markets.outcomes0,
        marketOutcomes1: markets.outcomes1,
        exchangeOrderId: walletOrders.exchangeOrderId,
        active: walletOrders.active,
        status: walletOrders.status,
        errorMessage: walletOrders.errorMessage,
        orderType: walletOrders.orderType,
        side: walletOrders.side,
        assetId: walletOrders.assetId,
        outcome: walletOrders.outcome,
        price: walletOrders.price,
        shares: walletOrders.shares,
        sizeMatched: walletOrders.sizeMatched,
        amount: walletOrders.amount,
        createdAt: walletOrders.createdAt,
        owner: walletOrders.owner,
        makerAddress: walletOrders.makerAddress,
        expiration: walletOrders.expiration,
        associateTradesJson: walletOrders.associateTradesJson,
        submittedAt: walletOrders.submittedAt,
      })
      .from(walletOrders)
      .leftJoin(markets, eq(walletOrders.marketId, markets.id))
      .leftJoin(events, eq(walletOrders.eventId, events.id))
      .where(
        and(eq(walletOrders.walletId, walletId), eq(walletOrders.exchangeOrderId, exchangeOrderId)),
      )
      .get();

    if (!row) return null;
    return {
      order: this._mapOrderRow(row),
      active: row.active,
      status: row.status,
    };
  }

  public insertAccountOrder(input: AccountOrderCreateInput): void {
    const timestamp = this._now();
    const createdAt = this._timestampMs(input.submittedAt, Date.now());
    const marketReference = this._resolveMarketReference(input.conditionId);
    getDb()
      .insert(walletOrders)
      .values({
        walletId: input.walletId,
        orderId: input.orderId,
        conditionId: input.conditionId,
        marketId: marketReference.marketId,
        eventId: marketReference.eventId,
        active: this._isActiveStatus(input.status),
        status: input.status,
        orderType: input.input.orderType,
        side: input.input.side,
        assetId: input.input.assetId,
        outcome: this._resolveOutcome(input.conditionId, input.input.assetId),
        price: this._nullableString(this._orderPrice(input.input)),
        shares: this._nullableString(this._orderShares(input.input)),
        amount: this._nullableString(this._orderAmount(input.input)),
        createdAt,
        inputJson: this._stringifyJson(input.input),
        requestJson: this._stringifyJson(input.request),
        submittedAt: input.submittedAt,
        lastSeenAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }

  public updateAccountOrder(input: AccountOrderUpdateInput): void {
    const timestamp = this._now();
    getDb()
      .update(walletOrders)
      .set({
        exchangeOrderId: input.exchangeOrderId ?? undefined,
        active: this._isActiveStatus(input.status),
        status: input.status,
        responseJson:
          input.response === undefined ? undefined : this._stringifyJson(input.response),
        errorMessage: input.errorMessage ?? undefined,
        completedAt: input.completedAt ?? undefined,
        updatedAt: timestamp,
      })
      .where(
        and(eq(walletOrders.walletId, input.walletId), eq(walletOrders.orderId, input.orderId)),
      )
      .run();
  }

  public updateAccountOrderByExchangeOrderId(input: AccountOrderExchangeUpdateInput): void {
    const timestamp = this._now();
    getDb()
      .update(walletOrders)
      .set({
        active: this._isActiveStatus(input.status),
        status: input.status,
        responseJson:
          input.response === undefined ? undefined : this._stringifyJson(input.response),
        errorMessage: input.errorMessage ?? undefined,
        completedAt: input.completedAt ?? undefined,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(walletOrders.walletId, input.walletId),
          eq(walletOrders.exchangeOrderId, input.exchangeOrderId),
        ),
      )
      .run();
  }

  public updateWalletOrdersByExchangeOrderIds(
    walletId: string,
    exchangeOrderIds: string[],
    input: Omit<AccountOrderUpdateInput, 'walletId' | 'orderId' | 'exchangeOrderId'>,
  ): void {
    const ids = [...new Set(exchangeOrderIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return;

    const timestamp = this._now();
    getDb()
      .update(walletOrders)
      .set({
        active: this._isActiveStatus(input.status),
        status: input.status,
        responseJson:
          input.response === undefined ? undefined : this._stringifyJson(input.response),
        errorMessage: input.errorMessage ?? undefined,
        completedAt: input.completedAt ?? undefined,
        updatedAt: timestamp,
      })
      .where(and(eq(walletOrders.walletId, walletId), inArray(walletOrders.exchangeOrderId, ids)))
      .run();
  }

  public markAccountOrderInactiveByExchangeOrderId(
    walletId: string,
    exchangeOrderId: string,
  ): boolean {
    const timestamp = this._now();
    const result = getSqlite()
      .prepare(
        'UPDATE wallet_orders SET active = 0, updated_at = @updatedAt WHERE wallet_id = @walletId AND exchange_order_id = @exchangeOrderId AND active = 1',
      )
      .run({ walletId, exchangeOrderId, updatedAt: timestamp }) as { changes?: number };
    return Number(result.changes ?? 0) > 0;
  }

  public deleteFailedAccountOrder(walletId: string, orderId: string): boolean {
    const timestamp = this._now();
    const result = getSqlite()
      .prepare(
        "UPDATE wallet_orders SET active = 0, updated_at = @updatedAt WHERE wallet_id = @walletId AND order_id = @orderId AND status = 'submit-failed' AND active = 1",
      )
      .run({ walletId, orderId, updatedAt: timestamp }) as { changes?: number };
    return Number(result.changes ?? 0) > 0;
  }

  public updateActiveWalletOrdersByAccount(
    walletId: string,
    input: Omit<AccountOrderUpdateInput, 'walletId' | 'orderId' | 'exchangeOrderId'>,
  ): void {
    const timestamp = this._now();
    getDb()
      .update(walletOrders)
      .set({
        active: this._isActiveStatus(input.status),
        status: input.status,
        responseJson:
          input.response === undefined ? undefined : this._stringifyJson(input.response),
        errorMessage: input.errorMessage ?? undefined,
        completedAt: input.completedAt ?? undefined,
        updatedAt: timestamp,
      })
      .where(and(eq(walletOrders.walletId, walletId), eq(walletOrders.active, true)))
      .run();
  }

  public upsertWalletOrders(walletId: string, orders: ClobOrder[]): void {
    const db = getDb();
    const timestamp = this._now();

    db.transaction((tx) => {
      const marketReferences = new Map<string, AccountMarketReference>();
      for (const order of orders) {
        const exchangeOrderId = this._exchangeOrderId(order);
        const existing = exchangeOrderId
          ? tx
              .select({ orderId: walletOrders.orderId })
              .from(walletOrders)
              .where(
                and(
                  eq(walletOrders.walletId, walletId),
                  eq(walletOrders.exchangeOrderId, exchangeOrderId),
                ),
              )
              .get()
          : null;
        const id = existing?.orderId || this._orderId(order);
        const conditionId = this._conditionId(order);
        const marketReference = this._resolveMarketReference(conditionId, marketReferences);
        const status = this._syncedOrderStatus(order);
        const active = this._isActiveStatus(status);
        const createdAt = this._timestampMs(order.created_at, Date.now());
        const values = {
          walletId,
          orderId: id,
          conditionId,
          marketId: marketReference.marketId,
          eventId: marketReference.eventId,
          exchangeOrderId,
          active,
          status,
          orderType: this._orderType(order),
          side: this._nullableString(order.side),
          assetId: this._nullableString(order.asset_id || order.token_id),
          outcome: this._nullableString(order.outcome),
          price: this._nullableString(order.price),
          shares: this._nullableString(order.original_size),
          sizeMatched: this._nullableString(order.size_matched),
          amount: this._nullableString(order.amount),
          createdAt,
          owner: this._nullableString(order.owner),
          makerAddress: this._nullableString(order.maker_address),
          expiration: this._nullableString(order.expiration),
          associateTradesJson: this._nullableArrayJson(order.associate_trades),
          lastSeenAt: timestamp,
          updatedAt: timestamp,
        };

        if (existing) {
          tx.update(walletOrders)
            .set({
              exchangeOrderId,
              conditionId,
              marketId: values.marketId,
              eventId: values.eventId,
              active,
              status,
              orderType: values.orderType,
              side: values.side,
              assetId: values.assetId,
              outcome: values.outcome,
              price: values.price,
              shares: values.shares,
              sizeMatched: values.sizeMatched,
              amount: values.amount,
              createdAt: values.createdAt,
              owner: values.owner,
              makerAddress: values.makerAddress,
              expiration: values.expiration,
              associateTradesJson: values.associateTradesJson,
              lastSeenAt: timestamp,
              updatedAt: timestamp,
            })
            .where(and(eq(walletOrders.walletId, walletId), eq(walletOrders.orderId, id)))
            .run();
        } else {
          tx.insert(walletOrders)
            .values(values)
            .onConflictDoUpdate({
              target: [walletOrders.walletId, walletOrders.orderId],
              set: {
                exchangeOrderId,
                conditionId,
                marketId: values.marketId,
                eventId: values.eventId,
                active,
                status,
                orderType: values.orderType,
                side: values.side,
                assetId: values.assetId,
                outcome: values.outcome,
                price: values.price,
                shares: values.shares,
                sizeMatched: values.sizeMatched,
                amount: values.amount,
                createdAt: values.createdAt,
                owner: values.owner,
                makerAddress: values.makerAddress,
                expiration: values.expiration,
                associateTradesJson: values.associateTradesJson,
                lastSeenAt: timestamp,
                updatedAt: timestamp,
              },
            })
            .run();
        }
      }
    });
  }

  public upsertWalletTrades(walletId: string, trades: ClobTrade[]): void {
    const db = getDb();
    const timestamp = this._now();

    db.transaction((tx) => {
      const marketReferences = new Map<string, AccountMarketReference>();
      for (const trade of trades) {
        const id = this._tradeId(trade);
        const conditionId = this._tradeConditionId(trade);
        const marketReference = this._resolveMarketReference(conditionId, marketReferences);
        tx.insert(walletTrades)
          .values({
            walletId,
            tradeId: id,
            conditionId,
            marketId: marketReference.marketId,
            eventId: marketReference.eventId,
            takerOrderId: this._nullableString(trade.taker_order_id),
            assetId: this._nullableString(trade.asset_id),
            side: this._nullableString(trade.side),
            size: this._nullableString(trade.size),
            feeRateBps: this._nullableString(trade.fee_rate_bps),
            price: this._nullableString(trade.price),
            status: this._nullableString(trade.status),
            matchTime: this._matchTime(trade),
            lastUpdate: this._nullableString(trade.last_update),
            outcome: this._nullableString(trade.outcome),
            bucketIndex: this._nullableInteger(trade.bucket_index),
            owner: this._nullableString(trade.owner),
            makerAddress: this._nullableString(trade.maker_address),
            transactionHash: this._nullableString(trade.transaction_hash),
            traderSide: this._nullableString(trade.trader_side),
            makerOrdersJson: this._nullableArrayJson(trade.maker_orders),
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [walletTrades.walletId, walletTrades.tradeId],
            set: {
              conditionId,
              marketId: marketReference.marketId,
              eventId: marketReference.eventId,
              takerOrderId: this._nullableString(trade.taker_order_id),
              assetId: this._nullableString(trade.asset_id),
              side: this._nullableString(trade.side),
              size: this._nullableString(trade.size),
              feeRateBps: this._nullableString(trade.fee_rate_bps),
              price: this._nullableString(trade.price),
              status: this._nullableString(trade.status),
              matchTime: this._matchTime(trade),
              lastUpdate: this._nullableString(trade.last_update),
              outcome: this._nullableString(trade.outcome),
              bucketIndex: this._nullableInteger(trade.bucket_index),
              owner: this._nullableString(trade.owner),
              makerAddress: this._nullableString(trade.maker_address),
              transactionHash: this._nullableString(trade.transaction_hash),
              traderSide: this._nullableString(trade.trader_side),
              makerOrdersJson: this._nullableArrayJson(trade.maker_orders),
              updatedAt: timestamp,
            },
          })
          .run();
      }
    });
  }

  public upsertWalletPositions(walletId: string, positions: DataPosition[]): void {
    const db = getDb();
    const timestamp = this._now();

    db.transaction((tx) => {
      const marketReferences = new Map<string, AccountMarketReference>();
      for (const position of positions) {
        const id = this._positionId(position);
        const conditionId = this._positionConditionId(position);
        const marketReference = this._resolveMarketReference(conditionId, marketReferences);
        tx.insert(walletPositions)
          .values({
            walletId,
            positionId: id,
            conditionId,
            marketId: marketReference.marketId,
            eventId: marketReference.eventId,
            active: true,
            proxyWallet: this._nullableString(position.proxyWallet),
            asset: this._nullableString(position.asset),
            size: this._nullableNumber(position.size),
            avgPrice: this._nullableNumber(position.avgPrice),
            initialValue: this._nullableNumber(position.initialValue),
            currentValue: this._nullableNumber(position.currentValue),
            cashPnl: this._nullableNumber(position.cashPnl),
            percentPnl: this._nullableNumber(position.percentPnl),
            totalBought: this._nullableNumber(position.totalBought),
            realizedPnl: this._nullableNumber(position.realizedPnl),
            percentRealizedPnl: this._nullableNumber(position.percentRealizedPnl),
            curPrice: this._nullableNumber(position.curPrice),
            redeemable: position.redeemable,
            mergeable: position.mergeable,
            title: this._nullableString(position.title),
            slug: this._nullableString(position.slug),
            icon: this._nullableString(position.icon),
            eventSlug: this._nullableString(position.eventSlug),
            outcome: this._nullableString(position.outcome),
            outcomeIndex: this._nullableInteger(position.outcomeIndex),
            oppositeOutcome: this._nullableString(position.oppositeOutcome),
            oppositeAsset: this._nullableString(position.oppositeAsset),
            endDate: this._nullableString(position.endDate),
            negativeRisk: position.negativeRisk,
            lastSeenAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: [walletPositions.walletId, walletPositions.positionId],
            set: {
              conditionId,
              marketId: marketReference.marketId,
              eventId: marketReference.eventId,
              active: true,
              proxyWallet: this._nullableString(position.proxyWallet),
              asset: this._nullableString(position.asset),
              size: this._nullableNumber(position.size),
              avgPrice: this._nullableNumber(position.avgPrice),
              initialValue: this._nullableNumber(position.initialValue),
              currentValue: this._nullableNumber(position.currentValue),
              cashPnl: this._nullableNumber(position.cashPnl),
              percentPnl: this._nullableNumber(position.percentPnl),
              totalBought: this._nullableNumber(position.totalBought),
              realizedPnl: this._nullableNumber(position.realizedPnl),
              percentRealizedPnl: this._nullableNumber(position.percentRealizedPnl),
              curPrice: this._nullableNumber(position.curPrice),
              redeemable: position.redeemable,
              mergeable: position.mergeable,
              title: this._nullableString(position.title),
              slug: this._nullableString(position.slug),
              icon: this._nullableString(position.icon),
              eventSlug: this._nullableString(position.eventSlug),
              outcome: this._nullableString(position.outcome),
              outcomeIndex: this._nullableInteger(position.outcomeIndex),
              oppositeOutcome: this._nullableString(position.oppositeOutcome),
              oppositeAsset: this._nullableString(position.oppositeAsset),
              endDate: this._nullableString(position.endDate),
              negativeRisk: position.negativeRisk,
              lastSeenAt: timestamp,
              updatedAt: timestamp,
            },
          })
          .run();
      }
    });

    getSqlite()
      .prepare(
        'UPDATE wallet_positions SET active = 0, updated_at = @updatedAt WHERE wallet_id = @walletId AND last_seen_at <> @lastSeenAt',
      )
      .run({ walletId, lastSeenAt: timestamp, updatedAt: timestamp });
  }

  public listCachedOpenOrders(walletId: string, conditionId?: string): ClobOrder[] {
    const db = getDb();
    const clauses = [eq(walletOrders.walletId, walletId), eq(walletOrders.active, true)];
    const normalizedConditionId = this._nullableString(conditionId);
    if (normalizedConditionId) clauses.push(eq(walletOrders.conditionId, normalizedConditionId));
    const rows = db
      .select({
        walletId: walletOrders.walletId,
        orderId: walletOrders.orderId,
        conditionId: walletOrders.conditionId,
        marketId: walletOrders.marketId,
        eventId: walletOrders.eventId,
        eventTitle: events.title,
        eventIcon: events.image,
        marketQuestion: markets.question,
        marketGroupItemTitle: markets.groupItemTitle,
        marketIcon: markets.icon,
        marketImage: markets.image,
        marketClobTokenIds: markets.clobTokenIds,
        marketClobTokenIds0: markets.clobTokenIds0,
        marketClobTokenIds1: markets.clobTokenIds1,
        marketOutcomes: markets.outcomes,
        marketOutcomes0: markets.outcomes0,
        marketOutcomes1: markets.outcomes1,
        exchangeOrderId: walletOrders.exchangeOrderId,
        status: walletOrders.status,
        errorMessage: walletOrders.errorMessage,
        orderType: walletOrders.orderType,
        side: walletOrders.side,
        assetId: walletOrders.assetId,
        outcome: walletOrders.outcome,
        price: walletOrders.price,
        shares: walletOrders.shares,
        sizeMatched: walletOrders.sizeMatched,
        amount: walletOrders.amount,
        createdAt: walletOrders.createdAt,
        owner: walletOrders.owner,
        makerAddress: walletOrders.makerAddress,
        expiration: walletOrders.expiration,
        associateTradesJson: walletOrders.associateTradesJson,
        submittedAt: walletOrders.submittedAt,
      })
      .from(walletOrders)
      .leftJoin(markets, eq(walletOrders.marketId, markets.id))
      .leftJoin(events, eq(walletOrders.eventId, events.id))
      .where(and(...clauses))
      .orderBy(desc(walletOrders.createdAt), desc(walletOrders.lastSeenAt))
      .all();

    const orders = rows.map((row): ClobOrder => this._mapOrderRow(row));
    return orders.filter((order) => this._orderId(order));
  }

  public listActiveWalletOrdersMissingFromSnapshot(
    walletId: string,
    seenExchangeOrderIds: string[],
  ): ClobOrder[] {
    const seen = new Set(
      seenExchangeOrderIds
        .map((exchangeOrderId) => this._nullableString(exchangeOrderId))
        .filter((exchangeOrderId): exchangeOrderId is string => Boolean(exchangeOrderId)),
    );
    return this.listCachedOpenOrders(walletId).filter((order) => {
      const exchangeOrderId = this._nullableString(order.exchange_order_id);
      return Boolean(exchangeOrderId && !seen.has(exchangeOrderId));
    });
  }

  public listCachedTrades(walletId: string, limit = 500, conditionId?: string): ClobTrade[] {
    const db = getDb();
    const normalizedLimit = Math.max(1, Math.min(Math.trunc(limit) || 500, 1000));
    const clauses = [eq(walletTrades.walletId, walletId)];
    const normalizedConditionId = this._nullableString(conditionId);
    if (normalizedConditionId) clauses.push(eq(walletTrades.conditionId, normalizedConditionId));
    const rows = db
      .select({
        tradeId: walletTrades.tradeId,
        conditionId: walletTrades.conditionId,
        marketId: walletTrades.marketId,
        eventId: walletTrades.eventId,
        eventTitle: events.title,
        eventIcon: events.image,
        marketQuestion: markets.question,
        marketGroupItemTitle: markets.groupItemTitle,
        marketIcon: markets.icon,
        marketImage: markets.image,
        takerOrderId: walletTrades.takerOrderId,
        assetId: walletTrades.assetId,
        side: walletTrades.side,
        size: walletTrades.size,
        feeRateBps: walletTrades.feeRateBps,
        price: walletTrades.price,
        status: walletTrades.status,
        matchTime: walletTrades.matchTime,
        lastUpdate: walletTrades.lastUpdate,
        outcome: walletTrades.outcome,
        bucketIndex: walletTrades.bucketIndex,
        owner: walletTrades.owner,
        makerAddress: walletTrades.makerAddress,
        transactionHash: walletTrades.transactionHash,
        traderSide: walletTrades.traderSide,
        makerOrdersJson: walletTrades.makerOrdersJson,
      })
      .from(walletTrades)
      .leftJoin(markets, eq(walletTrades.marketId, markets.id))
      .leftJoin(events, eq(walletTrades.eventId, events.id))
      .where(and(...clauses))
      .orderBy(desc(walletTrades.matchTime), desc(walletTrades.updatedAt))
      .limit(normalizedLimit)
      .all();

    return this._sortByTimeDesc(
      rows.map((row): ClobTrade => this._mapTradeRow(row)),
      (trade) => trade.match_time,
    );
  }

  public listCachedPositions(walletId: string, conditionId?: string): DataPosition[] {
    const db = getDb();
    const clauses = [eq(walletPositions.walletId, walletId), eq(walletPositions.active, true)];
    const normalizedConditionId = this._nullableString(conditionId);
    if (normalizedConditionId) clauses.push(eq(walletPositions.conditionId, normalizedConditionId));
    const rows = db
      .select({
        positionId: walletPositions.positionId,
        conditionId: walletPositions.conditionId,
        marketId: walletPositions.marketId,
        eventId: walletPositions.eventId,
        eventTitle: events.title,
        eventIcon: events.image,
        marketQuestion: markets.question,
        marketGroupItemTitle: markets.groupItemTitle,
        marketIcon: markets.icon,
        marketImage: markets.image,
        proxyWallet: walletPositions.proxyWallet,
        asset: walletPositions.asset,
        size: walletPositions.size,
        avgPrice: walletPositions.avgPrice,
        initialValue: walletPositions.initialValue,
        currentValue: walletPositions.currentValue,
        cashPnl: walletPositions.cashPnl,
        percentPnl: walletPositions.percentPnl,
        totalBought: walletPositions.totalBought,
        realizedPnl: walletPositions.realizedPnl,
        percentRealizedPnl: walletPositions.percentRealizedPnl,
        curPrice: walletPositions.curPrice,
        redeemable: walletPositions.redeemable,
        mergeable: walletPositions.mergeable,
        title: walletPositions.title,
        slug: walletPositions.slug,
        icon: walletPositions.icon,
        eventSlug: walletPositions.eventSlug,
        outcome: walletPositions.outcome,
        outcomeIndex: walletPositions.outcomeIndex,
        oppositeOutcome: walletPositions.oppositeOutcome,
        oppositeAsset: walletPositions.oppositeAsset,
        endDate: walletPositions.endDate,
        negativeRisk: walletPositions.negativeRisk,
      })
      .from(walletPositions)
      .leftJoin(markets, eq(walletPositions.marketId, markets.id))
      .leftJoin(events, eq(walletPositions.eventId, events.id))
      .where(and(...clauses))
      .orderBy(desc(walletPositions.lastSeenAt))
      .all();

    return rows.map((row): DataPosition => this._mapPositionRow(row));
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _stableStringify(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this._stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${this._stableStringify(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private _hashValue(value: unknown): string {
    return createHash('sha256').update(this._stableStringify(value)).digest('hex');
  }

  private _parseJson<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private _parseJsonArray<T>(value: string | null): T[] | undefined {
    if (!value) return undefined;
    const parsed = this._parseJson<T[]>(value);
    return Array.isArray(parsed) ? parsed : undefined;
  }

  private _stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  private _nullableArrayJson(value: unknown[] | undefined): string | null {
    return Array.isArray(value) ? this._stringifyJson(value) : null;
  }

  private _resolveMarketReference(
    conditionId: string | null,
    cache?: Map<string, AccountMarketReference>,
  ): AccountMarketReference {
    const normalizedConditionId = this._nullableString(conditionId);
    if (!normalizedConditionId) return { marketId: null, eventId: null };
    const cached = cache?.get(normalizedConditionId);
    if (cached) return cached;

    const row = getDb()
      .select({ marketId: markets.id, eventId: markets.eventId })
      .from(markets)
      .where(eq(markets.conditionId, normalizedConditionId))
      .get();
    const reference: AccountMarketReference = {
      marketId: row?.marketId ?? null,
      eventId: row?.eventId ?? null,
    };
    cache?.set(normalizedConditionId, reference);
    return reference;
  }

  private _resolveOutcome(conditionId: string | null, assetId: string | null): string | null {
    const normalizedConditionId = this._nullableString(conditionId);
    if (!normalizedConditionId) return null;

    const row = getDb()
      .select({
        marketClobTokenIds: markets.clobTokenIds,
        marketClobTokenIds0: markets.clobTokenIds0,
        marketClobTokenIds1: markets.clobTokenIds1,
        marketOutcomes: markets.outcomes,
        marketOutcomes0: markets.outcomes0,
        marketOutcomes1: markets.outcomes1,
      })
      .from(markets)
      .where(eq(markets.conditionId, normalizedConditionId))
      .get();
    return row ? this._resolveOutcomeFromMarketRow({ assetId, ...row }) : null;
  }

  private _resolveOutcomeFromMarketRow(row: {
    assetId: string | null;
    marketClobTokenIds: string | null;
    marketClobTokenIds0: string | null;
    marketClobTokenIds1: string | null;
    marketOutcomes: string | null;
    marketOutcomes0: string | null;
    marketOutcomes1: string | null;
  }): string | null {
    const assetId = this._nullableString(row.assetId);
    if (!assetId) return null;

    if (assetId === this._nullableString(row.marketClobTokenIds0)) {
      return this._nullableString(row.marketOutcomes0);
    }
    if (assetId === this._nullableString(row.marketClobTokenIds1)) {
      return this._nullableString(row.marketOutcomes1);
    }

    const tokenIds = this._parseJsonArray<unknown>(row.marketClobTokenIds);
    const outcomes = this._parseJsonArray<unknown>(row.marketOutcomes);
    if (!tokenIds || !outcomes) return null;

    const index = tokenIds.findIndex((tokenId) => this._nullableString(tokenId) === assetId);
    if (index < 0) return null;
    return this._nullableString(outcomes[index]);
  }

  private _orderId(order: ClobOrder): string {
    return this._exchangeOrderId(order) || randomUUID();
  }

  private _mapOrderRow(row: {
    walletId: string;
    orderId: string;
    conditionId: string;
    marketId: string | null;
    eventId: string | null;
    eventTitle: string | null;
    eventIcon: string | null;
    marketQuestion: string | null;
    marketGroupItemTitle: string | null;
    marketIcon: string | null;
    marketImage: string | null;
    marketClobTokenIds: string | null;
    marketClobTokenIds0: string | null;
    marketClobTokenIds1: string | null;
    marketOutcomes: string | null;
    marketOutcomes0: string | null;
    marketOutcomes1: string | null;
    exchangeOrderId: string | null;
    status: AccountOrderStatus;
    errorMessage: string | null;
    orderType: string | null;
    side: string | null;
    assetId: string | null;
    outcome: string | null;
    price: string | null;
    shares: string | null;
    sizeMatched: string | null;
    amount: string | null;
    createdAt: number | null;
    owner: string | null;
    makerAddress: string | null;
    expiration: string | null;
    associateTradesJson: string | null;
    submittedAt: string | null;
  }): ClobOrder {
    return {
      id: row.exchangeOrderId || row.orderId,
      wallet_id: row.walletId,
      order_id: row.orderId,
      market_id: row.marketId ?? undefined,
      event_id: row.eventId ?? undefined,
      event_title: row.eventTitle ?? undefined,
      event_icon: row.eventIcon ?? undefined,
      market_title: this._marketTitle(row),
      market_icon: row.marketIcon ?? row.marketImage ?? undefined,
      exchange_order_id: row.exchangeOrderId,
      status: row.status,
      error_message: row.errorMessage ?? undefined,
      side: row.side ?? undefined,
      asset_id: row.assetId ?? undefined,
      token_id: row.assetId ?? undefined,
      market: row.conditionId,
      condition_id: row.conditionId,
      price: row.price ?? undefined,
      original_size: row.shares ?? undefined,
      size_matched: row.sizeMatched ?? undefined,
      amount: row.amount ?? undefined,
      order_type: row.orderType ?? undefined,
      outcome: row.outcome ?? this._resolveOutcomeFromMarketRow(row) ?? undefined,
      created_at: row.createdAt ?? row.submittedAt ?? undefined,
      owner: row.owner ?? undefined,
      maker_address: row.makerAddress ?? undefined,
      expiration: row.expiration ?? undefined,
      associate_trades: this._parseJsonArray<string>(row.associateTradesJson),
    };
  }

  private _mapTradeRow(row: {
    tradeId: string;
    conditionId: string | null;
    marketId: string | null;
    eventId: string | null;
    eventTitle: string | null;
    eventIcon: string | null;
    marketQuestion: string | null;
    marketGroupItemTitle: string | null;
    marketIcon: string | null;
    marketImage: string | null;
    takerOrderId: string | null;
    assetId: string | null;
    side: string | null;
    size: string | null;
    feeRateBps: string | null;
    price: string | null;
    status: string | null;
    matchTime: string | null;
    lastUpdate: string | null;
    outcome: string | null;
    bucketIndex: number | null;
    owner: string | null;
    makerAddress: string | null;
    transactionHash: string | null;
    traderSide: string | null;
    makerOrdersJson: string | null;
  }): ClobTrade {
    return {
      id: row.tradeId,
      market_id: row.marketId ?? undefined,
      event_id: row.eventId ?? undefined,
      event_title: row.eventTitle ?? undefined,
      event_icon: row.eventIcon ?? undefined,
      market_title: this._marketTitle(row),
      market_icon: row.marketIcon ?? row.marketImage ?? undefined,
      taker_order_id: row.takerOrderId ?? undefined,
      conditionId: row.conditionId ?? undefined,
      condition_id: row.conditionId ?? undefined,
      market: row.conditionId ?? undefined,
      asset_id: row.assetId ?? undefined,
      side: row.side ?? undefined,
      size: row.size ?? undefined,
      fee_rate_bps: row.feeRateBps ?? undefined,
      price: row.price ?? undefined,
      status: row.status ?? undefined,
      match_time: row.matchTime ?? undefined,
      last_update: row.lastUpdate ?? undefined,
      outcome: row.outcome ?? undefined,
      bucket_index: row.bucketIndex ?? undefined,
      owner: row.owner ?? undefined,
      maker_address: row.makerAddress ?? undefined,
      transaction_hash: row.transactionHash ?? undefined,
      trader_side: row.traderSide ?? undefined,
      maker_orders: this._parseJsonArray<ClobTradeMakerOrder>(row.makerOrdersJson),
    };
  }

  private _mapPositionRow(row: {
    positionId: string;
    conditionId: string | null;
    marketId: string | null;
    eventId: string | null;
    eventTitle: string | null;
    eventIcon: string | null;
    marketQuestion: string | null;
    marketGroupItemTitle: string | null;
    marketIcon: string | null;
    marketImage: string | null;
    proxyWallet: string | null;
    asset: string | null;
    size: number | null;
    avgPrice: number | null;
    initialValue: number | null;
    currentValue: number | null;
    cashPnl: number | null;
    percentPnl: number | null;
    totalBought: number | null;
    realizedPnl: number | null;
    percentRealizedPnl: number | null;
    curPrice: number | null;
    redeemable: boolean | null;
    mergeable: boolean | null;
    title: string | null;
    slug: string | null;
    icon: string | null;
    eventSlug: string | null;
    outcome: string | null;
    outcomeIndex: number | null;
    oppositeOutcome: string | null;
    oppositeAsset: string | null;
    endDate: string | null;
    negativeRisk: boolean | null;
  }): DataPosition {
    return {
      market_id: row.marketId ?? undefined,
      event_id: row.eventId ?? undefined,
      event_title: row.eventTitle ?? undefined,
      event_icon: row.eventIcon ?? undefined,
      market_title: this._marketTitle(row),
      market_icon: row.marketIcon ?? row.marketImage ?? undefined,
      proxyWallet: row.proxyWallet ?? undefined,
      asset: row.asset ?? undefined,
      conditionId: row.conditionId ?? undefined,
      size: row.size ?? undefined,
      avgPrice: row.avgPrice ?? undefined,
      initialValue: row.initialValue ?? undefined,
      currentValue: row.currentValue ?? undefined,
      cashPnl: row.cashPnl ?? undefined,
      percentPnl: row.percentPnl ?? undefined,
      totalBought: row.totalBought ?? undefined,
      realizedPnl: row.realizedPnl ?? undefined,
      percentRealizedPnl: row.percentRealizedPnl ?? undefined,
      curPrice: row.curPrice ?? undefined,
      redeemable: row.redeemable ?? undefined,
      mergeable: row.mergeable ?? undefined,
      title: row.title ?? undefined,
      slug: row.slug ?? undefined,
      icon: row.icon ?? undefined,
      eventSlug: row.eventSlug ?? undefined,
      outcome: row.outcome ?? undefined,
      outcomeIndex: row.outcomeIndex ?? undefined,
      oppositeOutcome: row.oppositeOutcome ?? undefined,
      oppositeAsset: row.oppositeAsset ?? undefined,
      endDate: row.endDate ?? undefined,
      negativeRisk: row.negativeRisk ?? undefined,
    };
  }

  private _marketTitle(row: {
    marketQuestion: string | null;
    marketGroupItemTitle: string | null;
  }): string | undefined {
    return row.marketQuestion ?? row.marketGroupItemTitle ?? undefined;
  }

  private _exchangeOrderId(order: ClobOrder): string | null {
    const record = order as unknown as Record<string, unknown>;
    return (
      String(
        order.id ||
          record.orderID ||
          record.orderId ||
          record.order_id ||
          record.orderHash ||
          record.hash ||
          '',
      ) || null
    );
  }

  private _conditionId(order: ClobOrder): string {
    const record = order as unknown as Record<string, unknown>;
    const value = this._nullableString(order.market || record.conditionId || record.condition_id);
    if (!value) throw new Error('Synced order is missing condition ID');
    return value;
  }

  private _syncedOrderStatus(order: ClobOrder): AccountOrderStatus {
    const record = order as unknown as Record<string, unknown>;
    const value = String(record.status || '').toLowerCase();
    if (this._isAccountOrderStatus(value)) return value;
    return 'live';
  }

  private _isAccountOrderStatus(value: string): value is AccountOrderStatus {
    return [
      'pending',
      'submitting',
      'submitted',
      'live',
      'matched',
      'delayed',
      'unmatched',
      'submit-failed',
      'failed',
      'rejected',
      'canceled',
    ].includes(value);
  }

  private _isActiveStatus(status: AccountOrderStatus): boolean {
    return [
      'pending',
      'submitting',
      'submitted',
      'live',
      'delayed',
      'unmatched',
      'submit-failed',
    ].includes(status);
  }

  private _orderType(order: ClobOrder): string | null {
    const record = order as unknown as Record<string, unknown>;
    const value = record.orderType || record.order_type || record.type;
    return this._nullableString(value);
  }

  private _orderPrice(input: StrategyPlaceOrderInput): number | undefined {
    return input.orderType === 'limit' ? input.price : undefined;
  }

  private _orderShares(input: StrategyPlaceOrderInput): number | undefined {
    return input.orderType === 'limit' ? input.shares : undefined;
  }

  private _orderAmount(input: StrategyPlaceOrderInput): number | undefined {
    return input.orderType === 'market' ? input.amount : undefined;
  }

  private _nullableString(value: unknown): string | null {
    return value == null || value === '' ? null : String(value);
  }

  private _nullableNumber(value: unknown): number | null {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private _nullableInteger(value: unknown): number | null {
    const normalized = Number(value);
    return Number.isInteger(normalized) ? normalized : null;
  }

  private _timestampMs(value: unknown, fallback?: number): number | null {
    if (value == null || value === '') return fallback ?? null;
    if (value instanceof Date) return value.getTime();

    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? Math.trunc(numeric * 1000) : Math.trunc(numeric);
    }

    const parsed = new Date(String(value)).getTime();
    if (Number.isFinite(parsed)) return parsed;
    return fallback ?? null;
  }

  private _tradeId(trade: ClobTrade): string {
    const existing = trade.id;
    if (existing) return String(existing);
    return this._hashValue(trade);
  }

  private _tradeConditionId(trade: ClobTrade): string | null {
    return this._nullableString(trade.conditionId || trade.condition_id || trade.market);
  }

  private _positionId(position: DataPosition): string {
    const parts = [
      position.conditionId,
      position.asset,
      position.outcomeIndex,
      position.outcome,
    ].filter((part) => part != null && part !== '');
    return parts.length ? parts.map(String).join(':') : this._hashValue(position);
  }

  private _positionConditionId(position: DataPosition): string | null {
    return this._nullableString(position.conditionId);
  }

  private _matchTime(trade: ClobTrade): string | null {
    const value = trade.match_time;
    return value == null ? null : String(value);
  }

  private _sortByTimeDesc<T>(items: T[], getValue: (item: T) => unknown): T[] {
    return [...items].sort((a, b) => {
      const left =
        Number(new Date(String(getValue(a) ?? '')).getTime()) || Number(getValue(a)) || 0;
      const right =
        Number(new Date(String(getValue(b) ?? '')).getTime()) || Number(getValue(b)) || 0;
      return right - left;
    });
  }
}

export { SqliteAccountDataRepository };
