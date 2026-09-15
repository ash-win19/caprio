import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AppTopBar } from './AppTopBar';

/** Shared page edges and container queries for routes inside AppLayout. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="page-shell"><div className="page-grid">{children}</div></div>;
}

export function PageHeader({ children, ...props }: ComponentProps<typeof AppTopBar> & { children?: ReactNode }) {
  return <><AppTopBar {...props} />{children && <div className="page-header-details">{children}</div>}</>;
}

export function PageBody({ children, width = 'full', className }: {
  children: ReactNode;
  width?: 'full' | 'list' | 'form';
  className?: string;
}) {
  return <div className={cn('page-body', `page-body-${width}`, className)}>{children}</div>;
}
