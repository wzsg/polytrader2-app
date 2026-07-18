import { EventEmitter } from 'events';
import type { SystemPerformanceEventMap, SystemPerformanceStatus } from './types.js';

class SystemPerformanceMonitor extends EventEmitter<SystemPerformanceEventMap> {
  private _status: SystemPerformanceStatus;

  public constructor() {
    super();
    this._status = {
      enabled: false,
      energySaver: 'unknown',
      cpuSpeedLimitPercent: null,
      isPerformanceLimited: false,
      updatedAt: new Date(0).toISOString(),
    };
  }

  public getStatus(): SystemPerformanceStatus {
    return this._status;
  }

  public update(
    input: Partial<Omit<SystemPerformanceStatus, 'isPerformanceLimited' | 'updatedAt'>>,
  ): void {
    const next = {
      ...this._status,
      ...input,
    };
    next.isPerformanceLimited =
      next.enabled &&
      (next.energySaver === 'on' ||
        (next.cpuSpeedLimitPercent !== null && next.cpuSpeedLimitPercent < 100));
    if (this._isEqual(this._status, next)) return;
    this._status = { ...next, updatedAt: new Date().toISOString() };
    this.emit('changed', this._status);
  }

  private _isEqual(
    previous: SystemPerformanceStatus,
    next: Omit<SystemPerformanceStatus, 'updatedAt'>,
  ): boolean {
    return (
      previous.enabled === next.enabled &&
      previous.energySaver === next.energySaver &&
      previous.cpuSpeedLimitPercent === next.cpuSpeedLimitPercent &&
      previous.isPerformanceLimited === next.isPerformanceLimited
    );
  }
}

export { SystemPerformanceMonitor };
