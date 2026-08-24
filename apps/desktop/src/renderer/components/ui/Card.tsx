import type { HTMLAttributes, ReactNode } from 'react';

export type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: 'default' | 'interactive' | 'outlined';
  children?: ReactNode;
};

export function Card({ variant = 'default', className, children, ...props }: CardProps) {
  const classes = ['ui-card', `ui-card--${variant}`, className].filter(Boolean).join(' ');
  return <section className={classes} {...props}>{children}</section>;
}
