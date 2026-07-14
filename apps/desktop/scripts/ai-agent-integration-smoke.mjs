import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { AiAgentIntegrationService } from '@polytrader/app-preferences';
import { McpServerManager } from '@polytrader/mcp-server';

class MemoryMetaRepository {
  #values = new Map();

  async getMetaValue(key) {
    return this.#values.get(key) ?? null;
  }

  async setMetaValue(key, value) {
    this.#values.set(key, value);
  }
}

class MemoryAccessLogRepository {
  records = [];

  async insertLog(input) {
    this.records.push(input);
  }

  async listLogs() {
    return this.records;
  }
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 18708;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function writeFakeCommands(binDirectory) {
  await mkdir(binDirectory, { recursive: true });
  const commands = ['codex', 'opencode', 'cursor'];
  await Promise.all(
    commands.map((command) =>
      writeFile(join(binDirectory, `${command}.cmd`), `@echo ${command} 1.0.0\r\n`, 'utf8'),
    ),
  );
}

async function runAgentConfigSmoke(root) {
  const binDirectory = join(root, 'bin');
  const localAppData = join(root, 'AppData', 'Local');
  const appData = join(root, 'AppData', 'Roaming');
  await writeFakeCommands(binDirectory);
  await mkdir(join(localAppData, 'AnthropicClaude'), { recursive: true });
  await writeFile(join(localAppData, 'AnthropicClaude', 'claude.exe'), '', 'utf8');
  await mkdir(join(root, '.codex'), { recursive: true });
  await mkdir(join(root, '.config', 'opencode'), { recursive: true });
  await writeFile(join(root, '.codex', 'config.toml'), '# keep-codex-setting\nmodel = "test"\n');
  await writeFile(
    join(root, '.config', 'opencode', 'opencode.jsonc'),
    '{\n  // keep-opencode-comment\n  "mcp": {}\n}\n',
  );
  const environment = {
    ...process.env,
    PATH: `${binDirectory}${delimiter}${process.env.PATH || ''}`,
    LOCALAPPDATA: localAppData,
    APPDATA: appData,
  };
  const service = new AiAgentIntegrationService({
    homeDirectory: root,
    environment,
    platform: 'win32',
    claudeDesktopBridge: {
      command: 'C:\\Program Files\\Polytrader2\\Polytrader2.exe',
      scriptPath: 'C:\\Program Files\\Polytrader2\\resources\\mcp-stdio-bridge.js',
    },
  });
  const initial = await service.detectAll();
  assert.equal(initial.length, 4);
  assert.ok(initial.every((status) => status.installed));

  for (const status of initial) {
    const connection = {
      endpoint: 'http://127.0.0.1:18708/mcp',
      bearerToken: `token-${status.id}`,
    };
    const configured = await service.configure(status.id, connection);
    assert.equal(configured.configState, 'configured');
    const detected = await service.detect(status.id, connection);
    assert.equal(detected.configState, 'configured');
  }

  const codexConfig = await readFile(join(root, '.codex', 'config.toml'), 'utf8');
  assert.match(codexConfig, /keep-codex-setting/u);
  assert.match(codexConfig, /mcp_servers\.polytrader2/u);
  const openCodeConfig = await readFile(
    join(root, '.config', 'opencode', 'opencode.jsonc'),
    'utf8',
  );
  assert.match(openCodeConfig, /keep-opencode-comment/u);
  const claudeDesktopConfig = JSON.parse(
    await readFile(join(appData, 'Claude', 'claude_desktop_config.json'), 'utf8'),
  );
  assert.deepEqual(claudeDesktopConfig.mcpServers.polytrader2, {
    command: 'C:\\Program Files\\Polytrader2\\Polytrader2.exe',
    args: [
      'C:\\Program Files\\Polytrader2\\resources\\mcp-stdio-bridge.js',
      '--endpoint',
      'http://127.0.0.1:18708/mcp',
      '--token',
      'token-claude-desktop',
    ],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  });

  const stale = await service.detect('cursor', {
    endpoint: 'http://127.0.0.1:18708/mcp',
    bearerToken: 'rotated-token',
  });
  assert.equal(stale.configState, 'update-required');

  for (const status of initial) {
    const connection = {
      endpoint: 'http://127.0.0.1:18708/mcp',
      bearerToken: `token-${status.id}`,
    };
    const removed = await service.remove(status.id, connection);
    assert.equal(removed.configState, 'not-configured');
  }
}

async function runMacClaudeDesktopDetectionSmoke(root) {
  const homeDirectory = join(root, 'mac-home');
  const applicationPath = join(homeDirectory, 'Applications', 'Claude.app');
  await mkdir(join(applicationPath, 'Contents'), { recursive: true });
  await writeFile(
    join(applicationPath, 'Contents', 'Info.plist'),
    '<plist><dict><key>CFBundleShortVersionString</key><string>1.2.3</string></dict></plist>',
    'utf8',
  );
  const service = new AiAgentIntegrationService({
    homeDirectory,
    environment: { PATH: '' },
    platform: 'darwin',
    claudeDesktopBridge: {
      command: '/Applications/Polytrader2.app/Contents/MacOS/Polytrader2',
      scriptPath: '/Applications/Polytrader2.app/Contents/Resources/mcp-stdio-bridge.js',
    },
  });
  const status = await service.detect('claude-desktop');
  assert.equal(status.installed, true);
  assert.equal(status.executablePath, applicationPath);
  assert.equal(status.version, '1.2.3');
  assert.equal(
    status.configPath,
    join(homeDirectory, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  );
}

async function runMcpCredentialSmoke() {
  const port = await findAvailablePort();
  const metaRepository = new MemoryMetaRepository();
  const accessLogRepository = new MemoryAccessLogRepository();
  const unsupported = async () => {
    throw new Error('Not used by smoke test');
  };
  const manager = new McpServerManager({
    metaRepository,
    accessLogRepository,
    ports: {
      market: { getMarketByConditionId: unsupported },
      strategyCatalog: {
        listStrategies: unsupported,
        getStrategy: unsupported,
        createStrategy: unsupported,
        updateStrategy: unsupported,
        listStrategyVersions: unsupported,
      },
      botRuntime: {
        listBots: unsupported,
        createBot: unsupported,
        updateBot: unsupported,
        startBot: unsupported,
        stopBot: unsupported,
        getActiveRun: unsupported,
        listRuns: unsupported,
      },
      strategyRun: {
        listHistory: unsupported,
        getLogs: unsupported,
        getOrders: unsupported,
      },
      compileStrategySource: () => ({ success: true, diagnostics: [] }),
    },
  });
  try {
    await manager.writeConfig({ enabled: true, port });
    const credential = await manager.issueClientToken('codex');
    const endpoint = (await manager.getStatus()).endpoint;
    const initialize = (token) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'smoke', version: '1.0.0' },
          },
        }),
      });
    assert.equal((await initialize(credential.token)).status, 200);
    assert.equal((await initialize('wrong-token')).status, 401);
    await manager.revokeClientToken('codex');
    assert.equal((await initialize(credential.token)).status, 401);
  } finally {
    await manager.stop();
  }
}

const root = await mkdtemp(join(tmpdir(), 'polytrader2-ai-agent-smoke-'));
try {
  await runAgentConfigSmoke(root);
  await runMacClaudeDesktopDetectionSmoke(root);
  await runMcpCredentialSmoke();
  console.log('AI agent integration smoke test passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
