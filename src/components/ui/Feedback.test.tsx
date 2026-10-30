import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismiss, toast } from '@/lib/toast';
import { EmptyState, ErrorState, PageLoading, Progress, StatusBadge, Toaster } from './Feedback';
import { Inbox } from 'lucide-react';

afterEach(cleanup);

describe('Progress', () => {
  it('exposes aria values', () => {
    render(<Progress value={42} label="Exam progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Exam progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });
  it.each([
    [-20, '0'],
    [250, '100'],
    [NaN, '0'],
    [Infinity, '0'],
    [33.6, '34'],
  ])('clamps %s to %s and never renders NaN', (input, expected) => {
    const { container } = render(<Progress value={input} label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', expected);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe('StatusBadge', () => {
  it.each([
    ['NOT_STARTED', 'Not started'],
    ['IN_PROGRESS', 'In progress'],
    ['COMPLETED', 'Completed'],
  ] as const)('shows text and an icon for %s (not colour alone)', (status, text) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('EmptyState / ErrorState / PageLoading', () => {
  it('renders title, text and action', () => {
    render(<EmptyState icon={Inbox} title="Nothing here" action={<button>Add one</button>}>Start by adding something.</EmptyState>);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('Start by adding something.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument();
  });
  it('ErrorState announces the message and retries', () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error('Server exploded')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('ErrorState has no retry button without a handler and tolerates non-Error values', () => {
    render(<ErrorState error="boom" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
  });
  it('PageLoading is a polite status region', () => {
    render(<PageLoading label="Loading your plan…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your plan…');
  });
});

describe('Toaster', () => {
  const ids: number[] = [];
  afterEach(() => {
    ids.splice(0).forEach(dismiss);
  });

  it('announces success politely and errors as alerts, and can be dismissed', () => {
    render(<Toaster />);
    act(() => {
      ids.push(toast.success('Task added'), toast.error('Could not save'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Task added');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-live', 'polite');

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[1]);
    });
    expect(screen.queryByText('Could not save')).toBeNull();
    expect(screen.getByText('Task added')).toBeInTheDocument();
  });

  it('runs a toast action and dismisses it', () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      ids.push(toast.info('Deleted', { label: 'Undo', onClick: undo }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Deleted')).toBeNull();
  });
});
