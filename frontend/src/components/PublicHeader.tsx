import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function PublicHeader({ step, back }: { step?: string; back?: { href: string; label: string } }) {
  return <header className="absolute inset-x-0 top-0 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 md:px-6">
    <Link to="/" aria-label="Caprio home"><Logo /></Link>
    {step && <span className="text-xs text-muted-foreground">{step}</span>}
    {back && <Link to={back.href} className="text-sm text-muted-foreground hover:text-foreground">{back.label}</Link>}
  </header>;
}
