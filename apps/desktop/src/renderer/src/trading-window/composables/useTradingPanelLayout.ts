import { computed, ref, watch, type Ref } from 'vue';

const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 380;
const LEFT_PANEL_DEFAULT_WIDTH = 280;
const LEFT_PANEL_RECENT_DEFAULT_WIDTHS = [300, 320];
const LEFT_PANEL_WIDTH_DEFAULT_VERSION = 'left-panel-default-280';
const LEFT_PANEL_RECENT_WIDTH_DEFAULT_VERSIONS = [
  'left-panel-default-300',
  'left-panel-default-320',
];
const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_DEFAULT_WIDTH = 360;

type ResizablePanelSide = 'left' | 'right';

export function useTradingPanelLayout(eventId: Ref<string>) {
  const leftPanelCollapsed = ref(readPanelPreference(eventId.value, 'left', false));
  const rightPanelCollapsed = ref(readPanelPreference(eventId.value, 'right', false));
  const leftPanelWidth = ref(readPanelWidth(eventId.value, 'left'));
  const rightPanelWidth = ref(readPanelWidth(eventId.value, 'right'));
  const panelGridStyle = computed(() => ({
    '--left-panel-width': leftPanelCollapsed.value ? '48px' : `${leftPanelWidth.value}px`,
    '--right-panel-width': rightPanelCollapsed.value ? '48px' : `${rightPanelWidth.value}px`,
  }));

  let syncingPanelPreferences = false;
  let resizingPanelSide: ResizablePanelSide | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  function panelStorageKey(eventId: string, name: string): string {
    return `trading-window:event:${encodeURIComponent(eventId)}:${name}`;
  }

  function readPanelPreference(
    eventId: string,
    side: 'left' | 'right',
    fallback: boolean,
  ): boolean {
    const key = panelStorageKey(eventId, `${side}-panel-collapsed`);
    const value = window.localStorage.getItem(key);
    if (value == null) return fallback;
    return value === '1';
  }

  function writePanelPreference(eventId: string, side: 'left' | 'right', collapsed: boolean): void {
    const key = panelStorageKey(eventId, `${side}-panel-collapsed`);
    window.localStorage.setItem(key, collapsed ? '1' : '0');
  }

  function clampPanelWidth(side: ResizablePanelSide, value: number): number {
    const min = side === 'left' ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH;
    const max = side === 'left' ? LEFT_PANEL_MAX_WIDTH : RIGHT_PANEL_MAX_WIDTH;
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function readPanelWidth(eventId: string, side: ResizablePanelSide): number {
    const fallback = side === 'left' ? LEFT_PANEL_DEFAULT_WIDTH : RIGHT_PANEL_DEFAULT_WIDTH;
    const key = panelStorageKey(eventId, `${side}-panel-width`);
    const value = Number(window.localStorage.getItem(key));
    if (!Number.isFinite(value)) return fallback;
    const versionKey = panelStorageKey(eventId, `${side}-panel-width-version`);
    const version = versionKey ? window.localStorage.getItem(versionKey) : null;
    if (
      side === 'left' &&
      LEFT_PANEL_RECENT_WIDTH_DEFAULT_VERSIONS.includes(String(version)) &&
      LEFT_PANEL_RECENT_DEFAULT_WIDTHS.includes(value)
    ) {
      return LEFT_PANEL_DEFAULT_WIDTH;
    }
    if (
      side === 'left' &&
      value < LEFT_PANEL_DEFAULT_WIDTH &&
      versionKey &&
      version !== LEFT_PANEL_WIDTH_DEFAULT_VERSION
    ) {
      return LEFT_PANEL_DEFAULT_WIDTH;
    }
    return clampPanelWidth(side, value);
  }

  function writePanelWidth(eventId: string, side: ResizablePanelSide, width: number): void {
    const key = panelStorageKey(eventId, `${side}-panel-width`);
    window.localStorage.setItem(key, String(width));
    const versionKey = panelStorageKey(eventId, `${side}-panel-width-version`);
    if (side === 'left' && versionKey) {
      window.localStorage.setItem(versionKey, LEFT_PANEL_WIDTH_DEFAULT_VERSION);
    }
  }

  function syncPanelPreferencesForEvent(nextEventId: string): void {
    syncingPanelPreferences = true;
    leftPanelCollapsed.value = readPanelPreference(nextEventId, 'left', false);
    rightPanelCollapsed.value = readPanelPreference(nextEventId, 'right', false);
    leftPanelWidth.value = readPanelWidth(nextEventId, 'left');
    rightPanelWidth.value = readPanelWidth(nextEventId, 'right');
    syncingPanelPreferences = false;
  }

  function toggleLeftPanel(): void {
    leftPanelCollapsed.value = !leftPanelCollapsed.value;
  }

  function toggleRightPanel(): void {
    rightPanelCollapsed.value = !rightPanelCollapsed.value;
  }

  function startPanelWidthResize(side: ResizablePanelSide, event: MouseEvent): void {
    if (
      (side === 'left' && leftPanelCollapsed.value) ||
      (side === 'right' && rightPanelCollapsed.value)
    ) {
      return;
    }
    resizingPanelSide = side;
    resizeStartX = event.clientX;
    resizeStartWidth = side === 'left' ? leftPanelWidth.value : rightPanelWidth.value;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', resizePanelWidth);
    window.addEventListener('mouseup', stopPanelWidthResize);
  }

  function resizePanelWidth(event: MouseEvent): void {
    if (!resizingPanelSide) return;
    const delta =
      resizingPanelSide === 'left' ? event.clientX - resizeStartX : resizeStartX - event.clientX;
    const nextWidth = clampPanelWidth(resizingPanelSide, resizeStartWidth + delta);
    if (resizingPanelSide === 'left') leftPanelWidth.value = nextWidth;
    else rightPanelWidth.value = nextWidth;
  }

  function stopPanelWidthResize(): void {
    resizingPanelSide = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', resizePanelWidth);
    window.removeEventListener('mouseup', stopPanelWidthResize);
  }

  watch(leftPanelCollapsed, (collapsed) => {
    if (syncingPanelPreferences) return;
    writePanelPreference(eventId.value, 'left', collapsed);
  });

  watch(rightPanelCollapsed, (collapsed) => {
    if (syncingPanelPreferences) return;
    writePanelPreference(eventId.value, 'right', collapsed);
  });

  watch(leftPanelWidth, (width) => {
    if (syncingPanelPreferences) return;
    writePanelWidth(eventId.value, 'left', width);
  });

  watch(rightPanelWidth, (width) => {
    if (syncingPanelPreferences) return;
    writePanelWidth(eventId.value, 'right', width);
  });

  watch(eventId, (id) => {
    syncPanelPreferencesForEvent(id);
  });

  return {
    leftPanelCollapsed,
    rightPanelCollapsed,
    leftPanelWidth,
    rightPanelWidth,
    panelGridStyle,
    toggleLeftPanel,
    toggleRightPanel,
    startPanelWidthResize,
    stopPanelWidthResize,
  };
}
