interface SystemPerformanceStatus {
  enabled: boolean;
  energySaver: 'on' | 'off' | 'unknown';
  cpuSpeedLimitPercent: number | null;
  isPerformanceLimited: boolean;
  updatedAt: string;
}

type SystemPerformanceEventMap = {
  changed: [status: SystemPerformanceStatus];
};

export type { SystemPerformanceEventMap, SystemPerformanceStatus };
