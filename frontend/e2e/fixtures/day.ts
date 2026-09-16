import type { Page } from '@playwright/test';
import type { BackendTask, Workflow } from '../../src/lib/api';

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
  proposal?: Workflow['proposal'];
  messages?: Workflow['messages'];
  oldestUnclosedDate?: string;
} = {}) {
  const tasks = options.tasks ?? tasksForDay();
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
  await page.addInitScript((collapsed) => {
    localStorage.setItem('caprio_session', 'demo');
    localStorage.setItem('caprio-sidebar', JSON.stringify({ state: { collapsed }, version: 0 }));
  }, options.collapsed ?? true);
  // All API calls stay in the browser fixture; no backend or account is required.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
        version: 1, messages: options.messages ?? [], proposal: options.proposal ?? null, availableMinutes: 220,
        tasks, backlog: [], review: options.state === 'closed'
          ? { completedCount: 1, carriedToTomorrowCount: 1, droppedCount: 1, notes: null, energyLevel: null } : null,
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
