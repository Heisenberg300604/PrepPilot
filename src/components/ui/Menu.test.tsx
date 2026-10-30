import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

afterEach(cleanup);

const setup = (over: Partial<Parameters<typeof Menu>[0]> = {}) => {
  const a = vi.fn();
  const b = vi.fn();
  const c = vi.fn();
  render(
    <Menu
      label="More actions"
      trigger={<span>⋯</span>}
      items={[
        { label: 'Edit', onSelect: a },
        { label: 'Archive', onSelect: b, disabled: true },
        { label: 'Delete', onSelect: c, danger: true },
      ]}
      {...over}
    />,
  );
  return { a, b, c, trigger: screen.getByRole('button', { name: 'More actions' }) };
};

describe('Menu', () => {
  it('is collapsed by default and exposes menu semantics on the trigger', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click and focuses the first enabled item', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('moves focus with arrow keys, skipping disabled items and wrapping', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus(); // Archive disabled
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on outside click', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs the selected action and closes', () => {
    const { a, c, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(c).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not run disabled items', () => {
    const { b, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(b).not.toHaveBeenCalled();
  });

  it('does not bubble clicks to a clickable parent (cards)', () => {
    const parent = vi.fn();
    render(
      <div onClick={parent}>
        <Menu label="Row menu" trigger="x" items={[{ label: 'Go', onSelect: () => undefined }]} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Row menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }));
    expect(parent).not.toHaveBeenCalled();
  });
});
