import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShell {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}

function Shell({ id, label, hint, error, optional, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
const describedBy = (id: string, hint?: ReactNode, error?: string | null) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef<HTMLInputElement, FieldShell & InputHTMLAttributes<HTMLInputElement>>(function TextField({ label, hint, error, optional, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input ref={ref} id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ label, hint, error, optional, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea ref={ref} id={id} className="input textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, FieldShell & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField({ label, hint, error, optional, children, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select ref={ref} id={id} className="input select" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {children}
      </select>
    </Shell>
  );
});

export function Checkbox({ label, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
