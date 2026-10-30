import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayKey } from '@/lib/format';
import type { StudyTask } from '@/lib/types';
import TaskDialog from './TaskDialog';

const stats = { total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0 };
const exams = [
  { id: 'e1', name: 'CDS 2027', status: 'ACTIVE' },
  { id: 'e2', name: 'GATE 2027', status: 'ACTIVE' },
];
const subjects = [
  { id: 's1', examId: 'e1', examName: 'CDS 2027', name: 'Mathematics', archived: false },
  { id: 's2', examId: 'e1', examName: 'CDS 2027', name: 'English', archived: false },
  { id: 's3', examId: 'e2', examName: 'GATE 2027', name: 'Networks', archived: false },
];
const folders = [{ id: 'f1', subjectId: 's1', parentFolderId: null, name: 'Main Course', description: null, displayOrder: 0, childFolderCount: 0, stats }];

let fetchMock: ReturnType<typeof vi.fn>;
let respondToWrite: () => Response;

beforeEach(() => {
  respondToWrite = () => new Response(JSON.stringify({ data: { id: 'new' } }), { status: 201 });
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return respondToWrite();
    const u = new URL(url, 'http://x');
    let data: unknown = [];
    if (u.pathname === '/api/exams') data = exams;
    else if (u.pathname === '/api/subjects') data = subjects.filter((s) => !u.searchParams.get('examId') || s.examId === u.searchParams.get('examId'));
    else if (u.pathname === '/api/subjects/s1/folders') data = folders;
    else if (u.pathname === '/api/videos') data = { total: 1, items: [{ id: 'v9', title: 'Percentages 01' }] };
    else if (u.pathname === '/api/playlists') data = [{ id: 'p9', title: 'Arithmetic course' }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderDialog = (props: Partial<Parameters<typeof TaskDialog>[0]> = {}) => {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <TaskDialog onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
};
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET').map(([url, init]) => ({ url, method: init.method, body: JSON.parse(init.body) }));
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Add task|Save changes/ }));
const value = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;

describe('TaskDialog – create', () => {
  it('defaults the date to the supplied day and estimate to 30 minutes', () => {
    renderDialog({ defaultDate: '2027-06-01' });
    expect(value('Date')).toBe('2027-06-01');
    expect(value('Estimated minutes')).toBe('30');
  });

  it('defaults the date to today', () => {
    renderDialog();
    expect(value('Date')).toBe(todayKey());
  });

  it('requires a title and does not call the API', async () => {
    renderDialog();
    submit();
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    expect(screen.getByLabelText('Task')).toHaveAttribute('aria-invalid', 'true');
    expect(writes()).toHaveLength(0);
  });

  it.each(['-5', '1441', '', '12.5'])('rejects estimated minutes %j', async (bad) => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Study' } });
    fireEvent.change(screen.getByLabelText('Estimated minutes'), { target: { value: bad } });
    submit();
    expect(await screen.findByText('Enter whole minutes from 0 to 1440.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('rejects a cleared date', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Study' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('Choose a valid date.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('choosing a subject fills in its exam and offers its folders', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('option', { name: /Mathematics/ })).toBeInTheDocument());
    expect(screen.queryByLabelText(/Folder/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 's1' } });
    expect(value('Exam (optional)')).toBe('e1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Main Course' })).toBeInTheDocument());
  });

  it('changing the exam clears a subject and folder from a different exam', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('option', { name: /Mathematics/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Main Course' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Folder/), { target: { value: 'f1' } });
    fireEvent.change(screen.getByLabelText(/Exam/), { target: { value: 'e2' } });
    expect(value(/Subject/)).toBe('');
    expect(screen.queryByLabelText(/Folder/)).toBeNull();
    // subjects list now only shows the new exam's subjects
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Mathematics' })).toBeNull());
    expect(screen.getByRole('option', { name: 'Networks' })).toBeInTheDocument();
  });

  it('keeps the subject when switching to its own exam', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('option', { name: /Mathematics/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/Exam/), { target: { value: 'e1' } });
    expect(value(/Subject/)).toBe('s1');
  });

  it('posts the full, trimmed payload and closes on success', async () => {
    const { onClose } = renderDialog({ defaultDate: '2027-06-01' });
    await waitFor(() => expect(screen.getByRole('option', { name: /Mathematics/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: '  Watch lecture 12  ' } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: '  formulas  ' } });
    fireEvent.change(screen.getByLabelText('Estimated minutes'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Main Course' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Folder/), { target: { value: 'f1' } });
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toEqual([
      {
        url: '/api/tasks',
        method: 'POST',
        body: { title: 'Watch lecture 12', description: 'formulas', scheduledDate: '2027-06-01', estimatedDurationMinutes: 45, examId: 'e1', subjectId: 's1', folderId: 'f1', videoId: null, playlistId: null },
      },
    ]);
  });

  it('links an optional lecture and playlist found through search', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Linked' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Percentages 01' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Linked lecture/), { target: { value: 'v9' } });
    fireEvent.change(screen.getByLabelText(/Linked playlist/), { target: { value: 'p9' } });
    submit();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toMatchObject({ videoId: 'v9', playlistId: 'p9' });
  });

  it('shows the server relationship error and stays open for correction', async () => {
    respondToWrite = () => new Response(JSON.stringify({ error: { code: 'INVALID_RELATIONSHIP', message: 'The folder does not belong to the selected subject.' } }), { status: 422 });
    const { onClose } = renderDialog();
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Study' } });
    submit();
    expect(await screen.findAllByText('The folder does not belong to the selected subject.')).not.toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add task' })).not.toBeDisabled();
    expect(screen.getByLabelText('Task')).toHaveValue('Study'); // input is never silently discarded
  });
});

describe('TaskDialog – edit', () => {
  const existing: StudyTask = {
    id: 't7',
    title: 'Old title',
    description: null,
    scheduledDate: '2027-02-01',
    estimatedDurationMinutes: 20,
    status: 'TODO',
    completedAt: null,
    exam: { id: 'e1', name: 'CDS 2027' },
    subject: { id: 's1', name: 'Mathematics' },
    folder: null,
    video: { id: 'v1', title: 'Already linked', thumbnailUrl: null },
    playlist: null,
  };

  it('prefills from the task, including a linked video that is not in the search results', () => {
    renderDialog({ task: existing });
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(value('Task')).toBe('Old title');
    expect(value('Date')).toBe('2027-02-01');
    expect(value('Estimated minutes')).toBe('20');
    expect(value(/Linked lecture/)).toBe('v1');
    expect(screen.getByRole('option', { name: 'Already linked' })).toBeInTheDocument();
  });

  it('saves with PATCH and explicit nulls for cleared links', async () => {
    const { onClose } = renderDialog({ task: existing });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'New title' } });
    fireEvent.change(screen.getByLabelText(/Linked lecture/), { target: { value: '' } });
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()[0]).toMatchObject({
      url: '/api/tasks/t7',
      method: 'PATCH',
      body: { title: 'New title', examId: 'e1', subjectId: 's1', folderId: null, videoId: null, playlistId: null, scheduledDate: '2027-02-01' },
    });
  });
});
