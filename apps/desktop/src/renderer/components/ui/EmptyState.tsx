import type { ReactNode } from 'react';

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      {icon && <div className="ui-empty-state__icon" aria-hidden="true">{icon}</div>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
}
