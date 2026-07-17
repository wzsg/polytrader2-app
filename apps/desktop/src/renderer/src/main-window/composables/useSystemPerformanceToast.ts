import { computed, onUnmounted, ref } from 'vue';
import { translateUiKey } from '../../shared/i18n';

const TOAST_DURATION_MS = 15_000;

type SystemPerformanceStatus = Awaited<ReturnType<typeof window.api.getSystemPerformanceStatus>>;

interface SystemPerformanceToastState {
  title: string;
  message: string;
}

export function useSystemPerformanceToast() {
  const toast = ref<SystemPerformanceToastState | null>(null);
  const toastVisible = computed(() => toast.value !== null);
  let previousStatus: SystemPerformanceStatus | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function closeToast(): void {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = null;
    toast.value = null;
  }

  function handleStatus(status: SystemPerformanceStatus): void {
    const wasLimited = previousStatus?.isPerformanceLimited ?? false;
    previousStatus = status;
    if (!status.isPerformanceLimited || wasLimited) return;
    const cpuLimit = status.cpuSpeedLimitPercent;
    toast.value = {
      title: translateUiKey(
        status.energySaver === 'on'
          ? 'systemPerformance.energySaverTitle'
          : 'systemPerformance.cpuLimitedTitle',
      ),
      message:
        status.energySaver === 'on'
          ? translateUiKey('systemPerformance.energySaverMessage', {
              limit: cpuLimit === null ? translateUiKey('common.unknown') : `${cpuLimit}%`,
            })
          : translateUiKey('systemPerformance.cpuLimitedMessage', { limit: `${cpuLimit}%` }),
    };
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(closeToast, TOAST_DURATION_MS);
  }

  onUnmounted(closeToast);

  return { closeToast, handleStatus, toast, toastVisible };
}
