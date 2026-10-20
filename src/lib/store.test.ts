import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { makeBars } from '@/test/helpers';
import {
  createSession, deleteDataset, duplicateSession, exportBackup, getSetting, importBackup, listDatasets, listSessions,
  loadBars, saveDataset, setSetting, updateSession,
} from './store';

beforeEach(async () => {
  await Promise.all([db.datasets.clear(), db.bars.clear(), db.sessions.clear(), db.settings.clear()]);
});

describe('local store', () => {
  it('round-trips bars and de-duplicates identical imports', async () => {
    const bars = makeBars(50);
    const a = await saveDataset('EURUSD', bars);
    const b = await saveDataset('EURUSD again', bars);
    expect(b.id).toBe(a.id);
    expect(await listDatasets()).toHaveLength(1);
    expect(await loadBars(a.id)).toEqual(bars);
  });

  it('creates, updates, duplicates sessions', async () => {
    const ds = await saveDataset('X', makeBars(100));
    const s = await createSession({ name: 'Run 1', dataset: ds, startingBalance: 5000 });
    expect(s.position).toBe(50);
    await updateSession(s.id, { position: 77, notes: 'hello' });
    const copy = await duplicateSession(s.id);
    expect(copy?.position).toBe(77);
    expect(copy?.id).not.toBe(s.id);
    expect((await listSessions()).map((x) => x.name).sort()).toEqual(['Run 1', 'Run 1 (copy)']);
  });

  it('refuses to delete data that a session uses', async () => {
    const ds = await saveDataset('X', makeBars(100));
    const s = await createSession({ name: 'a', dataset: ds });
    expect(await deleteDataset(ds.id)).toBe(false);
    await db.sessions.delete(s.id);
    expect(await deleteDataset(ds.id)).toBe(true);
    expect(await db.bars.count()).toBe(0);
  });

  it('stores settings', async () => {
    expect(await getSetting('k', 1)).toBe(1);
    await setSetting('k', 2);
    expect(await getSetting('k', 1)).toBe(2);
  });

  it('backs up and restores without clobbering existing data', async () => {
    const ds = await saveDataset('X', makeBars(80));
    const s = await createSession({ name: 'keep', dataset: ds });
    await updateSession(s.id, { notes: 'important', position: 33 });
    const backup = JSON.parse(JSON.stringify(await exportBackup()));

    // Restoring onto the same database adds a copy of the session, reuses the dataset.
    const merged = await importBackup(backup);
    expect(merged).toEqual({ datasets: 0, sessions: 1 });
    expect(await listSessions()).toHaveLength(2);
    expect(await listDatasets()).toHaveLength(1);

    // Restoring onto an empty database brings everything back.
    await Promise.all([db.datasets.clear(), db.bars.clear(), db.sessions.clear()]);
    const fresh = await importBackup(backup);
    expect(fresh).toEqual({ datasets: 1, sessions: 1 }); // the backup was taken before the merge
    const restored = (await listSessions()).find((x) => x.id === s.id)!;
    expect(restored.notes).toBe('important');
    expect(await loadBars(restored.datasetId)).toEqual(makeBars(80));
  });

  it('rejects files that are not backups', async () => {
    await expect(importBackup({ hello: 'world' })).rejects.toThrow(/not a Chart Replay Studio backup/);
  });
});
