import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { makeBars, makeSession } from '@/test/helpers';
import { useReplayEngine } from './useReplayEngine';

const raw = makeBars(60, 5);
const setup = (over = {}) => renderHook(() => useReplayEngine(raw, makeSession({ position: 10, startPosition: 10, ...over })));

describe('useReplayEngine', () => {
  it('steps and clamps', () => {
    const { result } = setup();
    act(() => result.current.step(1));
    expect(result.current.position).toBe(11);
    act(() => result.current.seek(9999));
    expect(result.current.position).toBe(60);
    act(() => result.current.seek(-5));
    expect(result.current.position).toBe(1);
  });

  it('stops stepping on the bar that hits take-profit when pause-on-trade is on', () => {
    const { result } = setup();
    act(() => result.current.placeMarket('buy', 1, 0, raw[9].close + 3)); // TP 3 above entry
    act(() => result.current.step(20));
    const order = result.current.orders[0];
    expect(order.status).toBe('closed');
    expect(order.closeReason).toBe('tp');
    // halted on the bar that triggered it instead of running the full 20
    expect(result.current.position).toBeLessThan(30);
    expect(result.current.position).toBeGreaterThan(10);
  });

  it('does not stop on a seek, but still resolves the trade', () => {
    const { result } = setup();
    act(() => result.current.placeMarket('buy', 1, 0, raw[9].close + 3));
    act(() => result.current.seek(40));
    expect(result.current.position).toBe(40);
    expect(result.current.orders[0].status).toBe('closed');
  });

  it('rewinding undoes trades placed after the target', () => {
    const { result } = setup();
    act(() => result.current.step(5));
    act(() => result.current.placeMarket('sell', 1));
    expect(result.current.orders).toHaveLength(1);
    act(() => result.current.seek(10));
    expect(result.current.orders).toHaveLength(0);
  });

  it('bookmarks are sorted, de-duplicated and navigable', () => {
    const { result } = setup();
    act(() => result.current.seek(30));
    act(() => result.current.addBookmark('late'));
    act(() => result.current.seek(15));
    act(() => result.current.addBookmark('early'));
    act(() => result.current.addBookmark('dup'));
    expect(result.current.bookmarks.map((b) => b.label)).toEqual(['early', 'late']);
    act(() => result.current.jumpBookmark(1));
    expect(result.current.position).toBe(30);
  });

  it('seeks to a time', () => {
    const { result } = setup();
    act(() => result.current.seekToTime(raw[24].time));
    expect(result.current.position).toBe(25);
  });
});
