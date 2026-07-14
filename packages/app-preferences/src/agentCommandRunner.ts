import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, extname, join } from 'node:path';

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

class AgentCommandRunner {
  private readonly _environment: NodeJS.ProcessEnv;
  private readonly _platform: NodeJS.Platform;

  public constructor(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform) {
    this._environment = environment;
    this._platform = platform;
  }

  public async findExecutable(
    command: string,
    knownCandidates: string[] = [],
  ): Promise<string | null> {
    const pathCandidates = this._pathCandidates(command);
    for (const candidate of [...knownCandidates, ...pathCandidates]) {
      if (await this._isExecutableFile(candidate)) return candidate;
    }
    return null;
  }

  public async readVersion(executablePath: string): Promise<string | null> {
    try {
      const result = await this.run(executablePath, ['--version'], 3_000);
      if (result.exitCode !== 0) return null;
      const output = `${result.stdout}\n${result.stderr}`
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean);
      return output || null;
    } catch {
      return null;
    }
  }

  public run(executablePath: string, args: string[], timeoutMs = 10_000): Promise<CommandResult> {
    const useCommandShell =
      this._platform === 'win32' &&
      ['.cmd', '.bat'].includes(extname(executablePath).toLowerCase());
    const command = useCommandShell ? this._environment.ComSpec || 'cmd.exe' : executablePath;
    const commandArgs = useCommandShell ? [this._windowsCommandLine(executablePath, args)] : args;
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        env: this._environment,
        windowsHide: true,
        windowsVerbatimArguments: useCommandShell,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${executablePath}`));
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode: exitCode ?? -1, stdout, stderr });
      });
    });
  }

  private _pathCandidates(command: string): string[] {
    const pathValue = this._environment.PATH || this._environment.Path || '';
    const extensions = this._platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
    return pathValue
      .split(delimiter)
      .filter(Boolean)
      .flatMap((directory) =>
        extensions.map((extension) => join(directory, `${command}${extension}`)),
      );
  }

  private async _isExecutableFile(path: string): Promise<boolean> {
    if (!path) return false;
    try {
      await access(path, this._platform === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private _windowsCommandLine(executablePath: string, args: string[]): string {
    const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
    const commandLine = [quote(executablePath), ...args.map(quote)].join(' ');
    return `/d /c "${commandLine}"`;
  }
}

export { AgentCommandRunner };
export type { CommandResult };
