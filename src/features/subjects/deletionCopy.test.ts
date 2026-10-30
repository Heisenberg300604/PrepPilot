import { describe, expect, it } from 'vitest';
import { describeFolderDeletion, describeSubjectDeletion } from './deletionCopy';

const stats = { total: 4, completed: 1, inProgress: 0, remaining: 3, percent: 25 };

describe('deletion copy', () => {
  it('explains subject deletion and that videos are kept', () => {
    const d = describeSubjectDeletion({ folderCount: 3, stats });
    expect(d.removes[0]).toBe('the subject and its 3 folders');
    expect(d.kept).toMatch(/stay in your library/);
    expect(d.uniqueVideos).toBe(4);
  });
  it('mentions nested sub-folders only when there are some', () => {
    expect(describeFolderDeletion({ childFolderCount: 0, stats }).removes[0]).toBe('this folder');
    expect(describeFolderDeletion({ childFolderCount: 2, stats }).removes[0]).toMatch(/2 sub-folders/);
  });
});
