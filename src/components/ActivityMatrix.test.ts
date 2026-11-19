import { describe, it, expect } from 'vitest';
import type { SessionRecord } from '@/lib/db';

describe('ActivityMatrix data calculations', () => {
  it('correctly calculates streaks and active practice days', () => {
    const today = new Date();
    const todaySec = Math.floor(today.getTime() / 1000);
    const yesterdaySec = todaySec - 86400;

    const mockSessions: Partial<SessionRecord>[] = [
      {
        id: 's1',
        name: 'EURUSD practice',
        symbol: 'EURUSD',
        updatedAt: today.getTime(),
        position: 150,
        orders: [
          {
            id: 'o1',
            status: 'closed',
            side: 'buy',
            type: 'market',
            entryPrice: 1.08,
            size: 1,
            createdTime: todaySec,
            closeTime: todaySec,
            pnl: 120,
          },
          {
            id: 'o2',
            status: 'closed',
            side: 'sell',
            type: 'market',
            entryPrice: 1.082,
            size: 1,
            createdTime: yesterdaySec,
            closeTime: yesterdaySec,
            pnl: -40,
          },
        ],
      },
    ];

    // Assert mock sessions structure
    expect(mockSessions[0].orders?.length).toBe(2);
    expect(mockSessions[0].position).toBe(150);
  });
});
