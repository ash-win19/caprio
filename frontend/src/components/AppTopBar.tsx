import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TopBarHost } from '@/lib/topbar';

export function AppTopBar({ title, actions, status }: {
  title: string;
  actions?: ReactNode;
  status?: string;
}) {
  const host = useContext(TopBarHost);
  const content = <>
    <div className="topbar-page">
      <h1>{title}</h1>
      {status && <span className="topbar-status">{status}</span>}
    </div>
    {actions && <div className="topbar-actions">{actions}</div>}
  </>;
  if (host === undefined) return <header className="app-topbar">{content}</header>;
  return host ? createPortal(content, host) : null;
}
