import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogProvider } from '@/lib/dialogs';
import type { Exam, ExamDetail } from '@/lib/types';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn() }));
import { api } from '@/lib/api';
import ExamDialog from './ExamDialog';
import ExamsPage from './ExamsPage';

const stats = (total: number, completed: number) => ({ total, completed, inProgress: 0, remaining: total - completed, percent: total ? Math.round((completed / total) * 100) : 0 });
const exam = (id: string, name: string, status: Exam['status'], total = 0, completed = 0): Exam => ({
  id, name, description: null, examDate: null, status, color: null, icon: null, displayOrder: Number(id.slice(1)), subjectCount: 2, stats: stats(total, completed), createdAt: '', updatedAt: '',
});
const exams = [exam('e1', 'CDS 2027', 'ACTIVE', 4, 1), exam('e2', 'GATE 2027', 'ACTIVE'), exam('e3', 'Old exam', 'ARCHIVED')];
const detail: ExamDetail = { ...exams[0]!, subjects: [], impact: { subjects: 2, folders: 5, playlistPlacements: 1, videoPlacements: 2 } };

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DialogProvider>{ui}</DialogProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup); // vitest globals are off, so RTL's automatic cleanup isn't registered

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === '/exams') return exams;
    if (path === '/exams/e1') return detail;
    return {};
  });
});

describe('ExamsPage', () => {
  it('shows real counts per tab, filters by status and search, with an empty state', async () => {
    wrap(<ExamsPage />);
    expect(await screen.findByText('CDS 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archived\s*1/ })).toBeInTheDocument();
    expect(screen.getByText('1 of 4 completed')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.queryByText('Old exam')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Archived/ }));
    expect(screen.getByText('Old exam')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search exams'), { target: { value: 'zzz' } });
    expect(screen.getByText('No exams match your search')).toBeInTheDocument();
  });

  it('explains exactly what deleting an exam removes and keeps, using the exam’s real impact', async () => {
    wrap(<ExamsPage />);
    await screen.findByText('CDS 2027');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for CDS 2027' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    expect(await screen.findByText('5 folders')).toBeInTheDocument();
    const dialog = within(document.querySelector('dialog')!);
    expect(dialog.getByText('2 subjects')).toBeInTheDocument();
    expect(dialog.getByText('3 places where playlists and videos were filed')).toBeInTheDocument();
    expect(dialog.getByText(/all progress, notes and favorites/)).toBeInTheDocument();
    expect(dialog.getByText(/planner tasks/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/exams/e1');
  });

  it('offers Move up only when there is a previous exam', async () => {
    wrap(<ExamsPage />);
    await screen.findByText('CDS 2027');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for CDS 2027' }));
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeInTheDocument();
  });
});

describe('ExamDialog', () => {
  it('validates the name before calling the API', async () => {
    const onClose = vi.fn();
    wrap(<ExamDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(api).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('creates an exam with the entered details and closes', async () => {
    const onClose = vi.fn();
    wrap(<ExamDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Exam name'), { target: { value: '  CDS 2027 ' } });
    fireEvent.change(screen.getByLabelText(/Exam date/), { target: { value: '2027-04-11' } });
    fireEvent.click(screen.getByLabelText('Emerald'));
    fireEvent.click(screen.getByLabelText('Air Force'));
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('/exams', expect.objectContaining({ method: 'POST', body: { name: 'CDS 2027', description: null, examDate: '2027-04-11', color: '#059669', icon: 'plane' } }));
  });

  it('keeps the form open when the server rejects the request', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Server said no'));
    const onClose = vi.fn();
    wrap(<ExamDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Exam name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create exam' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create exam' })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(within(document.body).getByLabelText('Exam name')).toHaveValue('X');
  });
});
