import type { EventTeam } from '@polytrader/shared';
import { parseJsonArray } from '@polytrader/shared';

function normalizeTeam(value: unknown): EventTeam | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const name = String(row.name || '').trim();
  const logo = String(row.logo || '').trim();
  if (!name || !logo) return null;

  const team: EventTeam = { name, logo };
  if (row.abbreviation) team.abbreviation = String(row.abbreviation);
  if (row.ordering) team.ordering = String(row.ordering);
  if (row.color) team.color = String(row.color);
  return team;
}

function parseEventTeams(value: unknown): EventTeam[] {
  return parseJsonArray(value)
    .map(normalizeTeam)
    .filter((team): team is EventTeam => Boolean(team));
}

function findTeamForMarket(
  market: { groupItemTitle?: string },
  teams: EventTeam[],
): EventTeam | null {
  const title = String(market.groupItemTitle || '').trim();
  if (!title) return null;
  return teams.find((team) => team.name === title) ?? null;
}

function getTeamMatchTitle(teams: EventTeam[]): string {
  return teams
    .slice(0, 2)
    .map((team) => team.name.trim())
    .filter(Boolean)
    .join(' vs. ');
}

function deriveChildEventShortTitle(event: {
  title?: string;
  parentEventId?: string | null;
  teams?: EventTeam[];
}): string {
  if (!event.parentEventId || !event.teams?.length) return '';
  const matchTitle = getTeamMatchTitle(event.teams);
  if (!matchTitle) return '';

  const title = String(event.title || '').trim();
  const prefix = `${matchTitle} - `;
  if (!title.startsWith(prefix)) return '';
  return title.slice(prefix.length).trim();
}

export { deriveChildEventShortTitle, findTeamForMarket, getTeamMatchTitle, parseEventTeams };
