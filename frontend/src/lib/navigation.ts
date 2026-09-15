import { LayoutGrid, Inbox, CheckSquare, History, MessageSquare } from 'lucide-react';
import { useWorkflow } from './queries';
import { useLocalDay } from './useLocalDay';

export const NAV_ITEMS = [
  { label: 'Today', path: '/today', icon: LayoutGrid },
  { label: 'Plan', path: '/new', icon: MessageSquare },
  { label: 'Inbox', path: '/capture', icon: Inbox },
  { label: 'Review', path: '/review', icon: CheckSquare },
  { label: 'History', path: '/momentum', icon: History },
];

export function useReviewNav() {
  const today = useLocalDay();
  const todayWorkflow = useWorkflow(today);
  const reviewDate = todayWorkflow.data?.oldestUnclosedDate || today;
  const reviewWorkflow = useWorkflow(reviewDate);
  const recovering = reviewDate < today;
  const reviewPath = recovering ? `/review?date=${reviewDate}&reopen=1` : '/review';
  const tasks = reviewWorkflow.data?.tasks || [];
  const reviewPending = reviewWorkflow.data?.state !== 'closed' && (recovering || reviewWorkflow.data?.state === 'active' || tasks.length > 0);
  const unfinished = tasks.filter((task) => !task.completed).length;
  return { reviewPath, reviewPending, unfinished };
}
