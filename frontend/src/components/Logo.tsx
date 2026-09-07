import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

// The single source of the Caprio brand mark. Every surface (landing, app
// sidebars, auth screens) renders this so the logo never drifts between pages.
const MARK_PATH =
  'M16 6 H48 A6 6 0 0 1 54 12 C54 26 46 34 32 44 C46 54 54 62 54 76 A6 6 0 0 1 48 82 H16 A6 6 0 0 1 10 76 C10 62 18 54 32 44 C18 34 10 26 10 12 A6 6 0 0 1 16 6 Z';

export function CaprioMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 88"
      fill="none"
      role="img"
      aria-label="Caprio"
      {...props}
      className={cn('h-5 w-auto shrink-0 text-foreground', className)}
    >
      <g fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK_PATH} fill="none" strokeWidth="7" />
        <path d="M22 78 L32 62 L42 78 Z" stroke="none" />
      </g>
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CaprioMark aria-hidden="true" className={markClassName} />
      <span className={cn('text-[17px] font-semibold tracking-[-0.04em] text-foreground', wordmarkClassName)}>caprio</span>
    </span>
  );
}
