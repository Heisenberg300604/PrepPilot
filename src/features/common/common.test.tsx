import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Destination, Folder } from '@/lib/types';
import { DestinationPicker } from './DestinationPicker';
import { flattenFolders } from './queries';

afterEach(cleanup);

const stats = { total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0 };
const folder = (id: string, name: string, parentFolderId: string | null, displayOrder = 0): Folder => ({ id, subjectId: 's1', parentFolderId, name, description: null, displayOrder, childFolderCount: 0, stats });

describe('flattenFolders', () => {
  it('orders depth-first by displayOrder then name, with depth and path', () => {
    const flat = flattenFolders([
      folder('c', 'Quadratics', 'b', 0),
      folder('b', 'Algebra', 'a', 0),
      folder('d', 'Revision', null, 1),
      folder('a', 'Main Course', null, 0),
      folder('e', 'Geometry', 'a', 1),
      folder('f', 'Arithmetic', 'a', 1),
    ]);
    expect(flat.map((f) => f.name)).toEqual(['Main Course', 'Algebra', 'Quadratics', 'Arithmetic', 'Geometry', 'Revision']);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1, 1, 0]);
    expect(flat[2].path).toEqual(['Main Course', 'Algebra', 'Quadratics']);
  });
  it('handles empty input and orphans without throwing', () => {
    expect(flattenFolders([])).toEqual([]);
    // an orphan whose parent is missing is simply not reachable from the root
    expect(flattenFolders([folder('x', 'Lost', 'missing')])).toEqual([]);
  });
});

describe('DestinationPicker', () => {
  const exams = [
    { id: 'e1', name: 'CDS 2027', status: 'ACTIVE' },
    { id: 'e2', name: 'GATE 2027', status: 'ACTIVE' },
    { id: 'e3', name: 'Old exam', status: 'ARCHIVED' },
  ];
  const subjects = [
    { id: 's1', examId: 'e1', name: 'Mathematics', archived: false },
    { id: 's2', examId: 'e1', name: 'Old subject', archived: true },
    { id: 's3', examId: 'e2', name: 'Networks', archived: false },
  ];
  const folders = [folder('f1', 'Main Course', null), folder('f2', 'Algebra', 'f1'), folder('f3', 'Revision', null, 1)];
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        const u = new URL(url, 'http://x');
        let data: unknown = [];
        if (u.pathname === '/api/exams') data = exams;
        else if (u.pathname === '/api/subjects') data = u.searchParams.get('examId') ? subjects.filter((s) => s.examId === u.searchParams.get('examId')) : subjects;
        else if (u.pathname === '/api/subjects/s1/folders') data = folders;
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function Harness({ initial = null, optional, exclude, onChange }: { initial?: Destination | null; optional?: boolean; exclude?: Set<string>; onChange?: (d: Destination | null) => void }) {
    const [v, setV] = useState<Destination | null>(initial);
    return <DestinationPicker value={v} optional={optional} excludeFolderIds={exclude} onChange={(d) => (setV(d), onChange?.(d))} />;
  }
  const renderPicker = (props: Parameters<typeof Harness>[0] = {}) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <Harness {...props} />
      </QueryClientProvider>,
    );
  };

  it('offers only non-archived exams and reveals subject, then folder, step by step', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });
    const exam = await screen.findByLabelText('Exam');
    await waitFor(() => expect(screen.getByRole('option', { name: 'GATE 2027' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Old exam' })).toBeNull();
    expect(screen.queryByLabelText('Subject')).toBeNull();

    fireEvent.change(exam, { target: { value: 'e1' } });
    const subject = await screen.findByLabelText('Subject');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mathematics' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Old subject' })).toBeNull(); // archived hidden
    expect(screen.queryByRole('option', { name: 'Networks' })).toBeNull(); // other exam
    expect(screen.queryByLabelText(/Folder/)).toBeNull();

    fireEvent.change(subject, { target: { value: 's1' } });
    expect(onChange).toHaveBeenLastCalledWith({ subjectId: 's1', folderId: null });
    const folderSelect = await screen.findByLabelText(/Folder/);
    await waitFor(() => expect(screen.getByRole('option', { name: /Algebra/ })).toBeInTheDocument());
    expect(screen.getAllByRole('option').map((o) => o.textContent?.replace(/[ ↳ ]/g, ''))).toEqual(expect.arrayContaining(['MainCourse', 'Algebra', 'Revision']));

    fireEvent.change(folderSelect, { target: { value: 'f2' } });
    expect(onChange).toHaveBeenLastCalledWith({ subjectId: 's1', folderId: 'f2' });
  });

  it('resets the destination when the exam changes', async () => {
    const onChange = vi.fn();
    renderPicker({ initial: { subjectId: 's1', folderId: null }, onChange });
    await waitFor(() => expect((screen.getByLabelText('Exam') as HTMLSelectElement).value).toBe('e1')); // derived from the subject
    fireEvent.change(screen.getByLabelText('Exam'), { target: { value: 'e2' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Networks' })).toBeInTheDocument());
    expect(screen.queryByLabelText(/Folder/)).toBeNull();
  });

  it('hides excluded folders (e.g. a folder and its descendants when moving it)', async () => {
    renderPicker({ initial: { subjectId: 's1', folderId: null }, exclude: new Set(['f1', 'f2']) });
    await screen.findByLabelText(/Folder/);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Revision' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: /Main Course/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /Algebra/ })).toBeNull();
  });

  it('supports an optional "don\'t file yet" choice', async () => {
    renderPicker({ optional: true });
    await screen.findByRole('option', { name: "Don't file yet" });
  });
});
