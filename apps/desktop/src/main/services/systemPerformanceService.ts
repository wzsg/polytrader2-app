import { execFile } from 'child_process';
import { promisify } from 'util';
import { powerMonitor } from 'electron';
import {
  SystemPerformanceMonitor,
  type SystemPerformanceStatus,
} from '@polytrader/system-performance';

const POWER_STATUS_POLL_INTERVAL_MS = 15_000;
const execFileAsync = promisify(execFile);

interface SpeedLimitPowerMonitor {
  on(
    eventName: 'speed-limit-change',
    listener: (event: Electron.Event, details: { limit: number }) => void,
  ): void;
  off(
    eventName: 'speed-limit-change',
    listener: (event: Electron.Event, details: { limit: number }) => void,
  ): void;
}

class SystemPerformanceService {
  private readonly _monitor: SystemPerformanceMonitor;
  private readonly _onSpeedLimitChange: (event: Electron.Event, details: { limit: number }) => void;
  private _pollTimer: NodeJS.Timeout | null;
  private _started: boolean;

  public constructor() {
    this._monitor = new SystemPerformanceMonitor();
    this._onSpeedLimitChange = (_event, details) => {
      this._monitor.update({ cpuSpeedLimitPercent: details.limit });
    };
    this._pollTimer = null;
    this._started = false;
  }

  public getStatus(): SystemPerformanceStatus {
    return this._monitor.getStatus();
  }

  public onStatusChanged(listener: (status: SystemPerformanceStatus) => void): () => void {
    this._monitor.on('changed', listener);
    return () => this._monitor.off('changed', listener);
  }

  public async start(): Promise<void> {
    if (this._started) return;
    this._started = true;
    this._getSpeedLimitPowerMonitor().on('speed-limit-change', this._onSpeedLimitChange);
    await this._refreshEnergySaverStatus();
    if (process.platform === 'win32') {
      this._pollTimer = setInterval(() => {
        void this._refreshEnergySaverStatus();
      }, POWER_STATUS_POLL_INTERVAL_MS);
    }
  }

  public stop(): void {
    if (!this._started) return;
    this._getSpeedLimitPowerMonitor().off('speed-limit-change', this._onSpeedLimitChange);
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
    this._started = false;
  }

  private async _refreshEnergySaverStatus(): Promise<void> {
    if (process.platform !== 'win32') {
      this._monitor.update({ energySaver: 'unknown' });
      return;
    }
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        this._getWindowsPowerStatusScript(),
      ]);
      const value = Number.parseInt(stdout.trim(), 10);
      this._monitor.update({ energySaver: value === 1 ? 'on' : value === 0 ? 'off' : 'unknown' });
    } catch {
      this._monitor.update({ energySaver: 'unknown' });
    }
  }

  private _getWindowsPowerStatusScript(): string {
    return [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class PolytraderPowerStatus {',
      '  [StructLayout(LayoutKind.Sequential)] public struct Status {',
      '    public byte AcLineStatus; public byte BatteryFlag; public byte BatteryLifePercent;',
      '    public byte SystemStatusFlag; public int BatteryLifeTime; public int BatteryFullLifeTime;',
      '  }',
      '  [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out Status status);',
      '}',
      '"@',
      '$status = New-Object PolytraderPowerStatus+Status',
      '[void][PolytraderPowerStatus]::GetSystemPowerStatus([ref]$status)',
      '[Console]::Write([int]$status.SystemStatusFlag)',
    ].join('\n');
  }

  private _getSpeedLimitPowerMonitor(): SpeedLimitPowerMonitor {
    return powerMonitor as unknown as SpeedLimitPowerMonitor;
  }
}

const systemPerformanceService = new SystemPerformanceService();

export { systemPerformanceService };
