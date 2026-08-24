import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement;
};

export function Field({ label, hint, error, children }: FieldProps) {
  const generatedId = useId();
  const childProps = children.props as { id?: string; 'aria-describedby'?: string };
  const inputId = typeof childProps.id === 'string' ? childProps.id : generatedId;
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [childProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: inputId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      } as Partial<HTMLElement>)
    : children;

  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={inputId}>{label}</label>}
      {control}
      {hint && <div className="ui-field__hint" id={hintId}>{hint}</div>}
      {error && <div className="ui-field__error" id={errorId} role="alert">{error}</div>}
    </div>
  );
}
