import { getCurrentIntlLocale, translateUiKey } from '../i18n';
import { priceCentsDigitsForTick } from '@polytrader/shared';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString(getCurrentIntlLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '-';
  }
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '-';
  }
}

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;
const MS_MINUTE = 60 * 1000;

export function formatCountdown(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms <= 0) return translateUiKey('common.ended');

  if (ms >= MS_DAY) {
    const days = Math.floor(ms / MS_DAY);
    const hours = Math.floor((ms % MS_DAY) / MS_HOUR);
    const minutes = Math.floor((ms % MS_HOUR) / MS_MINUTE);
    const parts = [`${days}d`];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  const hours = Math.floor(ms / MS_HOUR);
  const minutes = Math.floor((ms % MS_HOUR) / MS_MINUTE);
  const seconds = Math.floor((ms % MS_MINUTE) / 1000);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function formatNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '-';
  return new Intl.NumberFormat(getCurrentIntlLocale(), {
    notation: Math.abs(n) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(n) >= 1000 ? 1 : 0,
  }).format(n);
}

export function formatOutcomeLabel(label: unknown, index: number): string {
  if (!label) return `${translateUiKey('common.option')} ${index + 1}`;
  const lower = String(label).toLowerCase();
  if (lower === 'yes') return translateUiKey('common.yes');
  if (lower === 'no') return translateUiKey('common.no');
  return String(label);
}

export function formatOutcomePrice(price: unknown): string {
  const n = Number(price);
  if (isNaN(n)) return '-';
  if (n >= 0 && n <= 1) return `${(n * 100).toFixed(1)}¢`;
  return `${n.toFixed(1)}¢`;
}

export function formatPrice(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  return `${(n * 100).toFixed(1)}¢`;
}

export function formatPriceByTick(value: unknown, tickSize: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  return `${(n * 100).toFixed(priceCentsDigitsForTick(tickSize) ?? 1)}¢`;
}

export function formatNumber(value: unknown, digits = 2): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  return n.toLocaleString(getCurrentIntlLocale(), { maximumFractionDigits: digits });
}

export function formatUsd(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  return new Intl.NumberFormat(getCurrentIntlLocale(), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPnl(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat(getCurrentIntlLocale(), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))}`;
}

export function formatPercent(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '—');
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat(getCurrentIntlLocale(), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n)}%`;
}

export function formatTimestamp(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  const date = Number.isNaN(n) ? new Date(String(value)) : new Date(n > 1e12 ? n : n * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(getCurrentIntlLocale());
}

export function formatRelativeTime(value: unknown, referenceTime = Date.now()): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  const date = Number.isNaN(n) ? new Date(String(value)) : new Date(n > 1e12 ? n : n * 1000);
  if (Number.isNaN(date.getTime())) return '—';

  const elapsedMs = referenceTime - date.getTime();
  const direction = elapsedMs >= 0 ? -1 : 1;
  const elapsedMinutes = Math.max(1, Math.floor(Math.abs(elapsedMs) / MS_MINUTE));
  const formatter = new Intl.RelativeTimeFormat(getCurrentIntlLocale(), { numeric: 'always' });

  if (elapsedMinutes < 60) return formatter.format(direction * elapsedMinutes, 'minute');

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return formatter.format(direction * elapsedHours, 'hour');

  return formatter.format(direction * Math.floor(elapsedHours / 24), 'day');
}

export function sideLabel(side: unknown): string {
  if (!side) return '—';
  return String(side).toUpperCase() === 'BUY'
    ? translateUiKey('trade.buy')
    : translateUiKey('trade.sell');
}

export function sideClass(side: unknown): string {
  return String(side).toUpperCase() === 'BUY' ? 'text-green-400' : 'text-red-400';
}

export function formatAddress(address: unknown): string {
  if (!address) return '—';
  const value = String(address);
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
