import { plural } from '@/lib/format';
import type { Folder, Subject } from '@/lib/types';

const KEPT = 'The playlists and videos themselves stay in your library, with their progress, notes and favorites.';

export function describeSubjectDeletion(s: Pick<Subject, 'folderCount' | 'stats'>) {
  return {
    removes: [`the subject and its ${plural(s.folderCount, 'folder')}`, 'the places where playlists and videos were filed in it'],
    kept: KEPT,
    uniqueVideos: s.stats.total,
  };
}

export function describeFolderDeletion(f: Pick<Folder, 'childFolderCount' | 'stats'>) {
  return {
    removes: [f.childFolderCount > 0 ? `this folder and its ${plural(f.childFolderCount, 'sub-folder')} (and everything nested inside)` : 'this folder', 'the places where playlists and videos were filed in it'],
    kept: KEPT,
    uniqueVideos: f.stats.total,
  };
}
