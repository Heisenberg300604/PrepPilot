import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('opens as a labelled, described dialog', () => {
    render(
      <Dialog title="Create exam" description="Name your exam." onClose={() => undefined}>
        <p>Body</p>
      </Dialog>,
    );
    const d = screen.getByRole('dialog', { name: 'Create exam' });
    expect(d).toHaveAttribute('open');
    expect(d).toHaveAccessibleDescription('Name your exam.');
  });

  it('closes via the close button, Escape (cancel event) and backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="T" onClose={onClose}>
        x
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    const d = screen.getByRole('dialog');
    const cancel = new Event('cancel', { cancelable: true });
    act(() => void d.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true); // we control closing, never the browser
    fireEvent.mouseDown(d);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on clicks inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="T" onClose={onClose}>
        <button>inside</button>
      </Dialog>,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot be dismissed while busy', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="T" onClose={onClose} busy>
        x
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    act(() => void screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the footer', () => {
    render(
      <Dialog title="T" onClose={() => undefined} footer={<button>Save</button>}>
        x
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('awaits the confirm handler, then closes', async () => {
    const onClose = vi.fn();
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete" danger onConfirm={onConfirm} onClose={onClose}>
        This cannot be undone.
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled(); // still in flight
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => resolve());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('stays open and re-enables on rejection so the user can retry', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose}>
        body
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('cancel closes without confirming', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose}>
        body
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
