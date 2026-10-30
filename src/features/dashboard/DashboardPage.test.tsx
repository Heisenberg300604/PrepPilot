import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, stubApi } from '@/features/library/testUtils';
import type { Dashboard, Exam, StudyTask, Video } from '@/lib/types';
import DashboardPage, { firstName, isFirstRun } from './DashboardPage';
import { examCountdown } from './ExamCard';
import { describeActivity } from './ActivityList';

const stats = (total: number, completed: number) => ({ total, completed, inProgress: 0, remaining: total - completed, percent: total ? Math.round((completed / total) * 100) : 0 });
const exam: Exam = { id: 'e1', name: 'CDS 2027', description: null, examDate: null, status: 'ACTIVE', color: null, icon: null, displayOrder: 0, subjectCount: 2, stats: stats(8, 2), createdAt: '', updatedAt: '' };
const task: StudyTask = { id: 't1', title: 'Revise algebra', description: null, scheduledDate: '2027-01-01', estimatedDurationMinutes: 45, status: 'TODO', completedAt: null, exam: null, subject: null, folder: null, video: null, playlist: null };
const video = { id: 'v1', title: 'Quadratics', status: 'IN_PROGRESS', lastPositionSeconds: 60, durationSeconds: 600, favorite: false, availabilityStatus: 'AVAILABLE', location: null } as Video;

const base = (over: Partial<Dashboard> = {}): Dashboard => ({
  displayName: 'Asha Rao',
  dailyStudyTargetMinutes: 120,
  overview: { activeExams: 0, totalVideos: 0, completedVideos: 0, remainingVideos: 0, percent: 0, todayTasks: 0, todayTasksDone: 0 },
  exams: [],
  continueStudying: [],
  today: { date: '2027-01-01', tasks: [], plannedMinutes: 0, completedPlannedMinutes: 0, targetMinutes: 120, targetPercent: 0, overdueCount: 0, upcomingCount: 0 },
  ...over,
});

const routes = (dash: Dashboard) => ({
  'GET /api/dashboard': dash,
  'GET /api/meta': { features: { youtubeImport: false } },
  'GET /api/activity': [],
});

describe('DashboardPage', () => {
  it('shows a guided first-run card instead of zeros for brand-new users', async () => {
    stubApi(routes(base()));
    renderApp(<DashboardPage />);
    expect(await screen.findByRole('heading', { name: "Let's set up your first exam" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guided setup' })).toHaveAttribute('href', '/onboarding');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/, Asha$/);
    expect(screen.queryByText('Active exams')).not.toBeInTheDocument();
  });

  it('renders real numbers, exams, continue-studying and today’s plan when populated', async () => {
    stubApi(
      routes(
        base({
          overview: { activeExams: 1, totalVideos: 8, completedVideos: 2, remainingVideos: 6, percent: 25, todayTasks: 1, todayTasksDone: 0 },
          exams: [exam],
          continueStudying: [video],
          today: { date: '2027-01-01', tasks: [task], plannedMinutes: 45, completedPlannedMinutes: 0, targetMinutes: 120, targetPercent: 0, overdueCount: 2, upcomingCount: 0 },
        }),
      ),
    );
    renderApp(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'CDS 2027' })).toHaveAttribute('href', '/exams/e1');
    expect(screen.getByText('Unique videos').parentElement).toHaveTextContent('8');
    expect(screen.getByText('Remaining').parentElement).toHaveTextContent('6');
    expect(screen.getByText("Today's tasks").parentElement).toHaveTextContent('0/1');
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Resume at 1:00' })).toBeInTheDocument();
    expect(screen.getByText('Revise algebra')).toBeInTheDocument();
    expect(screen.getByText('2 overdue tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import playlist/ })).toBeInTheDocument();
    expect(await screen.findByText('Needs YouTube API key')).toBeInTheDocument();
  });

  it('shows an error with retry when the API fails', async () => {
    stubApi({ 'GET /api/dashboard': { __status: 500, error: { code: 'INTERNAL', message: 'Boom' } }, 'GET /api/meta': { features: { youtubeImport: true } } });
    renderApp(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('dashboard helpers', () => {
  it('detects first run', () => {
    expect(isFirstRun(base())).toBe(true);
    expect(isFirstRun(base({ exams: [exam] }))).toBe(false);
    expect(isFirstRun(base({ today: { ...base().today, tasks: [task] } }))).toBe(false);
  });
  it('formats first names and exam countdowns', () => {
    expect(firstName('  Asha  Rao ')).toBe('Asha');
    expect(firstName(null)).toBeNull();
    expect(examCountdown(null, '2027-01-01')).toBeNull();
    expect(examCountdown('2027-01-01', '2027-01-01')).toBe('Exam is today');
    expect(examCountdown('2027-01-11', '2027-01-01')).toBe('10 days left');
    expect(examCountdown('2026-12-01', '2027-01-01')).toBe('Exam date has passed');
  });
  it('describes only genuine activity and degrades gracefully for deleted targets', () => {
    expect(describeActivity({ id: 'a', type: 'VIDEO_COMPLETED', createdAt: '', video: { id: 'v', title: 'T' }, playlist: null })).toEqual({ verb: 'Completed', target: 'T', to: '/watch/v' });
    expect(describeActivity({ id: 'a', type: 'VIDEO_OPENED', createdAt: '', video: null, playlist: null }).to).toBeNull();
    expect(describeActivity({ id: 'a', type: 'EXAM_CREATED', createdAt: '', video: null, playlist: null }).target).toBeNull();
  });
});
