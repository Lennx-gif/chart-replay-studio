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

/**
 * Calculates the exact UTC offset (in hours) for a given IANA timezone and unix timestamp,
 * seamlessly accounting for Daylight Saving Time (DST) changes.
 */
export function getTimezoneOffsetHours(timeZone: string, unixSeconds: number): number {
  try {
    const d = new Date(unixSeconds * 1000);
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
    return Math.round((localAsUtc - d.getTime()) / (3600 * 1000));
  } catch {
    return timeZone === 'America/New_York' ? -5 : 0;
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
 * correctly evaluated in that exchange's local time zone with DST.
 */
export function isSessionActive(session: MarketSession, unixSeconds: number): boolean {
  try {
    const d = new Date(unixSeconds * 1000);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: session.timeZone,
      hour: 'numeric',
      hour12: false,
    });
    const localHour = Number(formatter.format(d));

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
