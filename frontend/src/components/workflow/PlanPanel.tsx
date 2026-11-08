import type { ComponentProps } from 'react';
import { ListChecks } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import type { PlanView } from '@/lib/api';
import { PlanCard, planChangeCount, planTitle } from './PlanCard';

type CardProps = Omit<ComponentProps<typeof PlanCard>, 'onClose'>;

// Beside the chat on wide screens; a bottom sheet behind the pill otherwise.
export function PlanPanel({ wide, open, onOpenChange, ...card }: CardProps & { wide: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const title = planTitle(card.date);
  if (wide) {
    return open ? <aside aria-label={title} className="plan-panel">
      <PlanCard {...card} onClose={() => onOpenChange(false)} />
    </aside> : null;
  }
  return <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
    <DrawerContent className="max-h-[85vh]">
      <DrawerTitle className="sr-only">{title}</DrawerTitle>
      <div className="min-h-0 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><PlanCard {...card} /></div>
    </DrawerContent>
  </Drawer>;
}

export function PlanPill({ plan, expanded, onClick }: { plan: PlanView; expanded: boolean; onClick: () => void }) {
  const changes = planChangeCount(plan);
  const label = changes ? `Plan · ${changes} ${changes === 1 ? 'change' : 'changes'}` : 'Plan';
  return <button type="button" onClick={onClick} aria-expanded={expanded} aria-haspopup="dialog"
    className="mb-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/30 bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent max-md:min-h-11">
    <ListChecks size={14} aria-hidden className="text-primary" />{label}
  </button>;
}
