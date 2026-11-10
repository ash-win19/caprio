import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function PublicHeader() {
  return <header className="absolute inset-x-0 top-0 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 md:px-6">
    <Link to="/" aria-label="Caprio home"><Logo /></Link>
  </header>;
}
