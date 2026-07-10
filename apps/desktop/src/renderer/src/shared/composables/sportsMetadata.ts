import type { SportDisciplineCategory, SportsCategoryConfig, SportsMetadataItem } from '@polytrader/shared';

let sportsMetadataCache: SportsMetadataItem[] | null = null;
let sportsMetadataRequest: Promise<SportsMetadataItem[]> | null = null;
let sportsCategoryMetadataCache: SportsMetadataItem[] | null = null;
let sportsCategoryMetadataRequest: Promise<SportsMetadataItem[]> | null = null;
let sportsCategoryConfigCache: SportsCategoryConfig | null = null;
let sportsCategoryConfigRequest: Promise<SportsCategoryConfig> | null = null;

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

function clearSportsCategoryMetadataCache(): void {
  sportsCategoryMetadataCache = null;
  sportsCategoryMetadataRequest = null;
  sportsCategoryConfigCache = null;
  sportsCategoryConfigRequest = null;
}

function fetchSportsCategoryMetadataOnce(): Promise<SportsMetadataItem[]> {
  if (sportsCategoryMetadataCache) return Promise.resolve(sportsCategoryMetadataCache);
  if (sportsCategoryMetadataRequest) return sportsCategoryMetadataRequest;

  sportsCategoryMetadataRequest = fetchSportsCategoryConfigOnce()
    .then((config) => {
      sportsCategoryMetadataCache = flattenSportsCategories(config.disciplines);
      return sportsCategoryMetadataCache;
    })
    .finally(() => {
      sportsCategoryMetadataRequest = null;
    });
  return sportsCategoryMetadataRequest;
}

function fetchSportsCategoryConfigOnce(): Promise<SportsCategoryConfig> {
  if (sportsCategoryConfigCache) return Promise.resolve(sportsCategoryConfigCache);
  if (sportsCategoryConfigRequest) return sportsCategoryConfigRequest;

  sportsCategoryConfigRequest = window.api
    .fetchSportsCategory()
    .then((config) => {
      sportsCategoryConfigCache = config;
      return config;
    })
    .finally(() => {
      sportsCategoryConfigRequest = null;
    });
  return sportsCategoryConfigRequest;
}

function flattenSportsCategories(disciplines: SportDisciplineCategory[]): SportsMetadataItem[] {
  return disciplines.flatMap((discipline) =>
    discipline.leagues.map((league) => ({
      id: Number.isFinite(Number(league.id)) ? Number(league.id) : undefined,
      sport: league.id,
      name: league.name,
      defaultName: league.defaultName,
      disciplineCode: discipline.code,
      disciplineName: discipline.name,
      image: league.image ?? '',
      resolution: league.resolution ?? '',
      ordering: league.ordering ?? '',
      tagIds: [],
      series: discipline.code,
      activeEventCount: league.openEventCount,
    })),
  );
}

export {
  clearSportsCategoryMetadataCache,
  fetchSportsCategoryConfigOnce,
  fetchSportsCategoryMetadataOnce,
  fetchSportsMetadataOnce,
  preloadSportsMetadata,
  sportCodeLabel,
  sportMetadataLabel,
};
