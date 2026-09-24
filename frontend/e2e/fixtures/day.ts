import type { Page } from '@playwright/test';
import type { BackendTask, PlanItem, PlanView, Workflow } from '../../src/lib/api';

export const date = '2026-09-14';
export const titles = [
  'Define a complete workflow within the platform',
  'Create product research document on Towny',
  'Analyze how slides can compete with Towny',
];

export function tasksForDay(): BackendTask[] {
  return titles.map((title, i) => ({
    id: `task-${i}`, userId: 'demo', title, duration: [40, 90, 90][i], urgency: 'medium',
    source: 'manual', completed: false, sortOrder: i, plannedForDate: date,
    status: 'planned', deferCount: 0, createdAt: date, updatedAt: date,
    priorityReason: 'Protect a focused block of time for this priority.',
  }));
}

export async function mockDay(page: Page, options: {
  collapsed?: boolean;
  tasks?: BackendTask[];
  state?: Workflow['state'];
  plan?: Workflow['plan'];
  messages?: Workflow['messages'];
  oldestUnclosedDate?: string;
  carryoverOrigins?: Record<string, string>;
  firstVisit?: boolean;
  opener?: string;
} = {}) {
  const tasks = options.tasks ?? tasksForDay();
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
  await page.addInitScript(({ collapsed, firstVisit, date }) => {
    localStorage.setItem('caprio_session', 'demo');
    localStorage.setItem('caprio-sidebar', JSON.stringify({ state: { collapsed }, version: 0 }));
    if (!firstVisit && !localStorage.getItem('caprio_day_entry:demo')) localStorage.setItem('caprio_day_entry:demo', date);
  }, { collapsed: options.collapsed ?? true, firstVisit: options.firstVisit ?? false, date });
  // All API calls stay in the browser fixture; no backend or account is required.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/day/rollover') {
      await route.fulfill({ json: null });
      return;
    }
    if (request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, body });
      if (request.method() === 'PATCH') {
        const task = tasks.find((item) => url.pathname.endsWith(`/${item.id}`));
        if (task) {
          Object.assign(task, body);
          await route.fulfill({ json: task });
          return;
        }
      }
      if (url.pathname === '/api/tasks/reorder') {
        for (const order of body.tasks) {
          const task = tasks.find((item) => item.id === order.id);
          if (task) task.sortOrder = order.sortOrder;
        }
        tasks.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      await route.fulfill({ json: {} });
      return;
    }
    if (url.pathname === '/api/bootstrap') {
      await route.fulfill({ json: {
        user: { id: 'demo', name: 'Demo', email: 'demo@example.com' }, onboardingComplete: true,
        preferences: { briefTime: '08:00' }, categories: [], todayTasks: tasks, backlog: [], streak: 0,
      } });
    } else if (url.pathname === '/api/workflow') {
      const requestedDate = url.searchParams.get('date');
      await route.fulfill({ json: {
        date: requestedDate, oldestUnclosedDate: options.oldestUnclosedDate ?? null, state: requestedDate === date ? options.state ?? 'active' : 'planning',
        version: 1, messages: options.messages ?? [], plan: options.plan ?? null, availableMinutes: 220,
        tasks, backlog: [], review: options.state === 'closed'
          ? { completedCount: 1, carriedToTomorrowCount: 1, droppedCount: 1, notes: null, energyLevel: null } : null,
        carryoverOrigins: options.carryoverOrigins ?? {},
        ...(requestedDate === date && options.opener ? { opener: options.opener } : {}),
      } });
    } else if (url.pathname === '/api/tasks') {
      await route.fulfill({ json: { tasks } });
    } else if (url.pathname === '/api/chat/sessions') {
      await route.fulfill({ json: { sessions: [{ sessionDate: date, title: 'A focused day', messageCount: 2, updatedAt: date, state: 'active' }] } });
    } else {
      await route.abort();
    }
  });
  return writes;
}

// A plan view as the backend returns it: saved work with the draft applied.
export function planView(today: PlanItem[], extra: Partial<PlanView> = {}): PlanView {
  const counts = { new: 0, edited: 0, moved: 0, removed: 0, carried: 0 };
  for (const item of [...today, ...(extra.carried ?? []), ...(extra.otherDays ?? [])]) {
    if (item.badge === 'new') counts.new++;
    if (item.badge === 'edited' || item.badge === 'done') counts.edited++;
    if (item.badge === 'moved') counts.moved++;
    if (item.badge === 'removed') counts.removed++;
  }
  counts.carried = (extra.carried ?? []).filter(item => item.badge !== 'removed').length;
  return { draftId: 'draft-1', today, carried: [], otherDays: [], doneCount: 0, counts, ...extra };
}

// On narrow screens the plan sits behind a pill; open it before using it.
export async function openPlan(page: Page) {
  const pill = page.getByRole('button', { name: /^Plan( ·|$)/ });
  if (await pill.isVisible()) await pill.click();
  return page.getByRole('region', { name: 'Proposed plan' });
}
