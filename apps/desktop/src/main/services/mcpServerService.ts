import { McpServerManager } from '@polytrader/mcp-server';
import {
  createSqliteEventRepository,
  createSqliteMcpServerAccessLogRepository,
  createSqliteMetaRepository,
} from '@polytrader/sqlite-repository';
import { compileStrategySource, strategyCatalogService } from '@polytrader/strategy-runtime';
import { botRuntimeService, strategyRunHistoryService } from './strategyRuntime.js';

const mcpServerManager = new McpServerManager({
  metaRepository: createSqliteMetaRepository(),
  accessLogRepository: createSqliteMcpServerAccessLogRepository(),
  ports: {
    market: createSqliteEventRepository(),
    strategyCatalog: strategyCatalogService,
    botRuntime: botRuntimeService,
    strategyRun: strategyRunHistoryService,
    compileStrategySource,
  },
});

export { mcpServerManager };
