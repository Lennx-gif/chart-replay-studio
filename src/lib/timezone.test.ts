import { describe, it, expect } from 'vitest';
import {
  getTimezoneOffsetHours,
  getNewYorkOffset,
  MARKET_SESSIONS,
  isSessionActive,
  getActiveMarketSessions,
} from './timezone';

describe('timezone engine', () => {
  it('correctly calculates New York EDT and EST offsets with Daylight Saving Time', () => {
    // 2024-07-15 15:00:00 UTC (Summer -> EDT is UTC-4)
    const summerSec = 1721055600;
    expect(getTimezoneOffsetHours('America/New_York', summerSec)).toBe(-4);

    // 2024-01-15 15:00:00 UTC (Winter -> EST is UTC-5)
    const winterSec = 1705330800;
    expect(getTimezoneOffsetHours('America/New_York', winterSec)).toBe(-5);
  });

  it('determines when New York market session is active (08:00 - 17:00 local time)', () => {
    const nySession = MARKET_SESSIONS.find((s) => s.id === 'newyork')!;
    expect(nySession).toBeDefined();

    // 2024-07-15 14:00:00 UTC = 10:00 AM EDT (in session)
    const midDaySec = 1721052000;
    expect(isSessionActive(nySession, midDaySec)).toBe(true);

    // 2024-07-15 04:00:00 UTC = 00:00 AM EDT (closed)
    const nightSec = 1721016000;
    expect(isSessionActive(nySession, nightSec)).toBe(false);
  });

  it('returns active sessions correctly', () => {
    // 2024-07-15 14:00:00 UTC: London (08:00-17:00 BST) & New York (08:00-17:00 EDT) overlap!
    const overlapSec = 1721052000;
    const active = getActiveMarketSessions(overlapSec);
    const activeIds = active.map((s) => s.id);

    expect(activeIds).toContain('newyork');
    expect(activeIds).toContain('london');
  });
});
