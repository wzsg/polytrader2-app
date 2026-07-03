import { onUnmounted, ref, watch, type Ref } from 'vue';
import { formatCountdown } from '@/shared/utils/format';

export function useCountdown(endDateRef: Ref<string | null | undefined>) {
  const countdownLabel = ref('—');
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    const endDate = endDateRef.value;
    if (!endDate) {
      countdownLabel.value = '—';
      return;
    }

    const endMs = new Date(endDate).getTime();
    if (Number.isNaN(endMs)) {
      countdownLabel.value = '—';
      return;
    }

    countdownLabel.value = formatCountdown(endMs - Date.now());
  }

  function startTimer(): void {
    stopTimer();
    tick();
    timer = setInterval(tick, 1000);
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  watch(endDateRef, startTimer, { immediate: true });

  onUnmounted(stopTimer);

  return countdownLabel;
}
