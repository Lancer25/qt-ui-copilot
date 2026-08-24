import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  children?: ReactNode;
};

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  const classes = ['ui-badge', `ui-badge--${tone}`, className].filter(Boolean).join(' ');
  return <span className={classes} {...props}>{children}</span>;
}
