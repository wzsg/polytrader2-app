import { ref } from 'vue';

const watchlistEventIds = ref(new Set<string>());

export function useWatchlist() {
  async function refreshWatchlistEventIds(): Promise<void> {
    const ids = await window.api.getWatchlistEventIds();
    watchlistEventIds.value = new Set(ids);
  }

  async function toggleWatchlist(eventId: string): Promise<{ removed: boolean } | null> {
    const listed = watchlistEventIds.value.has(eventId);
    if (listed) {
      await window.api.removeFromWatchlist(eventId);
      watchlistEventIds.value.delete(eventId);
      return { removed: true };
    }
    const ok = await window.api.addToWatchlist(eventId);
    if (!ok) return null;
    watchlistEventIds.value.add(eventId);
    return { removed: false };
  }

  function isInWatchlist(eventId: string): boolean {
    return watchlistEventIds.value.has(eventId);
  }

  return {
    watchlistEventIds,
    refreshWatchlistEventIds,
    toggleWatchlist,
    isInWatchlist,
  };
}
