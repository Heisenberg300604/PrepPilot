import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './Button';
import { Checkbox, SelectField, TextArea, TextField } from './Form';
import { Segmented } from './Layout';

afterEach(cleanup);

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Exam name" />);
    expect(screen.getByLabelText('Exam name')).toBeInTheDocument();
  });
  it('links error text via aria-invalid + aria-describedby and announces it', () => {
    render(<TextField label="Exam name" error="Name is required" />);
    const input = screen.getByLabelText('Exam name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Name is required');
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });
  it('shows the hint when there is no error, and hides it when there is', () => {
    const { rerender } = render(<TextField label="Minutes" hint="Whole minutes" />);
    expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Whole minutes');
    expect(screen.getByLabelText('Minutes')).not.toHaveAttribute('aria-invalid');
    rerender(<TextField label="Minutes" hint="Whole minutes" error="Too big" />);
    expect(screen.queryByText('Whole minutes')).toBeNull();
    expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Too big');
  });
  it('marks optional fields', () => {
    render(<TextField label="Notes" optional />);
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });
  it('gives each instance a unique id', () => {
    render(
      <>
        <TextField label="A" />
        <TextField label="B" />
      </>,
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});

describe('TextArea / SelectField / Checkbox', () => {
  it('render labelled controls', () => {
    const onChange = vi.fn();
    render(
      <>
        <TextArea label="Description" />
        <SelectField label="Subject" onChange={onChange}>
          <option value="">None</option>
          <option value="m">Maths</option>
        </SelectField>
        <Checkbox label="Remember me" />
      </>,
    );
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'm' } });
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Remember me')).toHaveAttribute('type', 'checkbox');
  });
});

describe('Button / IconButton', () => {
  it('loading state disables the button and sets aria-busy', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
  });
  it('IconButton exposes its label as the accessible name', () => {
    render(<IconButton label="Delete task">×</IconButton>);
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument();
  });
});

describe('Segmented', () => {
  it('marks the selected option with aria-pressed and reports changes', () => {
    const onChange = vi.fn();
    render(<Segmented label="Filter" value="all" onChange={onChange} options={[{ value: 'all', label: 'All', count: 3 }, { value: 'done', label: 'Done' }]} />);
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('done');
  });
});
