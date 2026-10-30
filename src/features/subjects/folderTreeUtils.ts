import type { Folder } from '@/lib/types';

export interface TreeNode {
  folder: Folder;
  children: TreeNode[];
}

const byOrder = (a: Folder, b: Folder) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);

export function buildFolderTree(folders: Folder[]): TreeNode[] {
  const children = new Map<string | null, Folder[]>();
  for (const f of folders) children.set(f.parentFolderId, [...(children.get(f.parentFolderId) ?? []), f]);
  const walk = (parent: string | null): TreeNode[] => (children.get(parent) ?? []).sort(byOrder).map((folder) => ({ folder, children: walk(folder.id) }));
  return walk(null);
}

/** The folder itself plus every descendant — folders that must not be offered as a move target. */
export function folderSubtreeIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentFolderId && out.has(f.parentFolderId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Ids of all ancestors of a folder (used to auto-expand the tree to the current folder). */
export function ancestorIds(folders: Folder[], id: string | null | undefined): string[] {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const out: string[] = [];
  for (let f = id ? byId.get(id) : undefined; f?.parentFolderId; f = byId.get(f.parentFolderId)) out.push(f.parentFolderId);
  return out;
}

/** New id order after moving `id` one step; null if it is already at that edge. */
export function reorderedIds(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
