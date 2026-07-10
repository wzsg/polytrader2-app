import type { SportsMetadataItem } from '@polytrader/shared';

let sportsMetadataCache: SportsMetadataItem[] | null = null;
let sportsMetadataRequest: Promise<SportsMetadataItem[]> | null = null;

function sportCodeLabel(sport: string): string {
  return sport.trim().toUpperCase();
}

function sportMetadataLabel(item: SportsMetadataItem): string {
  return item.name?.trim() || sportCodeLabel(item.sport);
}

function fetchSportsMetadataOnce(): Promise<SportsMetadataItem[]> {
  if (sportsMetadataCache) return Promise.resolve(sportsMetadataCache);
  if (sportsMetadataRequest) return sportsMetadataRequest;

  sportsMetadataRequest = window.api
    .fetchSportsMetadata()
    .then((items) => {
      sportsMetadataCache = items;
      return items;
    })
    .finally(() => {
      sportsMetadataRequest = null;
    });
  return sportsMetadataRequest;
}

function preloadSportsMetadata(): void {
  void fetchSportsMetadataOnce().catch(() => undefined);
}

export { fetchSportsMetadataOnce, preloadSportsMetadata, sportCodeLabel, sportMetadataLabel };
