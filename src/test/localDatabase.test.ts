import { describe, it, expect } from 'vitest';
import { generateUUID } from '../lib/db/localDatabase';

describe('Local Database & UUID Generation', () => {
  it('generates valid RFC4122 v4 UUID strings', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);

    // Standard UUID pattern (8-4-4-4-12 hex characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id1).toMatch(uuidRegex);
    expect(id2).toMatch(uuidRegex);
  });
});
