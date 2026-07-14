import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import { spawn, spawnSync } from 'child_process';

class WindowsSigningService {
  static #cacheSchema = 'polytrader2-windows-sign-v1';

  #cacheDir;
  #cacheMaxFileSize;
  #certificateSha1;
  #configuration;
  #metricsPath;
  #retryDelayMs;
  #signToolPath;
  #signingTimeoutMs;
  #timestampServer;

  constructor(configuration) {
    this.#configuration = configuration;
    this.#certificateSha1 = this.#requiredEnvironmentValue(
      'P2_WINDOWS_SIGNING_CERT_SHA1',
    ).toUpperCase();
    if (!/^[0-9A-F]{40}$/u.test(this.#certificateSha1)) {
      throw new Error('P2_WINDOWS_SIGNING_CERT_SHA1 must be a 40-character SHA-1 thumbprint');
    }
    this.#timestampServer =
      process.env.P2_WINDOWS_SIGNING_TIMESTAMP_URL?.trim() || 'http://time.certum.pl';
    this.#signingTimeoutMs = this.#positiveIntegerEnvironmentValue(
      'P2_WINDOWS_SIGNING_TIMEOUT_MS',
      30 * 60 * 1000,
    );
    this.#retryDelayMs = this.#positiveIntegerEnvironmentValue(
      'P2_WINDOWS_SIGNING_RETRY_DELAY_MS',
      15 * 1000,
    );
    this.#cacheMaxFileSize = this.#positiveIntegerEnvironmentValue(
      'P2_WINDOWS_SIGN_CACHE_MAX_FILE_SIZE',
      64 * 1024 * 1024,
    );
    this.#cacheDir =
      process.env.P2_WINDOWS_SIGN_CACHE_DIR?.trim() ||
      join(process.env.LOCALAPPDATA || tmpdir(), 'Polytrader2', 'code-sign-cache');
    this.#metricsPath =
      process.env.P2_WINDOWS_SIGN_METRICS_PATH?.trim() ||
      join(tmpdir(), 'polytrader2-windows-sign-metrics.json');
    this.#signToolPath = this.#resolveSignToolPath();
  }

  async run() {
    const filePath = this.#configuration.path;
    if (!existsSync(filePath)) throw new Error(`Signing input does not exist: ${filePath}`);
    if (this.#configuration.hash !== 'sha256') {
      throw new Error(`Only SHA-256 signing is allowed, received: ${this.#configuration.hash}`);
    }

    const inputHash = this.#fileHash(filePath);
    const cacheKey = this.#cacheKey(inputHash);
    this.#recordMetric('requests', filePath, inputHash);

    if (this.#isCacheEligible(filePath) && this.#restoreFromCache(filePath, inputHash, cacheKey)) {
      this.#recordMetric('cacheHits', filePath, inputHash);
      process.stdout.write(
        `[windows-sign] restored verified signature cache for ${basename(filePath)}\n`,
      );
      return;
    }

    await this.#signWithAuthorizationWait(filePath, inputHash);
    this.#assertValidSignature(filePath);
    this.#recordMetric('cloudSignatures', filePath, inputHash);

    if (this.#isCacheEligible(filePath)) {
      this.#saveToCache(filePath, inputHash, cacheKey);
    }
  }

  #cacheKey(inputHash) {
    return createHash('sha256')
      .update(
        [
          WindowsSigningService.#cacheSchema,
          inputHash,
          this.#certificateSha1,
          this.#configuration.hash,
          this.#timestampServer,
        ].join('\0'),
      )
      .digest('hex');
  }

  #cachePaths(filePath, cacheKey) {
    const extension = extname(filePath).toLowerCase() || '.bin';
    return {
      file: join(this.#cacheDir, `${cacheKey}${extension}`),
      metadata: join(this.#cacheDir, `${cacheKey}.json`),
    };
  }

  #certificateAvailable() {
    const command = [
      `$certificate = Get-Item -LiteralPath 'Cert:\\CurrentUser\\My\\${this.#certificateSha1}' -ErrorAction SilentlyContinue`,
      'if ($null -eq $certificate -or -not $certificate.HasPrivateKey) { exit 1 }',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    return result.status === 0;
  }

  #fileHash(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  }

  #isCacheEligible(filePath) {
    return statSync(filePath).size <= this.#cacheMaxFileSize;
  }

  #loadMetrics() {
    if (!existsSync(this.#metricsPath)) {
      return {
        schema: 1,
        requests: 0,
        cacheHits: 0,
        cloudSignatures: 0,
        signToolAttempts: 0,
        authorizationRetries: 0,
        files: [],
      };
    }
    try {
      return JSON.parse(readFileSync(this.#metricsPath, 'utf8'));
    } catch {
      throw new Error(`Invalid Windows signing metrics file: ${this.#metricsPath}`);
    }
  }

  #recordMetric(field, filePath, inputHash) {
    const metrics = this.#loadMetrics();
    metrics[field] = Number(metrics[field] || 0) + 1;
    metrics.files.push({
      event: field,
      file: basename(filePath),
      inputHash,
      at: new Date().toISOString(),
    });
    this.#writeJsonAtomic(this.#metricsPath, metrics);
  }

  #restoreFromCache(filePath, inputHash, cacheKey) {
    const paths = this.#cachePaths(filePath, cacheKey);
    if (!existsSync(paths.file) || !existsSync(paths.metadata)) return false;

    try {
      const metadata = JSON.parse(readFileSync(paths.metadata, 'utf8'));
      if (
        metadata.schema !== WindowsSigningService.#cacheSchema ||
        metadata.inputHash !== inputHash ||
        metadata.certificateSha1 !== this.#certificateSha1 ||
        metadata.outputHash !== this.#fileHash(paths.file)
      ) {
        throw new Error('cache metadata mismatch');
      }
      this.#assertValidSignature(paths.file);
      copyFileSync(paths.file, filePath);
      if (this.#fileHash(filePath) !== metadata.outputHash) {
        throw new Error('restored file hash mismatch');
      }
      return true;
    } catch (error) {
      process.stderr.write(
        `[windows-sign] discarding invalid cache entry for ${basename(filePath)}: ${error.message}\n`,
      );
      rmSync(paths.file, { force: true });
      rmSync(paths.metadata, { force: true });
      return false;
    }
  }

  #saveToCache(filePath, inputHash, cacheKey) {
    mkdirSync(this.#cacheDir, { recursive: true });
    const paths = this.#cachePaths(filePath, cacheKey);
    const temporaryFile = `${paths.file}.${process.pid}.tmp`;
    copyFileSync(filePath, temporaryFile);
    renameSync(temporaryFile, paths.file);
    this.#writeJsonAtomic(paths.metadata, {
      schema: WindowsSigningService.#cacheSchema,
      inputHash,
      outputHash: this.#fileHash(paths.file),
      certificateSha1: this.#certificateSha1,
      algorithm: this.#configuration.hash,
      timestampServer: this.#timestampServer,
      createdAt: new Date().toISOString(),
    });
    process.stdout.write(`[windows-sign] cached signed file ${basename(filePath)}\n`);
  }

  async #signWithAuthorizationWait(filePath, inputHash) {
    const deadline = Date.now() + this.#signingTimeoutMs;
    let lastFailure = 'SimplySign authorization was not completed';
    const unsignedBackupPath = `${filePath}.${process.pid}.unsigned`;
    copyFileSync(filePath, unsignedBackupPath);

    try {
      while (Date.now() < deadline) {
        if (!this.#certificateAvailable()) {
          lastFailure = `certificate ${this.#certificateSha1} is not available with a private key`;
          this.#recordMetric('authorizationRetries', filePath, inputHash);
          await this.#waitBeforeRetry(deadline, filePath, lastFailure);
          continue;
        }

        copyFileSync(unsignedBackupPath, filePath);
        this.#recordMetric('signToolAttempts', filePath, inputHash);
        const result = await this.#runSignTool(filePath, deadline - Date.now());
        if (result.exitCode === 0) return;

        lastFailure = result.output.trim() || `SignTool exited with code ${result.exitCode}`;
        this.#recordMetric('authorizationRetries', filePath, inputHash);
        await this.#waitBeforeRetry(deadline, filePath, lastFailure);
      }
    } finally {
      rmSync(unsignedBackupPath, { force: true });
    }

    throw new Error(
      `Timed out after ${Math.round(this.#signingTimeoutMs / 60000)} minutes waiting for SimplySign authorization for ${filePath}. Last failure: ${lastFailure}`,
    );
  }

  async #waitBeforeRetry(deadline, filePath, failure) {
    const remainingMs = Math.max(0, deadline - Date.now());
    if (remainingMs === 0) return;
    const waitMs = Math.min(this.#retryDelayMs, remainingMs);
    process.stderr.write(
      `[windows-sign] waiting for SimplySign authorization for ${basename(filePath)}; retrying in ${Math.ceil(waitMs / 1000)} seconds. ${failure}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  #runSignTool(filePath, timeoutMs) {
    const args = [
      'sign',
      '/sha1',
      this.#certificateSha1,
      '/s',
      'My',
      '/tr',
      this.#timestampServer,
      '/td',
      'sha256',
      '/fd',
      'sha256',
      '/debug',
      filePath,
    ];

    process.stdout.write(`[windows-sign] invoking SignTool for ${basename(filePath)}\n`);
    return new Promise((resolve, reject) => {
      const child = spawn(this.#signToolPath, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      });
      let output = '';
      let timedOut = false;
      const appendOutput = (chunk, stream) => {
        const text = chunk.toString();
        output = `${output}${text}`.slice(-64 * 1024);
        stream.write(text);
      };
      child.stdout.on('data', (chunk) => appendOutput(chunk, process.stdout));
      child.stderr.on('data', (chunk) => appendOutput(chunk, process.stderr));
      child.on('error', reject);

      const timer = setTimeout(
        () => {
          timedOut = true;
          spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        },
        Math.max(1000, timeoutMs),
      );

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode: timedOut ? -1 : (exitCode ?? -1),
          output: timedOut ? `${output}\nSignTool authorization wait timed out.` : output,
        });
      });
    });
  }

  #assertValidSignature(filePath) {
    const script = [
      '$signature = Get-AuthenticodeSignature -LiteralPath $env:P2_VERIFY_SIGNATURE_PATH',
      '$result = [pscustomobject]@{ Status = [string]$signature.Status; Thumbprint = [string]$signature.SignerCertificate.Thumbprint; Timestamped = $null -ne $signature.TimeStamperCertificate }',
      '$result | ConvertTo-Json -Compress',
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        env: { ...process.env, P2_VERIFY_SIGNATURE_PATH: filePath },
        windowsHide: true,
      },
    );
    if (result.status !== 0) {
      throw new Error(`Unable to verify Authenticode signature for ${filePath}: ${result.stderr}`);
    }
    const signature = JSON.parse(result.stdout.trim());
    if (
      signature.Status !== 'Valid' ||
      String(signature.Thumbprint).toUpperCase() !== this.#certificateSha1 ||
      signature.Timestamped !== true
    ) {
      throw new Error(
        `Invalid Authenticode signature for ${filePath}: status=${signature.Status}, thumbprint=${signature.Thumbprint}, timestamped=${signature.Timestamped}`,
      );
    }
  }

  #resolveSignToolPath() {
    const configuredPath = process.env.P2_SIGNTOOL_PATH?.trim();
    if (configuredPath) {
      if (!existsSync(configuredPath))
        throw new Error(`Configured SignTool not found: ${configuredPath}`);
      return configuredPath;
    }

    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (programFilesX86) {
      const kitsBin = join(programFilesX86, 'Windows Kits', '10', 'bin');
      if (existsSync(kitsBin)) {
        const result = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$path = Get-ChildItem -LiteralPath '${kitsBin.replaceAll("'", "''")}' -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*\\x64\\signtool.exe' } | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName; if ($path) { $path } else { exit 1 }`,
          ],
          { encoding: 'utf8', windowsHide: true },
        );
        if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
      }
    }

    const whereResult = spawnSync('where.exe', ['signtool.exe'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const discoveredPath = whereResult.stdout?.split(/\r?\n/u).find(Boolean)?.trim();
    if (whereResult.status === 0 && discoveredPath) return discoveredPath;
    throw new Error(
      'Unable to locate signtool.exe. Install the Windows SDK or set P2_SIGNTOOL_PATH.',
    );
  }

  #positiveIntegerEnvironmentValue(name, fallback) {
    const value = process.env[name]?.trim();
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  }

  #requiredEnvironmentValue(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }

  #writeJsonAtomic(filePath, value) {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temporaryPath, filePath);
  }
}

async function sign(configuration) {
  const service = new WindowsSigningService(configuration);
  await service.run();
}

export { sign };
