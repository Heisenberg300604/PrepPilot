import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayKey } from '@/lib/format';

const open = vi.fn();
vi.mock('@/lib/dialogs', () => ({ useDialogs: () => ({ open, close: vi.fn() }) }));

import PlannerPage from './PlannerPage';

const task = (id: string, title: string, scheduledDate: string, status: 'TODO' | 'DONE', minutes: number) => ({
  id, title, description: null, scheduledDate, estimatedDurationMinutes: minutes, status, completedAt: null, exam: null, subject: null, folder: null, video: null, playlist: null,
});

const today = todayKey();
let tasks: ReturnType<typeof task>[];
let target = 100;
let failTasks = false;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  open.mockReset();
  failTasks = false;
  target = 100;
  tasks = [task('a', 'Today done', today, 'DONE', 50), task('b', 'Today todo', today, 'TODO', 30), task('c', 'Late one', addDays(today, -2), 'TODO', 20), task('d', 'Next week thing', addDays(today, 2), 'TODO', 15)];
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url, 'http://x');
    const p = u.searchParams;
    if (u.pathname === '/api/profile') return new Response(JSON.stringify({ data: { id: 'u', dailyStudyTargetMinutes: target, preferredTheme: 'SYSTEM', onboardingCompleted: true } }));
    if (u.pathname === '/api/tasks') {
      if (failTasks) return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Database is down' } }), { status: 500 });
      let list = tasks;
      if (p.get('overdueBefore')) list = list.filter((t) => t.status === 'TODO' && t.scheduledDate < p.get('overdueBefore')!);
      else {
        if (p.get('from')) list = list.filter((t) => t.scheduledDate >= p.get('from')!);
        if (p.get('to')) list = list.filter((t) => t.scheduledDate <= p.get('to')!);
      }
      return new Response(JSON.stringify({ data: list }));
    }
    return new Response(JSON.stringify({ data: [] }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}
const renderPage = (entry = '/planner') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <PlannerPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('PlannerPage', () => {
  it("shows today's tasks with a summary against the daily target", async () => {
    renderPage();
    expect(await screen.findByText('Today todo')).toBeInTheDocument();
    expect(screen.getByText('Today done')).toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: 'Day summary' });
    await waitFor(() => expect(within(summary).getByText('50%')).toBeInTheDocument()); // 50 of 100 completed
    expect(within(summary).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(within(summary).getByText(/not measured study time/i)).toBeInTheDocument();
    expect(within(summary).getByText(/local time zone/i)).toBeInTheDocument();
    expect(within(summary).getByText('1h 20m')).toBeInTheDocument(); // 50 + 30 estimated
  });

  it('lists overdue TODO tasks and upcoming tasks separately', async () => {
    renderPage();
    const overdue = await screen.findByRole('region', { name: 'Overdue' });
    expect(within(overdue).getByText('Late one')).toBeInTheDocument();
    const upcoming = screen.getByRole('region', { name: 'Coming up' });
    expect(await within(upcoming).findByText('Next week thing')).toBeInTheDocument();
  });

  it('handles a zero daily target without NaN', async () => {
    target = 0;
    renderPage();
    const summary = await screen.findByRole('complementary', { name: 'Day summary' });
    await waitFor(() => expect(within(summary).getByText(/No daily target set/)).toBeInTheDocument());
    expect(summary.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('puts the selected day in the URL and navigates days', async () => {
    renderPage();
    await screen.findByText('Today todo');
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByTestId('loc')).toHaveTextContent(`?date=${addDays(today, 1)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/planner');
    expect(screen.getByTestId('loc').textContent).not.toContain('date=');
  });

  it('restores the selected day from the URL and shows an empty state', async () => {
    const day = addDays(today, 5);
    renderPage(`/planner?date=${day}`);
    expect(await screen.findByText('Nothing planned for this day')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to date')).toHaveValue(day);
  });

  it('ignores an invalid date param', async () => {
    renderPage('/planner?date=nonsense');
    expect(await screen.findByText('Today todo')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to date')).toHaveValue(today);
  });

  it('week strip marks today, shows counts and selects a day', async () => {
    renderPage();
    await screen.findByText('Today todo');
    const week = screen.getByRole('group', { name: 'Week overview' });
    const todayBtn = within(week).getByRole('button', { name: /2 tasks, today/ });
    expect(todayBtn).toHaveAttribute('aria-current', 'date');
    expect(todayBtn).toHaveAttribute('aria-pressed', 'true');
    const later = within(week).getAllByRole('button').find((b) => /1 task\b/.test(b.getAttribute('aria-label')!))!;
    fireEvent.click(later);
    expect(screen.getByTestId('loc')).toHaveTextContent('date=');
  });

  it('opens the task dialog for the selected day', async () => {
    renderPage(`/planner?date=${addDays(today, 3)}`);
    await screen.findByText('Nothing planned for this day');
    fireEvent.click(screen.getAllByRole('button', { name: /Add task/ })[0]);
    expect(open).toHaveBeenCalledWith({ kind: 'task', defaultDate: addDays(today, 3) });
  });

  it('shows an error with retry when tasks fail to load', async () => {
    failTasks = true;
    renderPage();
    expect(await screen.findByText("Couldn't load your tasks")).toBeInTheDocument();
    expect(screen.getAllByText('Database is down').length).toBeGreaterThan(0);
    failTasks = false;
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
    expect(await screen.findByText('Today todo')).toBeInTheDocument();
  });

  it('validates and saves the daily target', async () => {
    renderPage();
    const input = await screen.findByLabelText('Daily target (minutes)');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter whole minutes from 0 to 1440.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false);
    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH');
      expect(call?.[0]).toBe('/api/profile');
      expect(JSON.parse(call![1].body)).toEqual({ dailyStudyTargetMinutes: 90 });
    });
  });
});
