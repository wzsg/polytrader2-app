import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { compileStrategySource, strategyCatalogService } from '@polytrader/strategy-runtime';
import { createSqliteEventRepository } from '@polytrader/sqlite-repository';
import { DEFAULT_STRATEGY_SOURCE, parseJsonArray, STRATEGY_CONTEXT_DTS } from '@polytrader/shared';
import type { DbMarket, StrategyBotListParams, StrategyRunListParams } from '@polytrader/shared';
import { botRuntimeService, strategyRunHistoryService } from '../services/strategyRuntime.js';

const STRATEGY_DOC_URI = 'polytrader://strategy/docs';
const STRATEGY_DTS_URI = 'polytrader://strategy/context.d.ts';
const STRATEGY_TEMPLATE_URI = 'polytrader://strategy/default-template.ts';
const PRODUCT_NAME = 'Polytrader2';
const PRODUCT_ALIAS = 'p2';
const eventRepository = createSqliteEventRepository();

type McpMarketInfo = {
  id: string;
  conditionId: string | null;
  title: string;
  active: boolean;
  closed: boolean;
  assetIds: string[];
  outcomes: Array<{ assetId: string; label: string; price: unknown }>;
};

class PolytraderMcpToolRegistrar {
  private readonly _server: McpServer;

  public constructor(server: McpServer) {
    this._server = server;
  }

  public register(): void {
    this._registerStrategyDocumentation();
    this._registerMarketTools();
    this._registerStrategyTools();
    this._registerBotTools();
    this._registerStrategyRunTools();
  }

  private _registerStrategyDocumentation(): void {
    this._server.registerResource(
      'strategy_authoring_guide',
      STRATEGY_DOC_URI,
      {
        title: 'Polytrader2 Strategy Authoring Guide',
        description:
          'Required guidance for writing Polytrader2 (p2) strategy source code with MCP tools.',
        mimeType: 'text/markdown',
      },
      (uri) => this._textResource(uri, this._strategyGuideMarkdown(), 'text/markdown'),
    );

    this._server.registerResource(
      'strategy_context_dts',
      STRATEGY_DTS_URI,
      {
        title: 'Polytrader2 Strategy Context DTS',
        description:
          'TypeScript declarations available to Polytrader2 (p2) strategy source code. Read this before creating or updating a strategy.',
        mimeType: 'text/typescript',
      },
      (uri) => this._textResource(uri, STRATEGY_CONTEXT_DTS, 'text/typescript'),
    );

    this._server.registerResource(
      'strategy_default_template',
      STRATEGY_TEMPLATE_URI,
      {
        title: 'Polytrader2 Default Strategy Template',
        description:
          'Default TypeScript strategy template used by the Polytrader2 (p2) desktop strategy editor.',
        mimeType: 'text/typescript',
      },
      (uri) => this._textResource(uri, DEFAULT_STRATEGY_SOURCE, 'text/typescript'),
    );
  }

  private _registerMarketTools(): void {
    this._server.registerTool(
      'market_get_by_condition',
      {
        title: 'Get Market By Condition',
        description:
          'Resolve a Polymarket conditionId to the local market record and available assetId values.',
        inputSchema: {
          conditionId: z.string().min(1).describe('Polymarket conditionId'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ conditionId }) => this._json(await this._marketByConditionId(conditionId)),
    );
  }

  private _registerStrategyTools(): void {
    this._server.registerTool(
      'strategy_list',
      {
        title: 'List Strategies',
        description: 'List locally saved strategy assets.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => this._json(await strategyCatalogService.listStrategies()),
    );

    this._server.registerTool(
      'strategy_get',
      {
        title: 'Get Strategy',
        description: 'Get a strategy asset, including source code and compile status.',
        inputSchema: {
          id: z.string().min(1).describe('Strategy ID'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ id }) => this._json(await strategyCatalogService.getStrategy(id)),
    );

    this._server.registerTool(
      'strategy_create',
      {
        title: 'Create Strategy',
        description:
          'Create a Polytrader2 (p2) strategy asset and compile its source code. If the user asks for a p2 strategy, they mean a Polytrader2 strategy. Before writing sourceCode, read MCP resources polytrader://strategy/docs, polytrader://strategy/context.d.ts, and polytrader://strategy/default-template.ts.',
        inputSchema: {
          name: z.string().min(1).describe('Strategy name'),
          sourceCode: z.string().min(1).describe('TypeScript strategy source code'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async (input) => this._json(await strategyCatalogService.createStrategy(input)),
    );

    this._server.registerTool(
      'strategy_update',
      {
        title: 'Update Strategy',
        description:
          'Update a Polytrader2 (p2) strategy asset. If the user asks to modify a p2 strategy, they mean a Polytrader2 strategy. Pass expectedVersion to avoid overwriting newer edits. Before changing sourceCode, read MCP resources polytrader://strategy/docs and polytrader://strategy/context.d.ts.',
        inputSchema: {
          id: z.string().min(1).describe('Strategy ID'),
          name: z.string().min(1).optional().describe('New strategy name'),
          sourceCode: z.string().min(1).optional().describe('New TypeScript strategy source code'),
          expectedVersion: z.number().int().positive().optional().describe('Known current version'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async (input) => this._json(await strategyCatalogService.updateStrategy(input)),
    );

    this._server.registerTool(
      'strategy_compile',
      {
        title: 'Compile Strategy Source',
        description:
          'Compile Polytrader2 (p2) strategy source code without saving it. Use this after drafting against polytrader://strategy/context.d.ts.',
        inputSchema: {
          sourceCode: z.string().min(1).describe('TypeScript strategy source code'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ sourceCode }) => this._json(compileStrategySource(sourceCode)),
    );

    this._server.registerTool(
      'strategy_versions',
      {
        title: 'List Strategy Versions',
        description: 'List saved versions for a strategy asset.',
        inputSchema: {
          strategyId: z.string().min(1).describe('Strategy ID'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ strategyId }) =>
        this._json(await strategyCatalogService.listStrategyVersions(strategyId)),
    );
  }

  private _registerBotTools(): void {
    const botStatus = z.enum(['idle', 'starting', 'running', 'stopping', 'stopped', 'error']);

    this._server.registerTool(
      'bot_list',
      {
        title: 'List Bots',
        description:
          'List strategy bots. Use conditionId when the caller only knows the Polymarket condition.',
        inputSchema: {
          conditionId: z.string().min(1).optional().describe('Polymarket conditionId'),
          marketId: z.string().min(1).optional().describe('Local market ID'),
          eventId: z.string().min(1).optional().describe('Local event ID'),
          strategyId: z.string().min(1).optional().describe('Strategy ID'),
          walletId: z.string().min(1).optional().describe('Account ID'),
          status: botStatus.optional().describe('Bot runtime status'),
          autoStart: z.boolean().optional().describe('Filter by auto-start setting'),
          enabled: z.boolean().optional().describe('Filter by enabled setting'),
          limit: z.number().int().positive().max(1_000).optional().describe('Maximum rows'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) =>
        this._json(await botRuntimeService.listBots(await this._botListParams(input))),
    );

    this._server.registerTool(
      'bot_create',
      {
        title: 'Create Bot',
        description:
          'Create a bot for a conditionId and required Polymarket CLOB assetId. assetId must belong to the conditionId market.',
        inputSchema: {
          name: z.string().min(1).describe('Bot name'),
          conditionId: z.string().min(1).describe('Polymarket conditionId'),
          assetId: z.string().min(1).describe('Polymarket CLOB token ID for the selected outcome'),
          strategyId: z.string().min(1).describe('Strategy ID'),
          strategyVersion: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional()
            .describe('Strategy version'),
          walletId: z.string().min(1).describe('Trading account ID'),
          config: z.string().optional().describe('Strategy config JSON object as a string'),
          autoStart: z.boolean().optional().describe('Whether this bot starts automatically'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async (input) => this._json(await botRuntimeService.createBot(input)),
    );

    this._server.registerTool(
      'bot_update',
      {
        title: 'Update Bot',
        description: 'Update a stopped bot. Running bots must be stopped before editing.',
        inputSchema: {
          id: z.string().min(1).describe('Bot ID'),
          name: z.string().min(1).optional().describe('New bot name'),
          assetId: z.string().min(1).optional().describe('New Polymarket CLOB token ID'),
          strategyId: z.string().min(1).optional().describe('New strategy ID'),
          strategyVersion: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional()
            .describe('Strategy version'),
          walletId: z.string().min(1).optional().describe('Trading account ID'),
          config: z.string().optional().describe('Strategy config JSON object as a string'),
          autoStart: z.boolean().optional().describe('Whether this bot starts automatically'),
          enabled: z.boolean().optional().describe('Whether this bot can run'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async (input) => this._json(await botRuntimeService.updateBot(input)),
    );

    this._server.registerTool(
      'bot_start',
      {
        title: 'Start Bot',
        description:
          'Start a bot. The strategy may place real orders through its configured account.',
        inputSchema: {
          id: z.string().min(1).describe('Bot ID'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      async ({ id }) => this._json(await botRuntimeService.startBot(id)),
    );

    this._server.registerTool(
      'bot_stop',
      {
        title: 'Stop Bot',
        description: 'Stop a running bot.',
        inputSchema: {
          id: z.string().min(1).describe('Bot ID'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async ({ id }) => this._json(await botRuntimeService.stopBot(id)),
    );

    this._server.registerTool(
      'bot_active_run',
      {
        title: 'Get Bot Active Run',
        description: 'Get the active strategy run for a bot, if any.',
        inputSchema: {
          id: z.string().min(1).describe('Bot ID'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ id }) => this._json(await botRuntimeService.getActiveRun(id)),
    );

    this._server.registerTool(
      'bot_runs',
      {
        title: 'List Bot Runs',
        description: 'List run history for a bot.',
        inputSchema: {
          botId: z.string().min(1).describe('Bot ID'),
          limit: z.number().int().positive().max(1_000).optional().describe('Maximum rows'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ botId, limit }) => this._json(await botRuntimeService.listRuns(botId, limit)),
    );
  }

  private _registerStrategyRunTools(): void {
    this._server.registerTool(
      'strategy_run_history',
      {
        title: 'List Strategy Run History',
        description: 'List persisted strategy run records.',
        inputSchema: {
          conditionId: z.string().min(1).optional().describe('Polymarket conditionId'),
          marketId: z.string().min(1).optional().describe('Local market ID'),
          eventId: z.string().min(1).optional().describe('Local event ID'),
          botId: z.string().min(1).optional().describe('Bot ID'),
          strategyId: z.string().min(1).optional().describe('Strategy ID'),
          walletId: z.string().min(1).optional().describe('Account ID'),
          limit: z.number().int().positive().max(500).optional().describe('Maximum rows'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) =>
        this._json(await strategyRunHistoryService.listHistory(await this._runListParams(input))),
    );

    this._server.registerTool(
      'strategy_run_logs',
      {
        title: 'Get Strategy Run Logs',
        description: 'Get logs for a strategy run.',
        inputSchema: {
          runId: z.string().min(1).describe('Strategy run ID'),
          limit: z.number().int().positive().max(1_000).optional().describe('Maximum rows'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ runId, limit }) => this._json(await strategyRunHistoryService.getLogs(runId, limit)),
    );

    this._server.registerTool(
      'strategy_run_orders',
      {
        title: 'Get Strategy Run Orders',
        description: 'Get order records created by a strategy run.',
        inputSchema: {
          runId: z.string().min(1).describe('Strategy run ID'),
          limit: z.number().int().positive().max(1_000).optional().describe('Maximum rows'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ runId, limit }) =>
        this._json(await strategyRunHistoryService.getOrders(runId, limit)),
    );
  }

  private async _botListParams(
    input: StrategyBotListParams & { conditionId?: string },
  ): Promise<StrategyBotListParams> {
    const marketId = input.conditionId
      ? (await this._marketByConditionId(input.conditionId)).id
      : input.marketId;
    return {
      marketId,
      eventId: input.eventId,
      strategyId: input.strategyId,
      walletId: input.walletId,
      status: input.status,
      autoStart: input.autoStart,
      enabled: input.enabled,
      limit: input.limit,
    };
  }

  private async _runListParams(
    input: StrategyRunListParams & { conditionId?: string },
  ): Promise<StrategyRunListParams> {
    const marketId = input.conditionId
      ? (await this._marketByConditionId(input.conditionId)).id
      : input.marketId;
    return {
      marketId,
      eventId: input.eventId,
      botId: input.botId,
      strategyId: input.strategyId,
      walletId: input.walletId,
      limit: input.limit,
    };
  }

  private async _marketByConditionId(conditionId: string): Promise<McpMarketInfo> {
    const normalized = conditionId.trim();
    if (!normalized) throw new Error('conditionId is required');
    const row = await eventRepository.getMarketByConditionId(normalized);
    if (!row) throw new Error(`Market does not exist for conditionId: ${normalized}`);
    return this._mapMarket(row);
  }

  private _mapMarket(row: DbMarket): McpMarketInfo {
    const assetIds = this._marketAssetIds(row);
    const outcomes = parseJsonArray(row.outcomes);
    const prices = parseJsonArray(row.outcomePrices);
    return {
      id: row.id,
      conditionId: row.conditionId,
      title: row.groupItemTitle || row.question || row.slug || row.id,
      active: row.active,
      closed: row.closed,
      assetIds,
      outcomes: assetIds.map((assetId, index) => ({
        assetId,
        label: outcomes[index] == null ? `Outcome ${index + 1}` : String(outcomes[index]),
        price: prices[index] ?? null,
      })),
    };
  }

  private _marketAssetIds(row: DbMarket): string[] {
    const ids = new Set<string>();
    for (const tokenId of parseJsonArray(row.clobTokenIds)) {
      this._addText(ids, tokenId);
    }
    this._addText(ids, row.clobTokenIds0);
    this._addText(ids, row.clobTokenIds1);
    return [...ids];
  }

  private _addText(values: Set<string>, value: unknown): void {
    const normalized = String(value ?? '').trim();
    if (normalized) values.add(normalized);
  }

  private _json(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private _textResource(
    uri: URL,
    text: string,
    mimeType: string,
  ): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType,
          text,
        },
      ],
    };
  }

  private _strategyGuideMarkdown(): string {
    return [
      '# Polytrader2 Strategy Authoring',
      '',
      `${PRODUCT_NAME} is the project name. Users may call it \`${PRODUCT_ALIAS}\`. When a user asks to write, create, update, inspect, or run a \`${PRODUCT_ALIAS}\` strategy or bot, interpret that as a ${PRODUCT_NAME} strategy or bot in this MCP server.`,
      '',
      'Read these resources before creating or updating strategy source code:',
      '',
      `- \`${STRATEGY_DTS_URI}\`: TypeScript declarations available in the strategy sandbox.`,
      `- \`${STRATEGY_TEMPLATE_URI}\`: The default strategy template used by the desktop editor.`,
      '',
      'Strategy source must export a class named `Strategy` that extends `StrategyBase`.',
      'Do not import packages or Node/Electron APIs. Use the injected `StrategyContext` instead.',
      '',
      'Important runtime inputs:',
      '',
      '- `ctx.assetId` is the required selected Polymarket CLOB token ID for the bot outcome.',
      '- `ctx.outcomes` lists market outcomes and token IDs.',
      '- `ctx.marketData.loadMarketDetail(...)`, `loadPriceHistory(...)`, and `loadTrades(...)` load explicit market data domains.',
      '- `ctx.trading.placeOrder(...)` can place real orders for the configured account.',
      '- `ctx.logger.debug/info/warn/error(...)` writes strategy run logs.',
      '',
      'Recommended workflow for AI agents:',
      '',
      '1. Read `polytrader://strategy/context.d.ts`.',
      '2. Read `polytrader://strategy/default-template.ts`.',
      '3. Draft source code by extending the template.',
      '4. Call `strategy_compile`.',
      '5. Only call `strategy_create` or `strategy_update` after compilation succeeds.',
      '',
      'Trading safety:',
      '',
      '- Never place orders unless the user explicitly asked for a live-trading strategy.',
      '- Prefer logging and dry-run calculations in generated examples.',
      '- When placing orders, use `ctx.assetId` or an asset ID selected from `ctx.outcomes` for the same market.',
    ].join('\n');
  }
}

function createPolytraderMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'Polytrader2',
      version: '1.0.0',
      title: 'Polytrader2 (p2) MCP Server',
    },
    {
      capabilities: { logging: {} },
    },
  );
  new PolytraderMcpToolRegistrar(server).register();
  return server;
}

export { createPolytraderMcpServer };
