import { describe, expect, it } from 'vitest';
import type { Folder } from '@/lib/types';
import { ancestorIds, buildFolderTree, folderSubtreeIds, reorderedIds } from './folderTreeUtils';

const f = (id: string, parentFolderId: string | null, displayOrder = 0): Folder => ({
  id,
  subjectId: 's',
  parentFolderId,
  name: id,
  description: null,
  displayOrder,
  childFolderCount: 0,
  stats: { total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0 },
});
const folders = [f('main', null, 0), f('rev', null, 1), f('algebra', 'main'), f('quad', 'algebra'), f('geo', 'main', 1)];

describe('folder tree helpers', () => {
  it('builds a nested, ordered tree', () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.folder.id)).toEqual(['main', 'rev']);
    expect(tree[0]!.children.map((n) => n.folder.id)).toEqual(['algebra', 'geo']);
    expect(tree[0]!.children[0]!.children[0]!.folder.id).toBe('quad');
  });
  it('excludes a folder and all descendants from move targets', () => {
    expect([...folderSubtreeIds(folders, 'main')].sort()).toEqual(['algebra', 'geo', 'main', 'quad']);
    expect([...folderSubtreeIds(folders, 'rev')]).toEqual(['rev']);
  });
  it('finds ancestors for auto-expansion', () => {
    expect(ancestorIds(folders, 'quad')).toEqual(['algebra', 'main']);
    expect(ancestorIds(folders, 'main')).toEqual([]);
    expect(ancestorIds(folders, null)).toEqual([]);
  });
  it('reorders one step and refuses to go past the edges', () => {
    expect(reorderedIds(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(reorderedIds(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(reorderedIds(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(reorderedIds(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });
});
