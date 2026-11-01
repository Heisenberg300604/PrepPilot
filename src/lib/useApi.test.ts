import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { patchCached } from './useApi';

describe('patchCached', () => {
  it('patches the entity everywhere it is cached and leaves unrelated rows untouched', async () => {
    const qc = new QueryClient();
    const other = { id: 'v2', title: 'B', favorite: false };
    qc.setQueryData(['videos', { sort: 'added' }], { total: 2, items: [{ id: 'v1', title: 'A', favorite: false }, other] });
    qc.setQueryData(['contents', 's1', null], { folders: [], videos: [{ id: 'v1', favorite: false, placementId: 'p1' }] });
    qc.setQueryData(['tasks', {}], [{ id: 't1', status: 'TODO' }]);

    await patchCached(qc, [['videos'], ['contents']], 'v1', { favorite: true });

    const list = qc.getQueryData<{ items: { id: string; favorite: boolean }[] }>(['videos', { sort: 'added' }])!;
    expect(list.items[0]).toEqual({ id: 'v1', title: 'A', favorite: true });
    expect(list.items[1]).toBe(other); // same reference, so it does not re-render
    expect(qc.getQueryData<any>(['contents', 's1', null]).videos[0]).toEqual({ id: 'v1', favorite: true, placementId: 'p1' });
    expect(qc.getQueryData(['tasks', {}])).toEqual([{ id: 't1', status: 'TODO' }]);
  });

  it('only touches objects that already have the patched field', async () => {
    const qc = new QueryClient();
    const brief = { id: 'v1', title: 'Prev lecture' };
    qc.setQueryData(['video', 'v0', null], { id: 'v0', status: 'NOT_STARTED', context: { previous: brief } });
    await patchCached(qc, [['video']], 'v1', { status: 'COMPLETED' });
    expect(qc.getQueryData<any>(['video', 'v0', null]).context.previous).toBe(brief);
  });
});
