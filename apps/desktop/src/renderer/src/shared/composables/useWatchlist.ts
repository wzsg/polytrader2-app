import { ref } from 'vue';

const watchlistEventIds = ref(new Set<string>());
const openWatchlistEventCount = ref(0);

export function useWatchlist() {
  async function refreshWatchlistEventIds(): Promise<void> {
    const ids = await window.api.getWatchlistEventIds();
    watchlistEventIds.value = new Set(ids);
  }

  async function refreshOpenWatchlistEventCount(): Promise<void> {
    openWatchlistEventCount.value = await window.api.countOpenWatchlistEvents();
  }

  async function toggleWatchlist(eventId: string): Promise<{ removed: boolean } | null> {
    const listed = watchlistEventIds.value.has(eventId);
    if (listed) {
      await window.api.removeFromWatchlist(eventId);
      watchlistEventIds.value.delete(eventId);
      await refreshOpenWatchlistEventCount();
      return { removed: true };
    }
    const ok = await window.api.addToWatchlist(eventId);
    if (!ok) return null;
    watchlistEventIds.value.add(eventId);
    await refreshOpenWatchlistEventCount();
    return { removed: false };
  }

  function isInWatchlist(eventId: string): boolean {
    return watchlistEventIds.value.has(eventId);
  }

  return {
    watchlistEventIds,
    openWatchlistEventCount,
    refreshWatchlistEventIds,
    refreshOpenWatchlistEventCount,
    toggleWatchlist,
    isInWatchlist,
  };
}
