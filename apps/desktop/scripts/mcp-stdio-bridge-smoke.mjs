import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

class BridgeProcessClient {
  #child;
  #nextId = 1;
  #pending = new Map();
  #stderr = '';
  #stdoutBuffer = '';

  constructor(scriptPath, endpoint, token) {
    this.#child = spawn(process.execPath, [scriptPath, '--endpoint', endpoint, '--token', token], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stderr.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk) => this.#handleStdout(chunk));
    this.#child.stderr.on('data', (chunk) => {
      this.#stderr += chunk;
    });
    this.#child.on('error', (error) => this.#rejectAll(error));
    this.#child.on('exit', (code) => {
      if (this.#pending.size === 0) return;
      this.#rejectAll(new Error(`Bridge exited with code ${code}: ${this.#stderr}`));
    });
  }

  async request(method, params = {}) {
    const id = this.#nextId++;
    const response = new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    this.#send({ jsonrpc: '2.0', id, method, params });
    return await Promise.race([
      response,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timed out waiting for ${method}: ${this.#stderr}`)),
          5_000,
        ),
      ),
    ]);
  }

  notify(method, params = {}) {
    this.#send({ jsonrpc: '2.0', method, params });
  }

  async close() {
    this.#child.stdin.end();
    await Promise.race([
      new Promise((resolve) => this.#child.once('exit', resolve)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Bridge did not exit: ${this.#stderr}`)), 5_000),
      ),
    ]);
  }

  #send(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleStdout(chunk) {
    this.#stdoutBuffer += chunk;
    while (true) {
      const newlineIndex = this.#stdoutBuffer.indexOf('\n');
      if (newlineIndex < 0) return;
      const line = this.#stdoutBuffer.slice(0, newlineIndex).trim();
      this.#stdoutBuffer = this.#stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (!('id' in message)) continue;
      const pending = this.#pending.get(message.id);
      if (!pending) continue;
      this.#pending.delete(message.id);
      pending.resolve(message);
    }
  }

  #rejectAll(error) {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
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

function createManager() {
  const unsupported = async () => {
    throw new Error('Not used by bridge smoke test');
  };
  return new McpServerManager({
    metaRepository: new MemoryMetaRepository(),
    accessLogRepository: new MemoryAccessLogRepository(),
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
}

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const bridgeScript = join(appDirectory, 'out', 'mcp-stdio-bridge', 'mcp-stdio-bridge.js');
const manager = createManager();
try {
  const port = await findAvailablePort();
  await manager.writeConfig({ enabled: true, port });
  const credential = await manager.issueClientToken('claude-desktop');
  const endpoint = (await manager.getStatus()).endpoint;
  const client = new BridgeProcessClient(bridgeScript, endpoint, credential.token);
  const initialize = await client.request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'claude-desktop-bridge-smoke', version: '1.0.0' },
  });
  assert.equal(initialize.result.protocolVersion, '2025-03-26');
  client.notify('notifications/initialized');
  const tools = await client.request('tools/list');
  assert.ok(tools.result.tools.some((tool) => tool.name === 'strategy_list'));
  await client.close();

  const unauthorizedClient = new BridgeProcessClient(bridgeScript, endpoint, 'wrong-token');
  const unauthorized = await unauthorizedClient.request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'unauthorized-smoke', version: '1.0.0' },
  });
  assert.equal(unauthorized.error.code, -32000);
  await unauthorizedClient.close();
  process.stdout.write('MCP stdio bridge smoke test passed\n');
} finally {
  await manager.stop();
}
