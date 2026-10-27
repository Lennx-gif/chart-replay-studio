/**
 * Timezone & Market Session Engine with Dynamic Daylight Saving Time (DST) Support
 */

export interface MarketSession {
  id: 'sydney' | 'tokyo' | 'london' | 'newyork';
  name: string;
  timeZone: string;
  startHour: number; // Local time
  endHour: number;   // Local time
  color: string;
  borderColor: string;
}

export const MARKET_SESSIONS: MarketSession[] = [
  {
    id: 'sydney',
    name: 'Sydney',
    timeZone: 'Australia/Sydney',
    startHour: 7,
    endHour: 16,
    color: 'rgba(212, 165, 74, 0.05)',
    borderColor: 'rgba(212, 165, 74, 0.35)',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    timeZone: 'Asia/Tokyo',
    startHour: 9,
    endHour: 18,
    color: 'rgba(156, 39, 176, 0.05)',
    borderColor: 'rgba(156, 39, 176, 0.35)',
  },
  {
    id: 'london',
    name: 'London',
    timeZone: 'Europe/London',
    startHour: 8,
    endHour: 17,
    color: 'rgba(255, 193, 7, 0.06)',
    borderColor: 'rgba(255, 193, 7, 0.4)',
  },
  {
    id: 'newyork',
    name: 'New York',
    timeZone: 'America/New_York',
    startHour: 8,
    endHour: 17,
    color: 'rgba(76, 175, 80, 0.06)',
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
];

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

function getCachedDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/**
 * Calculates the exact UTC offset (in hours) for a given IANA timezone and unix timestamp,
 * seamlessly accounting for Daylight Saving Time (DST) changes.
 * Memoized at the hour-level for high-frequency rendering performance.
 */
export function getTimezoneOffsetHours(timeZone: string, unixSeconds: number): number {
  const hourBucket = Math.floor(unixSeconds / 3600);
  const cacheKey = `${timeZone}:${hourBucket}`;
  const cached = offsetCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const d = new Date(unixSeconds * 1000);
    const dtf = getCachedDtf(timeZone);
    const parts = dtf.formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;

    const localAsUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );
    const offset = Math.round((localAsUtc - d.getTime()) / (3600 * 1000));
    offsetCache.set(cacheKey, offset);
    return offset;
  } catch {
    const fallback = timeZone === 'America/New_York' ? -5 : 0;
    offsetCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Returns New York offset (-4 during EDT, -5 during EST) for any unix timestamp.
 */
export function getNewYorkOffset(unixSeconds: number = Date.now() / 1000): number {
  return getTimezoneOffsetHours('America/New_York', unixSeconds);
}

/**
 * Returns whether a market session is open at the specified unix timestamp,
 * evaluated via fast integer math with zero string/Intl allocation in hot paths.
 */
export function isSessionActive(session: MarketSession, unixSeconds: number): boolean {
  try {
    const offsetHours = getTimezoneOffsetHours(session.timeZone, unixSeconds);
    const utcHour = Math.floor(unixSeconds / 3600) % 24;
    const localHour = ((utcHour + offsetHours) % 24 + 24) % 24;

    if (session.startHour < session.endHour) {
      return localHour >= session.startHour && localHour < session.endHour;
    }
    return localHour >= session.startHour || localHour < session.endHour;
  } catch {
    return false;
  }
}

/**
 * Checks which market sessions are currently active at this exact moment.
 */
export function getActiveMarketSessions(unixSeconds: number): MarketSession[] {
  return MARKET_SESSIONS.filter((s) => isSessionActive(s, unixSeconds));
}
