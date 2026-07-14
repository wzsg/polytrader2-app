import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

interface BridgeOptions {
  endpoint: URL;
  token: string;
}

class McpStdioHttpBridge {
  private readonly _options: BridgeOptions;
  private readonly _stdioTransport: StdioServerTransport;
  private readonly _httpTransport: StreamableHTTPClientTransport;
  private _initializeRequestId: string | number | null = null;
  private _closing = false;

  public constructor(args: string[]) {
    this._options = this._parseOptions(args);
    this._stdioTransport = new StdioServerTransport();
    this._httpTransport = new StreamableHTTPClientTransport(this._options.endpoint, {
      requestInit: {
        headers: { Authorization: `Bearer ${this._options.token}` },
      },
    });
  }

  public async run(): Promise<void> {
    this._stdioTransport.onmessage = (message) => {
      void this._forwardToHttp(message);
    };
    this._stdioTransport.onerror = (error) => this._writeError('stdio transport error', error);
    this._httpTransport.onmessage = (message) => {
      void this._forwardToStdio(message);
    };
    this._httpTransport.onerror = (error) => this._writeError('HTTP transport error', error);
    process.stdin.once('end', () => {
      void this._shutdown(0);
    });
    process.once('SIGINT', () => {
      void this._shutdown(0);
    });
    process.once('SIGTERM', () => {
      void this._shutdown(0);
    });
    await this._httpTransport.start();
    await this._stdioTransport.start();
  }

  private async _forwardToHttp(message: JSONRPCMessage): Promise<void> {
    if (this._isInitializeRequest(message)) this._initializeRequestId = message.id;
    try {
      await this._httpTransport.send(message);
    } catch (error) {
      this._writeError('failed to forward MCP message to Polytrader2', error);
      if (!this._isRequest(message)) return;
      await this._stdioTransport.send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32000,
          message: `Polytrader2 MCP connection failed: ${this._errorMessage(error)}`,
        },
      });
    }
  }

  private async _forwardToStdio(message: JSONRPCMessage): Promise<void> {
    if (this._isInitializeResult(message)) {
      this._httpTransport.setProtocolVersion(message.result.protocolVersion);
    }
    try {
      await this._stdioTransport.send(message);
    } catch (error) {
      this._writeError('failed to forward MCP message to Claude Desktop', error);
      await this._shutdown(1);
    }
  }

  private async _shutdown(exitCode: number): Promise<void> {
    if (this._closing) return;
    this._closing = true;
    if (this._httpTransport.sessionId) {
      await this._httpTransport.terminateSession().catch((error: unknown) => {
        this._writeError('failed to terminate HTTP MCP session', error);
      });
    }
    await Promise.allSettled([this._httpTransport.close(), this._stdioTransport.close()]);
    process.exitCode = exitCode;
  }

  private _parseOptions(args: string[]): BridgeOptions {
    const endpoint = this._readArgument(args, '--endpoint');
    const token = this._readArgument(args, '--token');
    const endpointUrl = new URL(endpoint);
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
    if (endpointUrl.protocol !== 'http:' || !allowedHosts.has(endpointUrl.hostname)) {
      throw new Error('The MCP bridge endpoint must use HTTP on a loopback host');
    }
    if (endpointUrl.pathname !== '/mcp') {
      throw new Error('The MCP bridge endpoint path must be /mcp');
    }
    return { endpoint: endpointUrl, token };
  }

  private _readArgument(args: string[], name: string): string {
    const index = args.indexOf(name);
    const value = index >= 0 ? args[index + 1]?.trim() : '';
    if (!value) throw new Error(`Missing required argument: ${name}`);
    return value;
  }

  private _isRequest(message: JSONRPCMessage): message is JSONRPCMessage & {
    id: string | number;
    method: string;
  } {
    return 'id' in message && 'method' in message;
  }

  private _isInitializeRequest(message: JSONRPCMessage): message is JSONRPCMessage & {
    id: string | number;
    method: 'initialize';
  } {
    return this._isRequest(message) && message.method === 'initialize';
  }

  private _isInitializeResult(message: JSONRPCMessage): message is JSONRPCMessage & {
    id: string | number;
    result: { protocolVersion: string };
  } {
    if (!('id' in message) || message.id !== this._initializeRequestId || !('result' in message)) {
      return false;
    }
    return this._isRecord(message.result) && typeof message.result.protocolVersion === 'string';
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private _writeError(context: string, error: unknown): void {
    process.stderr.write(`[polytrader2-mcp-bridge] ${context}: ${this._errorMessage(error)}\n`);
  }

  private _errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replaceAll(this._options.token, '[redacted]');
  }
}

const bridge = new McpStdioHttpBridge(process.argv.slice(2));
void bridge.run().catch((error: unknown) => {
  process.stderr.write(
    `[polytrader2-mcp-bridge] startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

export type { BridgeOptions };
