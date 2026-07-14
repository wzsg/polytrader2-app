import type {
  EventRepository,
  McpServerAccessLogRepository,
  MetaRepository,
} from '@polytrader/repository-contract';
import type { StrategyCompileResult } from '@polytrader/shared';
import type {
  StrategyBotRuntimeService,
  StrategyCatalogService,
  StrategyRunHistoryService,
} from '@polytrader/strategy-runtime';

type McpMarketPort = Pick<EventRepository, 'getMarketByConditionId'>;
type McpStrategyCatalogPort = Pick<
  StrategyCatalogService,
  'listStrategies' | 'getStrategy' | 'createStrategy' | 'updateStrategy' | 'listStrategyVersions'
>;
type McpBotRuntimePort = Pick<
  StrategyBotRuntimeService,
  'listBots' | 'createBot' | 'updateBot' | 'startBot' | 'stopBot' | 'getActiveRun' | 'listRuns'
>;
type McpStrategyRunPort = Pick<StrategyRunHistoryService, 'listHistory' | 'getLogs' | 'getOrders'>;

interface PolytraderMcpPorts {
  market: McpMarketPort;
  strategyCatalog: McpStrategyCatalogPort;
  botRuntime: McpBotRuntimePort;
  strategyRun: McpStrategyRunPort;
  compileStrategySource: (sourceCode: string) => StrategyCompileResult;
}

interface McpServerManagerOptions {
  metaRepository: MetaRepository;
  accessLogRepository: McpServerAccessLogRepository;
  ports: PolytraderMcpPorts;
}

interface McpClientCredential {
  clientId: string;
  token: string;
  created: boolean;
}

export type {
  McpBotRuntimePort,
  McpClientCredential,
  McpMarketPort,
  McpServerManagerOptions,
  McpStrategyCatalogPort,
  McpStrategyRunPort,
  PolytraderMcpPorts,
};
