import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared page edges and container queries for routes inside AppLayout. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="page-shell"><div className="page-grid">{children}</div></div>;
}

export function PageHeader({ title, children, actions, breadcrumb }: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return <header className="page-header">
    {breadcrumb && <div className="page-breadcrumb">{breadcrumb}</div>}
    <div className="page-heading">
      <h1 className="text-2xl font-medium">{title}</h1>
      {children}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function PageBody({ children, width = 'full', className }: {
  children: ReactNode;
  width?: 'full' | 'list' | 'form';
  className?: string;
}) {
  return <div className={cn('page-body', `page-body-${width}`, className)}>{children}</div>;
}
