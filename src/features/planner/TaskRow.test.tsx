import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayKey } from '@/lib/format';
import type { StudyTask } from '@/lib/types';

const open = vi.fn();
vi.mock('@/lib/dialogs', () => ({ useDialogs: () => ({ open, close: vi.fn() }) }));

import { TaskRow } from './TaskRow';

const task = (over: Partial<StudyTask> = {}): StudyTask => ({
  id: 't1',
  title: 'Revise percentages',
  description: 'Chapter 4 only',
  scheduledDate: todayKey(),
  estimatedDurationMinutes: 80,
  status: 'TODO',
  completedAt: null,
  exam: { id: 'e1', name: 'CDS 2027' },
  subject: { id: 's1', name: 'Mathematics' },
  folder: { id: 'f1', name: 'Revision' },
  video: { id: 'v1', title: 'Percentages 01', thumbnailUrl: null },
  playlist: { id: 'p1', title: 'Arithmetic course' },
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  open.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderRow = (t: StudyTask, props: { compact?: boolean; showDate?: boolean } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <ul>
          <TaskRow task={t} {...props} />
        </ul>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, method: init?.method as string, body: init?.body ? JSON.parse(init.body) : undefined };
};

describe('TaskRow', () => {
  it('toggles to DONE through PATCH /tasks/:id', async () => {
    renderRow(task());
    fireEvent.click(screen.getByRole('checkbox', { name: "Mark 'Revise percentages' as done" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ url: '/api/tasks/t1', method: 'PATCH', body: { status: 'DONE' } });
  });

  it('reopens a done task and shows a non-colour "Done" cue', async () => {
    renderRow(task({ status: 'DONE', completedAt: new Date().toISOString() }));
    expect(screen.getByText('Done')).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: "Mark 'Revise percentages' as to do" });
    expect(box).toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastCall().body).toEqual({ status: 'TODO' });
  });

  it('shows context, linked-resource links and a labelled estimate', () => {
    renderRow(task());
    expect(screen.getByText('CDS 2027 › Mathematics › Revision')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Percentages 01/ })).toHaveAttribute('href', '/watch/v1');
    expect(screen.getByRole('link', { name: /Arithmetic course/ })).toHaveAttribute('href', '/playlists/p1');
    const est = screen.getByText('~1h 20m planned');
    expect(est).toHaveAttribute('title', expect.stringMatching(/not measured/i));
    expect(screen.getByText('Chapter 4 only')).toBeInTheDocument();
  });

  it('compact variant keeps only checkbox, title, subject and minutes', () => {
    renderRow(task(), { compact: true });
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('~1h 20m planned')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Chapter 4 only')).toBeNull();
    expect(screen.queryByText(/CDS 2027/)).toBeNull();
  });

  it('shows the relative date when asked', () => {
    renderRow(task({ scheduledDate: addDays(todayKey(), -1) }), { showDate: true });
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('Edit opens the task dialog with this task', () => {
    renderRow(task());
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Revise percentages' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(open).toHaveBeenCalledWith({ kind: 'task', task: expect.objectContaining({ id: 't1' }) });
  });

  it('reschedules to tomorrow with a date-only PATCH', async () => {
    renderRow(task());
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reschedule to tomorrow' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ method: 'PATCH', body: { scheduledDate: addDays(todayKey(), 1) } });
  });

  it('disables "reschedule to tomorrow" when already tomorrow', () => {
    renderRow(task({ scheduledDate: addDays(todayKey(), 1) }));
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    expect(screen.getByRole('menuitem', { name: 'Reschedule to tomorrow' })).toBeDisabled();
  });

  it('delete asks for confirmation first, then calls DELETE', async () => {
    renderRow(task());
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Delete this task?' })).toBeInTheDocument();
    expect(screen.getByText(/not affected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ url: '/api/tasks/t1', method: 'DELETE' });
  });

  it('cancelling the delete confirmation leaves the task alone', () => {
    renderRow(task());
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
